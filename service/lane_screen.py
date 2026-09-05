"""Lane G: screen/print replay detection via moire-pattern analysis.

A digital screen re-photographed by a camera produces a periodic
interference pattern (moire) between the screen's own pixel grid and the
camera sensor's grid. A real photo of a real face has no such periodic
structure -- its frequency spectrum falls off smoothly. This lane looks
for that signature via FFT: a genuine moire peak shows up as an unusually
LOUD, localised cluster in the mid/high-frequency region, well outside the
low-frequency center where normal image content (the face, background)
lives.

NEW AND UNVALIDATED. Reasoned about and spot-checked manually, not measured
against a labelled dataset of real vs. screen/print-replay photos. Its
confidence is capped low regardless of what it finds (CFG.
screen_replay_confidence) so it can contribute evidence without dominating
the judge until it earns more trust -- same principle already applied to
Lane A after its own real-world reliability gap was found this session.

Known false-positive risk: fine periodic real-world texture (mesh fabric,
patterned wallpaper, window blinds, a striped shirt) can also produce
frequency-domain peaks. Known false-negative risk: high-DPI/anti-moire
screens and good print quality reduce or eliminate the pattern. Neither
risk is calibrated away here -- the low confidence cap is the honest
answer until real calibration data exists, not a claim this lane is
reliable.
"""

from __future__ import annotations

import cv2
import numpy as np

from config import CFG
from lanes import LaneResult, _block_grid, _largest_cluster, _robust_z, _score_from_cluster

# Finer grid than the spatial lanes (CFG.block_px=16): a moire peak in the
# frequency domain is narrow, and a coarse grid would average it away.
FFT_BLOCK_PX = 8
# Fraction of the spectrum's radius treated as "low-frequency center, real
# image content" and excluded from the outlier search.
CENTER_EXCLUDE_FRAC = 0.15


def lane_screen_replay(bgr: np.ndarray) -> LaneResult:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float64)
    h, w = gray.shape
    if min(h, w) < 64:
        return LaneResult("G", "Screen/print replay", 0.0, 0.0,
                          ["Image too small for frequency analysis."])

    fshift = np.fft.fftshift(np.fft.fft2(gray))
    mag = np.log1p(np.abs(fshift))

    # Zero out the low-frequency center: real content lives here and would
    # otherwise swamp the outlier statistics below.
    cy, cx = h // 2, w // 2
    radius = int(min(h, w) * CENTER_EXCLUDE_FRAC)
    yy, xx = np.ogrid[:h, :w]
    mag[(yy - cy) ** 2 + (xx - cx) ** 2 <= radius * radius] = 0.0

    grid = _block_grid(mag, FFT_BLOCK_PX)
    if grid.size == 0:
        return LaneResult("G", "Screen/print replay", 0.0, 0.0,
                          ["Image too small to form a frequency grid."])

    z = _robust_z(grid)
    mask = z > CFG.outlier_z  # high-side only: a moire peak is unusually LOUD, not quiet
    cluster, _box = _largest_cluster(mask)
    # No spatial box: a flagged block here is a location in the frequency
    # spectrum, not a location in the photo -- returning one would mislead
    # the UI into highlighting the wrong thing on the image.
    score = _score_from_cluster(cluster, int(grid.size))

    reasons = [f"Checked {grid.size} frequency-domain blocks outside the low-frequency center."]
    if score > 0:
        reasons.append(
            f"{cluster} contiguous frequency blocks show an unusually strong periodic "
            f"peak (max z={np.abs(z).max():.1f}), consistent with a screen/print moire pattern."
        )
    else:
        reasons.append("No periodic moire signature detected.")

    return LaneResult("G", "Screen/print replay", score, CFG.screen_replay_confidence, reasons)


if __name__ == "__main__":
    print(lane_screen_replay(np.zeros((256, 256, 3), np.uint8)))
