"""Lane E graceful degradation. Run: python test_lane_face.py

The path that matters on free CPU hosting: insightface is not installed, or
it is and finds no face. Both must abstain, never raise and never invent a
similarity that judge.py would turn into an identity call.
"""

from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

import lane_face
from lane_face import face_similarity

rng = np.random.default_rng(0)


def _fake_face(min_side_px: float, embedding: np.ndarray):
    # bbox is [x1, y1, x2, y2]; only the smaller side feeds _bbox_px.
    return SimpleNamespace(bbox=[0.0, 0.0, min_side_px, min_side_px], normed_embedding=embedding)


def test_no_face_abstains():
    noise = rng.integers(0, 256, size=(2, 512, 512, 3), dtype=np.uint8)
    sim, reasons, low_quality = face_similarity(noise[0], noise[1])

    assert sim is None, f"noise must not yield a similarity, got {sim}"
    assert low_quality is False
    assert reasons, "abstaining must always come with a reason"
    assert any(
        "not installed" in r or "No face detected" in r or "unavailable" in r
        for r in reasons
    ), reasons
    print(f"ok  lane E abstains: {reasons[-1]}")


def test_high_res_face_not_flagged_low_quality():
    emb = np.zeros(512)
    emb[0] = 1.0  # unit vector, identical on both sides -> sim=1.0
    fake_model = SimpleNamespace(get=lambda img: [_fake_face(400.0, emb)])

    with patch.object(lane_face, "_get_model", return_value=fake_model):
        sim, reasons, low_quality = face_similarity(
            np.zeros((10, 10, 3), np.uint8), np.zeros((10, 10, 3), np.uint8)
        )
    assert sim == 1.0
    assert low_quality is False, reasons
    print("ok  high-res face crop not flagged low-quality")


def test_small_face_flagged_low_quality_but_still_scored():
    """Below LOW_QUALITY_FACE_PX but above _MIN_FACE_PX: still an honest
    similarity (never invent, never withhold a real number), but flagged so
    judge.py can require a wider match margin -- this is the actual bug
    report: a low-res ID photo crop (e.g. ~94px, a real Aadhar card photo in
    manual testing) getting treated identically to a full-resolution face.
    """
    emb = np.zeros(512)
    emb[0] = 1.0
    small_px = (lane_face._MIN_FACE_PX + lane_face.LOW_QUALITY_FACE_PX) / 2
    fake_model = SimpleNamespace(get=lambda img: [_fake_face(small_px, emb)])

    with patch.object(lane_face, "_get_model", return_value=fake_model):
        sim, reasons, low_quality = face_similarity(
            np.zeros((10, 10, 3), np.uint8), np.zeros((10, 10, 3), np.uint8)
        )
    assert sim == 1.0, "a small-but-usable crop must still get an honest similarity"
    assert low_quality is True, reasons
    assert any("recognition model expects" in r for r in reasons), reasons
    print("ok  small-but-usable face crop scored honestly AND flagged low-quality")


if __name__ == "__main__":
    test_no_face_abstains()
    test_high_res_face_not_flagged_low_quality()
    test_small_face_flagged_low_quality_but_still_scored()
    print("\nall checks passed")
