"""Rule-based judge. Combines lane outputs into a verdict.

Deliberately rules, not a learned meta-model: there is no honest data to
train one on yet, and rules can state *why* they concluded something.

Three independent axes, because conflating them is how detectors produce
nonsense. "The selfie is a real photo of the wrong person" and "the selfie
is an AI-generated image of the right person" are different failures and
need different handling.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from config import CFG
from lanes import LaneResult, QualityReport

Authenticity = Literal["REAL", "LIKELY_FAKE", "INSUFFICIENT_EVIDENCE"]
Identity = Literal["MATCH", "MISMATCH", "INDETERMINATE"]
Decision = Literal["ACCEPT", "REJECT", "REVIEW"]


@dataclass
class Reason:
    lane: str
    text: str
    severity: Literal["info", "warn", "critical"]


@dataclass
class Verdict:
    authenticity: Authenticity
    identity: Identity | None  # None when only one image was supplied
    decision: Decision
    confidence: float
    confidence_is_calibrated: bool
    score: float | None  # aggregated lane score, None when abstaining early
    reasons: list[Reason] = field(default_factory=list)


def _abstain(reasons: list[Reason], identity: Identity | None) -> Verdict:
    return Verdict(
        authenticity="INSUFFICIENT_EVIDENCE",
        identity=identity,
        decision="REVIEW",
        confidence=0.0,
        confidence_is_calibrated=CFG.confidence_is_calibrated,
        score=None,
        reasons=reasons,
    )


def judge(
    quality: QualityReport,
    lane_results: list[LaneResult],
    *,
    attested: bool = False,
    face_similarity: float | None = None,
    require_identity: bool = False,
    low_quality_face: bool = False,
) -> Verdict:
    reasons: list[Reason] = []

    identity: Identity | None = None
    if face_similarity is not None:
        match_bar = CFG.face_match_above + (CFG.face_match_low_quality_margin if low_quality_face else 0.0)
        if face_similarity >= match_bar:
            identity = "MATCH"
            reasons.append(Reason("E", f"Selfie matches ID photo (similarity {face_similarity:.2f}).", "info"))
        elif low_quality_face and face_similarity >= CFG.face_match_above:
            identity = "INDETERMINATE"
            reasons.append(Reason(
                "E",
                f"Similarity {face_similarity:.2f} clears the normal match bar "
                f"({CFG.face_match_above:.2f}) but the face crop was low-resolution, "
                f"which needs {match_bar:.2f}+ to count as a confident match. "
                "Routing to review rather than accepting a weak signal.",
                "warn",
            ))
        elif face_similarity <= CFG.face_mismatch_below:
            identity = "MISMATCH"
            reasons.append(Reason("E", f"Selfie does NOT match ID photo (similarity {face_similarity:.2f}).", "critical"))
        else:
            identity = "INDETERMINATE"
            reasons.append(Reason("E", f"Face match inconclusive (similarity {face_similarity:.2f}).", "warn"))
    elif require_identity:
        # A pair check with no computable similarity is NOT the same as a
        # single-image check where identity does not apply. Identity is
        # required here and unknown, so the case must go to a human.
        identity = "INDETERMINATE"
        reasons.append(
            Reason("E", "Identity could not be verified: no face similarity was computed. "
                        "Routing to review rather than accepting an unverified match.", "warn")
        )

    # Gate 1: is the image readable at all? Abstaining here is the whole
    # point -- a verdict on a destroyed image is a fabricated verdict.
    if not quality.usable:
        for r in quality.reasons:
            reasons.append(Reason("Q", r, "warn"))
        reasons.append(Reason("Q", "Abstaining: image quality too low to support a verdict.", "warn"))
        return _abstain(reasons, identity)

    # Gate 2: enough independent lanes to cross-check each other?
    usable = [r for r in lane_results if r.usable]
    for r in lane_results:
        sev = "warn" if r.score >= CFG.fake_above else "info"
        for text in r.reasons:
            reasons.append(Reason(r.lane, text, sev))
        if not r.usable:
            reasons.append(
                Reason(r.lane, f"Lane abstained (confidence {r.confidence:.2f} below "
                               f"{CFG.min_lane_confidence:.2f}).", "warn")
            )

    if len(usable) < CFG.min_usable_lanes:
        reasons.append(
            Reason("J", f"Abstaining: only {len(usable)} of {len(lane_results)} lanes could "
                        f"read this image; need {CFG.min_usable_lanes} to cross-check.", "warn")
        )
        return _abstain(reasons, identity)

    scores = np.array([r.score for r in usable], dtype=float)
    weights = np.array([r.confidence for r in usable], dtype=float)
    agg = float(np.average(scores, weights=weights))

    # Gate 3: do the lanes actually agree? Averaging away a genuine conflict
    # manufactures false confidence, so a real disagreement abstains instead.
    spread = float(np.sqrt(np.average((scores - agg) ** 2, weights=weights)))
    if spread > CFG.max_disagreement:
        reasons.append(
            Reason("J", f"Abstaining: lanes disagree (spread {spread:.2f} > "
                        f"{CFG.max_disagreement:.2f}). Conflicting evidence.", "warn")
        )
        v = _abstain(reasons, identity)
        v.score = agg
        return v

    base_conf = float(np.mean(weights)) * (1.0 - min(spread / CFG.max_disagreement, 1.0) * 0.5)
    if attested:
        # Attestation RAISES confidence only. Its absence is never evidence
        # of fakery -- almost every genuine photo carries no attestation.
        base_conf = min(1.0, base_conf + CFG.attested_bonus)
        reasons.append(
            Reason("D", "Image was captured live in-app with a verified device attestation.", "info")
        )

    if agg >= CFG.fake_above:
        authenticity: Authenticity = "LIKELY_FAKE"
    elif agg <= CFG.real_below:
        authenticity = "REAL"
    else:
        reasons.append(
            Reason("J", f"Abstaining: aggregate score {agg:.2f} falls in the uncertainty "
                        f"band ({CFG.real_below:.2f}-{CFG.fake_above:.2f}).", "warn")
        )
        v = _abstain(reasons, identity)
        v.score = agg
        return v

    # Decision folds both axes. Identity is checked even when the pixels
    # look authentic: a real photo of the wrong person still fails KYC.
    if authenticity == "LIKELY_FAKE":
        decision: Decision = "REJECT"
    elif identity == "MISMATCH":
        decision = "REJECT"
    elif identity == "INDETERMINATE":
        decision = "REVIEW"
    else:
        decision = "ACCEPT"

    severity_order = {"critical": 0, "warn": 1, "info": 2}
    reasons.sort(key=lambda r: severity_order[r.severity])

    return Verdict(
        authenticity=authenticity,
        identity=identity,
        decision=decision,
        confidence=round(base_conf, 3),
        confidence_is_calibrated=CFG.confidence_is_calibrated,
        score=round(agg, 3),
        reasons=reasons,
    )
