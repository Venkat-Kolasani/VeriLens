"""FastAPI forensics service for KYC deepfake / AI-generated image detection.

Endpoints:
  POST /v1/analyze         ID photo + selfie -> full verdict
  POST /v1/analyze/single  one image -> authenticity only
  GET  /v1/health
  POST /v1/baseline        same image: baselines vs ours, side by side
  GET  /v1/model-card      thresholds, limits, and what we do NOT claim

Runs CPU-only. No model weights required for lanes B/C, so the service is
deployable on free CPU hosting as-is.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from baseline import run_all as run_baselines
from config import CFG
from judge import Verdict, judge
from lane_a import lane_a_synthesis
from lane_face import face_similarity
from lanes import lane_b_noise, lane_c_compression, load_image, quality_gate

MAX_UPLOAD_BYTES = 12 * 1024 * 1024

app = FastAPI(title="VeriLens KYC Forensics", version=CFG.version)

# The Expo app calls this from a device/emulator on an arbitrary origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class LaneOut(BaseModel):
    lane: str
    name: str
    score: float
    confidence: float
    usable: bool
    reasons: list[str]
    box: list[int] | None = None


class ImageAnalysis(BaseModel):
    sha256: str
    width: int
    height: int
    quality_usable: bool
    quality_reasons: list[str]
    jpeg_quality: int | None
    lanes: list[LaneOut]


class VerdictOut(BaseModel):
    authenticity: str
    identity: str | None
    decision: str
    confidence: float
    confidence_is_calibrated: bool
    score: float | None
    reasons: list[dict]


class AnalyzeOut(BaseModel):
    version: str
    verdict: VerdictOut
    id_image: ImageAnalysis | None = None
    selfie: ImageAnalysis | None = None


def _verdict_out(v: Verdict) -> VerdictOut:
    return VerdictOut(
        authenticity=v.authenticity,
        identity=v.identity,
        decision=v.decision,
        confidence=v.confidence,
        confidence_is_calibrated=v.confidence_is_calibrated,
        score=v.score,
        reasons=[asdict(r) for r in v.reasons],
    )


async def _read_upload(f: UploadFile) -> bytes:
    data = await f.read()
    if not data:
        raise HTTPException(400, f"'{f.filename or 'file'}' is empty")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"'{f.filename}' exceeds {MAX_UPLOAD_BYTES // 1024 // 1024}MB")
    return data


def _analyze_one(data: bytes):
    """Run the quality gate and every lane over one image."""
    import hashlib

    try:
        pil, bgr = load_image(data)
    except Exception as e:  # noqa: BLE001 - any decode failure is a client error
        raise HTTPException(400, f"Could not decode image: {e}") from e

    q = quality_gate(pil, bgr)
    results = [lane_a_synthesis(bgr), lane_b_noise(bgr), lane_c_compression(pil, bgr)]
    h, w = bgr.shape[:2]

    analysis = ImageAnalysis(
        sha256=hashlib.sha256(data).hexdigest(),
        width=w,
        height=h,
        quality_usable=q.usable,
        quality_reasons=q.reasons,
        jpeg_quality=q.jpeg_quality,
        lanes=[
            LaneOut(
                lane=r.lane,
                name=r.name,
                score=round(r.score, 3),
                confidence=round(r.confidence, 3),
                usable=r.usable,
                reasons=r.reasons,
                box=list(r.box) if r.box else None,
            )
            for r in results
        ],
    )
    return analysis, q, results, bgr


@app.post("/v1/analyze/single", response_model=AnalyzeOut)
async def analyze_single(image: UploadFile = File(...), attested: bool = False):
    """Authenticity only. No identity axis - there is nothing to match against."""
    analysis, q, results, _ = _analyze_one(await _read_upload(image))
    v = judge(q, results, attested=attested)
    return AnalyzeOut(version=CFG.version, verdict=_verdict_out(v), selfie=analysis)


@app.post("/v1/analyze", response_model=AnalyzeOut)
async def analyze(
    id_image: UploadFile = File(...),
    selfie: UploadFile = File(...),
    attested: bool = False,
):
    """Full KYC check: both images, worst-case authenticity, identity axis.

    Authenticity takes the WORST of the two images: a genuine selfie paired
    with a doctored ID document is still a failed check.
    """
    id_analysis, id_q, id_results, id_bgr = _analyze_one(await _read_upload(id_image))
    selfie_analysis, s_q, s_results, s_bgr = _analyze_one(await _read_upload(selfie))

    # Authenticity: judge each image on its own, then keep the worse one.
    # A genuine selfie paired with a doctored ID is still a failed check.
    rank = {"LIKELY_FAKE": 0, "INSUFFICIENT_EVIDENCE": 1, "REAL": 2}
    id_v = judge(id_q, id_results, attested=False)
    selfie_v = judge(s_q, s_results, attested=attested)
    worse_is_id = rank[id_v.authenticity] < rank[selfie_v.authenticity]

    # Identity is orthogonal, so it is resolved once over both images and
    # then folded into the decision by the judge.
    sim, face_reasons = face_similarity(id_bgr, s_bgr)

    # Re-judge the worse image with the identity signal attached, so the
    # decision reflects both axes rather than being patched afterwards.
    if worse_is_id:
        final = judge(id_q, id_results, attested=False, face_similarity=sim, require_identity=True)
    else:
        final = judge(s_q, s_results, attested=attested, face_similarity=sim, require_identity=True)

    Reason = type(final.reasons[0]) if final.reasons else None
    labelled = (
        [type(r)(r.lane, f"[ID] {r.text}", r.severity) for r in id_v.reasons]
        + [type(r)(r.lane, f"[Selfie] {r.text}", r.severity) for r in selfie_v.reasons]
    )
    identity_reasons = [r for r in final.reasons if r.lane in ("E", "J")]
    final.reasons = identity_reasons + labelled
    if Reason is not None:
        final.reasons += [Reason("E", t, "info") for t in face_reasons]

    worst = final

    return AnalyzeOut(
        version=CFG.version,
        verdict=_verdict_out(worst),
        id_image=id_analysis,
        selfie=selfie_analysis,
    )


@app.post("/v1/baseline")
async def baseline(image: UploadFile = File(...)):
    """Same image through the baselines and through our judge, side by side.

    The comparison the demo turns on: a commercial detector returns one
    number with no region and no reasoning, and on a locally-edited image
    where the background is intact it has been measured at chance level.
    Ours reports per-lane evidence and abstains when it cannot read the image.
    """
    data = await _read_upload(image)
    analysis, q, results, _ = _analyze_one(data)
    ours = judge(q, results)
    baselines = await run_baselines(data, image.filename or "upload.jpg")

    return {
        "version": CFG.version,
        "baselines": [
            {
                "name": b.name,
                "available": b.available,
                "score": b.score,
                "verdict": b.verdict,
                "detail": b.detail,
                "reasons": b.reasons,
                "explains_reasoning": False,
                "localises_region": False,
                "can_abstain": False,
            }
            for b in baselines
        ],
        "ours": {
            "name": "VeriLens",
            "available": True,
            "authenticity": ours.authenticity,
            "decision": ours.decision,
            "score": ours.score,
            "confidence": ours.confidence,
            "confidence_is_calibrated": ours.confidence_is_calibrated,
            "reasons": [asdict(r) for r in ours.reasons],
            "lanes": [
                {"lane": l.lane, "name": l.name, "score": round(l.score, 3),
                 "confidence": round(l.confidence, 3), "usable": l.usable,
                 "box": list(l.box) if l.box else None}
                for l in results
            ],
            "explains_reasoning": True,
            "localises_region": True,
            "can_abstain": True,
        },
        "image": {"sha256": analysis.sha256, "width": analysis.width, "height": analysis.height},
    }


@app.get("/v1/health")
def health():
    return {"status": "ok", "version": CFG.version}


@app.get("/v1/model-card")
def model_card():
    """What this service does, what it does not, and the numbers behind it.

    Served as an endpoint so the honesty claims are inspectable rather than
    just asserted in a README.
    """
    return {
        "version": CFG.version,
        "lanes": [
            {"id": "B", "name": "Noise residual", "trained": False,
             "reads": "regions unnaturally noise-free for their detail level"},
            {"id": "C", "name": "Compression / ELA", "trained": False,
             "reads": "recompression error inconsistent with local detail"},
            {"id": "A", "name": "Local synthesis", "trained": True,
             "reads": "patch-level locally synthesised content; trained on INP-X "
                      "exchanged images so it cannot use the global VAE artifact",
             "optional_deps": "requirements-ml.txt + weights/lane_a.pt"},
            {"id": "E", "name": "Face match", "trained": True,
             "reads": "cosine similarity between ID and selfie face embeddings",
             "optional_deps": "requirements-ml.txt"},
        ],
        "thresholds": {k: v for k, v in vars(CFG).items()} or asdict(CFG),
        "confidence_is_calibrated": CFG.confidence_is_calibrated,
        "known_limitations": [
            "Confidence values are raw lane agreement, NOT calibrated probabilities.",
            "Lanes B and C are intra-image consistency checks. A fully synthetic "
            "image with globally uniform statistics can pass both.",
            "No camera attribution and no PRNU reference database.",
            "Absence of capture attestation is never treated as evidence of fakery.",
            "The `attested` flag is asserted by the client and is NOT verified "
            "server-side, so it currently grants no confidence bonus. It is not an "
            "injection defence until the service issues a nonce the device must "
            "sign over the image bytes (config.trust_client_attestation).",
            "Heavily compressed or low-resolution images return "
            "INSUFFICIENT_EVIDENCE by design rather than a guess.",
            "Lane A (trained local-synthesis detector) is wired in but needs both "
            "requirements-ml.txt and a trained weights/lane_a.pt checkpoint. Without "
            "either it abstains, leaving lanes B and C to carry the verdict.",
            "Lane E (face match) is wired in but its dependencies are optional. "
            "Without requirements-ml.txt installed no similarity is computed, so "
            "a pair check reports identity=INDETERMINATE and routes to REVIEW "
            "rather than accepting an unverified identity.",
        ],
        "does_not_claim": [
            "Novel research. The techniques (ELA, noise residuals, robust "
            "outlier statistics) are established image forensics.",
            "Detection of manipulations that leave no local statistical trace.",
        ],
    }
