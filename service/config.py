"""Every threshold that drives a verdict, in one place.

Centralised so a judge can read exactly what numbers produce a decision,
and so W5 calibration has one file to touch. Lanes and judge must not
hardcode thresholds.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    # ---- quality gate: can this image support a forensic read at all ----
    # Forensic traces live in high-frequency detail. Below these, there is
    # not enough evidence to justify any verdict, so we abstain.
    min_side_px: int = 256
    min_laplacian_var: float = 60.0  # variance of Laplacian; low = blurred
    min_jpeg_quality: int = 55  # heavy recompression destroys ELA + residuals

    # ---- shared lane statistics ----
    block_px: int = 16
    outlier_z: float = 3.5  # modified z-score; Iglewicz-Hoaglin cutoff
    min_cluster_blocks: int = 4  # one stray block is noise, a cluster is evidence
    min_lane_confidence: float = 0.35  # below this a lane abstains
    # Flagged-area fraction that maps to a ~0.6 lane score. Shapes the
    # saturating area->score curve. Uncalibrated default.
    score_area_saturation: float = 0.05

    # ---- judge ----
    # Gap between these two is the abstention band. Deliberately wide: in KYC
    # a confidently wrong reject locks a real user out of their bank.
    real_below: float = 0.35
    fake_above: float = 0.65
    min_usable_lanes: int = 2  # fewer than this and there is nothing to cross-check
    max_disagreement: float = 0.28  # spread above which lanes conflict -> abstain
    attested_bonus: float = 0.10  # attestation RAISES confidence only, never lowers
    # The `attested` flag is currently ASSERTED BY THE CLIENT and is not
    # cryptographically verified server-side. A hostile client can simply
    # send attested=true, so honouring it would claim an injection defence
    # that does not exist. Left off until the service issues a nonce that
    # the device must sign over the image bytes; then flip this to True.
    trust_client_attestation: bool = False

    # Cosine similarity on face embeddings (Lane E). Gap between them is the
    # inconclusive band -> REVIEW rather than a coin-flip identity call.
    face_match_above: float = 0.38
    face_mismatch_below: float = 0.22

    ela_quality: int = 90  # recompression quality for Lane C
    max_analysis_side: int = 1600  # cap for CPU latency on free hosting

    # Confidence values are raw lane agreement, NOT calibrated probabilities.
    # Surfaced in /v1/model-card so nobody misreads them. Flip after W5.
    confidence_is_calibrated: bool = False

    version: str = "0.1.0-lanes-bc"


CFG = Config()
