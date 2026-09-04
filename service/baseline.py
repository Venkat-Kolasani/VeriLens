"""Baseline detectors, for side-by-side comparison against our lanes.

Purpose is the demo, not production: run the same image through a commercial
detector and through our judge, and show both answers next to each other.

arXiv 2602.00192 (Table 2) reports Sightengine and Hive Moderation both
falling from ~91% to ~55% -- chance -- on INP-X images, where the edit is
local and the surrounding pixels are restored. That paper was submitted
2026-01-30, so the number needs re-verifying before it is quoted on stage:
a vendor has had months to patch a published failure. Run
scripts/verify_baseline.py against the INP-X set to confirm.

Credentials are optional. Without them this reports unavailable rather than
failing the request.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import httpx

SIGHTENGINE_URL = "https://api.sightengine.com/1.0/check.json"
TIMEOUT = 30.0


@dataclass
class BaselineResult:
    name: str
    available: bool
    # Normalised 0-1 "this looks fake" score, or None when unavailable.
    score: float | None = None
    verdict: str | None = None  # the baseline's own binary call
    detail: dict = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)


async def sightengine(image: bytes, filename: str = "upload.jpg") -> BaselineResult:
    user = os.getenv("SIGHTENGINE_USER")
    secret = os.getenv("SIGHTENGINE_SECRET")
    if not user or not secret:
        return BaselineResult(
            "Sightengine",
            False,
            reasons=["No SIGHTENGINE_USER / SIGHTENGINE_SECRET configured."],
        )
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.post(
                SIGHTENGINE_URL,
                data={"models": "deepfake,genai", "api_user": user, "api_secret": secret},
                files={"media": (filename, image, "image/jpeg")},
            )
        data = res.json()
    except Exception as e:  # noqa: BLE001 - a baseline outage must not fail the request
        return BaselineResult("Sightengine", False, reasons=[f"Request failed: {e}"])

    if data.get("status") == "failure":
        return BaselineResult(
            "Sightengine", False, reasons=[f"API error: {data.get('error')}"]
        )

    deepfake = float(data.get("deepfake", {}).get("score", 0.0))
    ai_gen = float(data.get("type", {}).get("ai_generated", 0.0))
    score = max(deepfake, ai_gen)
    return BaselineResult(
        "Sightengine",
        True,
        score=round(score, 4),
        verdict="FAKE" if score > 0.5 else "REAL",
        detail={"deepfake": round(deepfake, 4), "ai_generated": round(ai_gen, 4)},
        reasons=[
            f"deepfake={deepfake:.3f}, ai_generated={ai_gen:.3f}. "
            "Single number, no region and no reasoning returned."
        ],
    )


async def run_all(image: bytes, filename: str = "upload.jpg") -> list[BaselineResult]:
    """Every configured baseline. Extend by appending to this list.

    ponytail: only Sightengine is wired. The 11 open-source detectors the
    paper evaluates need weight downloads and torch, so they belong behind
    requirements-ml.txt if the comparison needs widening.
    """
    return [await sightengine(image, filename)]
