"""Lane G (screen/print replay) checks. Run: python test_lane_screen.py

Uses synthetic images -- a periodic grating simulates the moire signature
of a photographed screen; textured noise stands in for a real photo.
"""

import numpy as np

from config import CFG
from lane_screen import lane_screen_replay

rng = np.random.default_rng(0)


def _natural_texture(h=512, w=512) -> np.ndarray:
    """Smooth-falloff frequency content, no periodic structure -- stands
    in for a real camera photo."""
    base = rng.integers(60, 200, size=(h, w), dtype=np.uint8).astype(np.float64)
    # A few passes of box-blur approximate a natural 1/f-ish spectrum
    # without pulling in cv2/scipy filtering here.
    for _ in range(3):
        base = (base + np.roll(base, 1, axis=0) + np.roll(base, 1, axis=1)) / 3.0
    return np.stack([base] * 3, axis=2).astype(np.uint8)


def _moire_pattern(h=512, w=512, period_px=6) -> np.ndarray:
    """A fine periodic grating -- the signature a screen's own pixel grid
    leaves when re-photographed, aliased against the camera's sampling
    grid. Concentrates energy at one strong frequency, unlike natural
    image content's smooth falloff."""
    yy, xx = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
    grating = 128 + 100 * np.sin(2 * np.pi * xx / period_px) * np.sin(2 * np.pi * yy / period_px)
    noise = rng.normal(0, 5, size=(h, w))
    out = np.clip(grating + noise, 0, 255).astype(np.uint8)
    return np.stack([out] * 3, axis=2)


def test_natural_texture_reads_clean():
    r = lane_screen_replay(_natural_texture())
    assert r.usable, f"a natural photo's own baseline confidence must clear the floor, got {r.confidence}"
    assert r.score < CFG.fake_above, f"natural texture must not read as a screen replay, got {r.score}"
    print(f"ok  natural texture reads clean: score={r.score:.2f}")


def test_moire_grating_flagged():
    clean = lane_screen_replay(_natural_texture())
    moire = lane_screen_replay(_moire_pattern())
    assert moire.score > clean.score, (
        f"a periodic grating must score higher than natural texture, got moire={moire.score:.2f} "
        f"clean={clean.score:.2f}"
    )
    assert moire.score > 0, "the moire signature must actually flag something, not just score relatively higher"
    print(f"ok  moire grating flagged: clean={clean.score:.2f} moire={moire.score:.2f}")


def test_confidence_is_capped_low():
    """Regardless of what it finds, this lane must never claim more trust
    than CFG.screen_replay_confidence -- it is new and unvalidated."""
    for img in (_natural_texture(), _moire_pattern()):
        r = lane_screen_replay(img)
        assert r.confidence == CFG.screen_replay_confidence, r.confidence
    print("ok  confidence stays capped regardless of finding")


def test_tiny_image_abstains():
    r = lane_screen_replay(np.zeros((32, 32, 3), np.uint8))
    assert r.confidence == 0.0, "too small for frequency analysis must abstain, not guess"
    print("ok  tiny image abstains")


if __name__ == "__main__":
    for fn in [
        test_natural_texture_reads_clean,
        test_moire_grating_flagged,
        test_confidence_is_capped_low,
        test_tiny_image_abstains,
    ]:
        fn()
    print("\nall checks passed")
