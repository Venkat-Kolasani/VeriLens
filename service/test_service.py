"""One runnable check per non-trivial path. Run: python test_service.py

Uses synthetic images so there are no fixtures to ship and the assertions
are deterministic.
"""

import hashlib
import io

import cv2
import nacl.signing
import numpy as np
from PIL import Image

from attestation import issue_nonce, verify_attestation
from config import CFG
from judge import judge
from lanes import (
    estimate_jpeg_quality,
    lane_b_noise,
    lane_c_compression,
    load_image,
    quality_gate,
)

rng = np.random.default_rng(0)


def _jpeg_bytes(arr: np.ndarray, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def _textured(h=512, w=512) -> np.ndarray:
    """Noisy textured image - stands in for real sensor output."""
    base = rng.integers(60, 200, size=(h, w), dtype=np.uint8)
    base = cv2.GaussianBlur(base, (3, 3), 0)
    noise = rng.normal(0, 8, size=(h, w))
    out = np.clip(base.astype(np.float64) + noise, 0, 255).astype(np.uint8)
    return np.stack([out] * 3, axis=2)


def test_jpeg_quality_roundtrip():
    for q in (60, 75, 92):
        pil = Image.open(io.BytesIO(_jpeg_bytes(_textured(256, 256), q)))
        est = estimate_jpeg_quality(pil)
        assert est is not None, "JPEG must report a quality"
        assert abs(est - q) <= 8, f"quality estimate {est} too far from {q}"
    # PNG has no quantization table -> must return None, not a guess
    buf = io.BytesIO()
    Image.fromarray(_textured(256, 256)).save(buf, format="PNG")
    assert estimate_jpeg_quality(Image.open(buf)) is None
    print("ok  jpeg quality estimation")


def test_quality_gate_rejects_unreadable():
    tiny = _jpeg_bytes(_textured(120, 120))
    pil, bgr = load_image(tiny)
    q = quality_gate(pil, bgr)
    assert not q.usable, "120px image must not be judged"
    assert any("Resolution too low" in r for r in q.reasons)

    blurred = cv2.GaussianBlur(_textured(512, 512), (31, 31), 0)
    pil, bgr = load_image(_jpeg_bytes(blurred))
    q = quality_gate(pil, bgr)
    assert not q.usable, "heavily blurred image must not be judged"
    print("ok  quality gate rejects unreadable images")


def test_abstains_on_unreadable():
    pil, bgr = load_image(_jpeg_bytes(_textured(120, 120)))
    q = quality_gate(pil, bgr)
    v = judge(q, [lane_b_noise(bgr), lane_c_compression(pil, bgr)])
    assert v.authenticity == "INSUFFICIENT_EVIDENCE", v.authenticity
    assert v.decision == "REVIEW", v.decision
    assert v.confidence == 0.0
    print("ok  judge abstains instead of guessing")


def test_lane_b_flags_synthetic_smooth_patch():
    """A pasted, denoised region is the signature Lane B exists to catch."""
    img = _textured(512, 512)
    patch = cv2.GaussianBlur(img[160:360, 160:360], (0, 0), sigmaX=4)
    spliced = img.copy()
    spliced[160:360, 160:360] = patch

    _, bgr_clean = load_image(_jpeg_bytes(img))
    _, bgr_spliced = load_image(_jpeg_bytes(spliced))

    clean = lane_b_noise(bgr_clean)
    dirty = lane_b_noise(bgr_spliced)
    assert dirty.score > clean.score, f"spliced {dirty.score} must exceed clean {clean.score}"
    assert dirty.box is not None, "a flagged region must be localised"
    print(f"ok  lane B: clean={clean.score:.2f} spliced={dirty.score:.2f}")


def test_uncertainty_band_abstains():
    """A score between real_below and fake_above must not be forced either way."""
    from lanes import LaneResult

    mid = (CFG.real_below + CFG.fake_above) / 2
    pil, bgr = load_image(_jpeg_bytes(_textured(512, 512)))
    q = quality_gate(pil, bgr)
    assert q.usable, "control image should be readable"
    lanes = [
        LaneResult("B", "Noise residual", mid, 0.8),
        LaneResult("C", "Compression / ELA", mid, 0.8),
    ]
    v = judge(q, lanes)
    assert v.authenticity == "INSUFFICIENT_EVIDENCE", v.authenticity
    assert any("uncertainty band" in r.text for r in v.reasons)
    print("ok  uncertainty band abstains")


def test_lane_disagreement_abstains():
    from lanes import LaneResult

    pil, bgr = load_image(_jpeg_bytes(_textured(512, 512)))
    q = quality_gate(pil, bgr)
    lanes = [
        LaneResult("B", "Noise residual", 0.05, 0.9),
        LaneResult("C", "Compression / ELA", 0.95, 0.9),
    ]
    v = judge(q, lanes)
    assert v.authenticity == "INSUFFICIENT_EVIDENCE", v.authenticity
    assert any("disagree" in r.text for r in v.reasons)
    print("ok  conflicting lanes abstain")


def test_attestation_never_lowers():
    """Absence of attestation must not be treated as evidence of fakery."""
    from lanes import LaneResult

    pil, bgr = load_image(_jpeg_bytes(_textured(512, 512)))
    q = quality_gate(pil, bgr)
    lanes = [
        LaneResult("B", "Noise residual", 0.05, 0.8),
        LaneResult("C", "Compression / ELA", 0.10, 0.8),
    ]
    plain = judge(q, lanes, attested=False)
    signed = judge(q, lanes, attested=True)
    assert plain.authenticity == "REAL" == signed.authenticity
    assert signed.confidence >= plain.confidence, "attestation must not reduce confidence"
    print(f"ok  attestation raises only: {plain.confidence:.2f} -> {signed.confidence:.2f}")


def test_identity_axis_independent():
    """A real photo of the wrong person must still fail."""
    from lanes import LaneResult

    pil, bgr = load_image(_jpeg_bytes(_textured(512, 512)))
    q = quality_gate(pil, bgr)
    lanes = [
        LaneResult("B", "Noise residual", 0.05, 0.8),
        LaneResult("C", "Compression / ELA", 0.10, 0.8),
    ]
    v = judge(q, lanes, face_similarity=0.05)
    assert v.authenticity == "REAL", v.authenticity
    assert v.identity == "MISMATCH", v.identity
    assert v.decision == "REJECT", "authentic pixels + wrong face must reject"
    print("ok  identity axis is independent of authenticity")


def test_low_quality_face_needs_wider_match_margin():
    """A similarity that clears face_match_above off a low-res crop (e.g. a
    small ID-document photo) must NOT be treated as confidently as the same
    score off a full-resolution face -- it needs face_match_low_quality_margin
    of extra headroom, else INDETERMINATE (never a silent downgrade to
    MISMATCH -- an unreliable signal is unknown, not evidence of the negative).
    """
    from lanes import LaneResult

    pil, bgr = load_image(_jpeg_bytes(_textured(512, 512)))
    q = quality_gate(pil, bgr)
    lanes = [
        LaneResult("B", "Noise residual", 0.05, 0.8),
        LaneResult("C", "Compression / ELA", 0.10, 0.8),
    ]
    marginal_sim = CFG.face_match_above + 0.02  # clears the normal bar...
    assert marginal_sim < CFG.face_match_above + CFG.face_match_low_quality_margin  # ...not the wide one

    v_normal = judge(q, lanes, face_similarity=marginal_sim, low_quality_face=False)
    assert v_normal.identity == "MATCH", v_normal.identity

    v_low_quality = judge(q, lanes, face_similarity=marginal_sim, low_quality_face=True)
    assert v_low_quality.identity == "INDETERMINATE", v_low_quality.identity

    # comfortably above even the widened bar: low-res crop shouldn't matter
    strong_sim = CFG.face_match_above + CFG.face_match_low_quality_margin + 0.05
    v_strong = judge(q, lanes, face_similarity=strong_sim, low_quality_face=True)
    assert v_strong.identity == "MATCH", v_strong.identity
    print("ok  low-quality face crop needs a wider match margin")



def test_pair_without_face_match_never_accepts():
    """A KYC pair check that cannot verify the face must not ACCEPT.

    identity=None means "not applicable" (single image). For a pair it is
    "unverified", which is a review case, not a pass.
    """
    from lanes import LaneResult

    pil, bgr = load_image(_jpeg_bytes(_textured(512, 512)))
    q = quality_gate(pil, bgr)
    lanes = [
        LaneResult("B", "Noise residual", 0.05, 0.8),
        LaneResult("C", "Compression / ELA", 0.10, 0.8),
    ]
    v = judge(q, lanes, face_similarity=None, require_identity=True)
    assert v.authenticity == "REAL", v.authenticity
    assert v.identity == "INDETERMINATE", v.identity
    assert v.decision == "REVIEW", "unverified identity must not accept"
    # single-image path is unaffected: identity genuinely does not apply
    single = judge(q, lanes, face_similarity=None, require_identity=False)
    assert single.identity is None and single.decision == "ACCEPT"
    print("ok  pair without face match routes to REVIEW")


def test_attestation_verifies_valid_signature():
    """A correctly signed nonce+subject-hash must verify."""
    subject_sha256 = hashlib.sha256(b"some image bytes").hexdigest()
    n = issue_nonce()
    key = nacl.signing.SigningKey.generate()
    message = bytes.fromhex(n["nonce"]) + bytes.fromhex(subject_sha256)
    sig = key.sign(message).signature.hex()
    pub = key.verify_key.encode().hex()

    ok, reason = verify_attestation(n["nonce"], sig, pub, subject_sha256)
    assert ok, reason
    print("ok  valid attestation verifies")


def test_attestation_nonce_is_single_use():
    subject_sha256 = hashlib.sha256(b"some image bytes").hexdigest()
    n = issue_nonce()
    key = nacl.signing.SigningKey.generate()
    message = bytes.fromhex(n["nonce"]) + bytes.fromhex(subject_sha256)
    sig = key.sign(message).signature.hex()
    pub = key.verify_key.encode().hex()

    ok1, _ = verify_attestation(n["nonce"], sig, pub, subject_sha256)
    ok2, reason2 = verify_attestation(n["nonce"], sig, pub, subject_sha256)
    assert ok1 and not ok2, "replaying the same nonce must fail"
    print("ok  nonce is single-use")


def test_attestation_rejects_unknown_nonce():
    subject_sha256 = hashlib.sha256(b"some image bytes").hexdigest()
    key = nacl.signing.SigningKey.generate()
    message = bytes.fromhex("00" * 32) + bytes.fromhex(subject_sha256)
    sig = key.sign(message).signature.hex()
    pub = key.verify_key.encode().hex()

    ok, reason = verify_attestation("ab" * 32, sig, pub, subject_sha256)
    assert not ok, "a made-up nonce must never verify"
    print("ok  unknown nonce rejected")


def test_attestation_rejects_wrong_signature():
    subject_sha256 = hashlib.sha256(b"some image bytes").hexdigest()
    other_sha256 = hashlib.sha256(b"different image bytes").hexdigest()

    n = issue_nonce()
    key = nacl.signing.SigningKey.generate()
    message = bytes.fromhex(n["nonce"]) + bytes.fromhex(subject_sha256)
    sig = key.sign(message).signature.hex()
    pub = key.verify_key.encode().hex()
    # tampered subject hash: signature no longer covers this message
    ok, _ = verify_attestation(n["nonce"], sig, pub, other_sha256)
    assert not ok, "signature over a different subject hash must fail"

    n2 = issue_nonce()
    wrong_key = nacl.signing.SigningKey.generate()
    message2 = bytes.fromhex(n2["nonce"]) + bytes.fromhex(subject_sha256)
    sig2 = key.sign(message2).signature.hex()  # signed with `key`, verified against `wrong_key`
    wrong_pub = wrong_key.verify_key.encode().hex()
    ok2, _ = verify_attestation(n2["nonce"], sig2, wrong_pub, subject_sha256)
    assert not ok2, "signature from the wrong keypair must fail"
    print("ok  wrong signature / wrong keypair rejected")


def test_analyze_endpoint_honours_form_attestation():
    """Regression test for a real bug: attestation_nonce/signature/public_key
    were plain `str | None` params on a route that also takes `File(...)`.
    FastAPI then parses them as QUERY params, not form fields, so a client
    sending them as multipart form data (the only sane way to send them
    alongside an upload) silently got `attested=False` no matter what it
    sent. Direct calls to verify_attestation() (the tests above) can't catch
    this - it's a wiring bug in main.py's route signature, not the crypto.
    Must go through the actual FastAPI app, not the bare function.
    """
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    import main
    from lanes import LaneResult

    # Neutralise lane A: if weights/lane_a.pt happens to be installed in this
    # environment, the real trained model correctly scores a synthetic
    # noise texture as locally-synthesised (it looks nothing like a real
    # photo), which triggers the lane-disagreement abstain gate before the
    # judge ever reaches the attested-bonus branch. This test is only about
    # the FastAPI routing layer, not lane behaviour, so pin all three lanes
    # to agree.
    agreeable = LaneResult("X", "stub", 0.1, 0.9, ["stubbed for this test"])

    client = TestClient(main.app)
    image_bytes = _jpeg_bytes(_textured())
    subject_sha256 = hashlib.sha256(image_bytes).hexdigest()

    nonce = client.get("/v1/attest/nonce").json()["nonce"]
    key = nacl.signing.SigningKey.generate()
    message = bytes.fromhex(nonce) + bytes.fromhex(subject_sha256)
    sig = key.sign(message).signature.hex()
    pub = key.verify_key.encode().hex()

    with patch.object(main, "lane_a_synthesis", return_value=agreeable), \
         patch.object(main, "lane_b_noise", return_value=agreeable), \
         patch.object(main, "lane_c_compression", return_value=agreeable):
        r = client.post(
            "/v1/analyze/single",
            files={"image": ("s.jpg", image_bytes, "image/jpeg")},
            data={
                "attestation_nonce": nonce,
                "attestation_signature": sig,
                "attestation_public_key": pub,
            },
        )
    reasons = r.json()["verdict"]["reasons"]
    d_reasons = [x for x in reasons if x["lane"] == "D"]
    assert d_reasons, (
        "a valid attestation sent as multipart form data must be honoured "
        "by the /v1/analyze/single route - if this fails, the route's "
        "attestation params probably lost their Form(...) marker again"
    )
    print("ok  /v1/analyze/single honours attestation sent as real form data")


if __name__ == "__main__":
    for fn in [
        test_jpeg_quality_roundtrip,
        test_quality_gate_rejects_unreadable,
        test_abstains_on_unreadable,
        test_lane_b_flags_synthetic_smooth_patch,
        test_uncertainty_band_abstains,
        test_lane_disagreement_abstains,
        test_attestation_never_lowers,
        test_identity_axis_independent,
        test_low_quality_face_needs_wider_match_margin,
        test_pair_without_face_match_never_accepts,
        test_attestation_verifies_valid_signature,
        test_attestation_nonce_is_single_use,
        test_attestation_rejects_unknown_nonce,
        test_attestation_rejects_wrong_signature,
        test_analyze_endpoint_honours_form_attestation,
    ]:
        fn()
    print("\nall checks passed")
