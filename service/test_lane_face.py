"""Lane E graceful degradation. Run: python test_lane_face.py

The path that matters on free CPU hosting: insightface is not installed, or
it is and finds no face. Both must abstain, never raise and never invent a
similarity that judge.py would turn into an identity call.
"""

import numpy as np

from lane_face import face_similarity

rng = np.random.default_rng(0)


def test_no_face_abstains():
    noise = rng.integers(0, 256, size=(2, 512, 512, 3), dtype=np.uint8)
    sim, reasons = face_similarity(noise[0], noise[1])

    assert sim is None, f"noise must not yield a similarity, got {sim}"
    assert reasons, "abstaining must always come with a reason"
    assert any(
        "not installed" in r or "No face detected" in r or "unavailable" in r
        for r in reasons
    ), reasons
    print(f"ok  lane E abstains: {reasons[-1]}")


if __name__ == "__main__":
    test_no_face_abstains()
    print("\nall checks passed")
