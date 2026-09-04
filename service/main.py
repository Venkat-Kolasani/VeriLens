"""FastAPI forensics service for KYC deepfake / AI-generated image detection.

Endpoints:
  POST /v1/analyze         ID photo + selfie -> full verdict
  POST /v1/analyze/single  one image -> authenticity only
  GET  /v1/health
  GET  /v1/model-card      thresholds, limits, and what we do NOT claim

Runs CPU-only. No model weights required for lanes B/C, so the service is
deployable on free CPU hosting as-is.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import CFG
from judge import Verdict, judge
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
    results = [lane_b_noise(bgr), lane_c_compression(pil, bgr)]
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
    return analysis, q, results


@app.post("/v1/analyze/single", response_model=AnalyzeOut)
async def analyze_single(image: UploadFile = File(...), attested: bool = False):
    """Authenticity only. No identity axis - there is nothing to match against."""
    analysis, q, results = _analyze_one(await _read_upload(image))
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
    id_analysis, id_q, id_results = _analyze_one(await _read_upload(id_image))
    selfie_analysis, s_q, s_results = _analyze_one(await _read_upload(selfie))

    id_v = judge(id_q, id_results, attested=False)
    selfie_v = judge(s_q, s_results, attested=attested)

    rank = {"LIKELY_FAKE": 0, "INSUFFICIENT_EVIDENCE": 1, "REAL": 2}
    worst = min([id_v, selfie_v], key=lambda v: rank[v.authenticity])

    # Label each reason with which image produced it.
    worst.reasons = (
        [type(r)(r.lane, f"[ID] {r.text}", r.severity) for r in id_v.reasons]
        + [type(r)(r.lane, f"[Selfie] {r.text}", r.severity) for r in selfie_v.reasons]
    )
    # ponytail: Lane E (face match) lands in W4; until then identity is
    # unknown, so a clean pair routes to REVIEW rather than ACCEPT.
    worst.identity = "INDETERMINATE"
    if worst.authenticity == "REAL":
        worst.decision = "REVIEW"

    return AnalyzeOut(
        version=CFG.version,
        verdict=_verdict_out(worst),
        id_image=id_analysis,
        selfie=selfie_analysis,
    )


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
        ],
        "thresholds": {k: v for k, v in vars(CFG).items()} or asdict(CFG),
        "confidence_is_calibrated": CFG.confidence_is_calibrated,
        "known_limitations": [
            "Confidence values are raw lane agreement, NOT calibrated probabilities.",
            "Lanes B and C are intra-image consistency checks. A fully synthetic "
            "image with globally uniform statistics can pass both.",
            "No camera attribution and no PRNU reference database.",
            "Absence of capture attestation is never treated as evidence of fakery.",
            "Heavily compressed or low-resolution images return "
            "INSUFFICIENT_EVIDENCE by design rather than a guess.",
            "Lane A (trained local-synthesis detector) and Lane E (face match) "
            "are not yet wired in; identity is reported as INDETERMINATE.",
        ],
        "does_not_claim": [
            "Novel research. The techniques (ELA, noise residuals, robust "
            "outlier statistics) are established image forensics.",
            "Detection of manipulations that leave no local statistical trace.",
        ],
    }
