"""One runnable check per non-trivial path. Run: python test_service.py

Uses synthetic images so there are no fixtures to ship and the assertions
are deterministic.
"""

import io

import cv2
import numpy as np
from PIL import Image

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
    ]:
        fn()
    print("\nall checks passed")
