"""Lane A - trained patch-level local-synthesis detector.

Why patch-level: a locally edited face occupies a small part of the frame.
Global average pooling dilutes that signal until it vanishes. Scoring
overlapping patches and taking the top-k keeps a small edited region visible.

Why it is trained on INP-X specifically: arXiv 2602.00192 showed detectors
learn the *global* VAE spectral shift that inpainting leaves across the whole
image, not the synthesized content itself. Restore the original pixels outside
the edit (their "inpainting exchange") and accuracy collapses to chance -
Sightengine and Hive both fall from ~91% to ~55%. Training on exchanged images
removes that shortcut and forces the model to read local content.

Dependencies (torch, timm) and the checkpoint are BOTH optional. Without
either, this lane abstains with a reason rather than raising, so the base
service still deploys on free CPU hosting.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from config import CFG
from lanes import LaneResult

WEIGHTS = Path(os.getenv("LANE_A_WEIGHTS", Path(__file__).parent / "weights" / "lane_a.pt"))
PATCH = 224
STRIDE = 112  # 50% overlap: an edit straddling a patch boundary still lands
TOP_K = 4     # image score = mean of the k most suspicious patches

_model = None
_load_error: str | None = None


def _get_model():
    """Build once, cache at module level. Never at import time."""
    global _model, _load_error
    if _model is not None or _load_error is not None:
        return _model
    try:
        import timm
        import torch
    except ImportError:
        _load_error = "Lane A unavailable: torch/timm not installed (see requirements-ml.txt)."
        return None
    if not WEIGHTS.exists():
        _load_error = f"Lane A unavailable: no checkpoint at {WEIGHTS}. Train with train_lane_a.py."
        return None
    try:
        ckpt = torch.load(WEIGHTS, map_location="cpu")
        model = timm.create_model(ckpt.get("arch", "efficientnet_b0"), pretrained=False, num_classes=1)
        model.load_state_dict(ckpt["state_dict"])
        model.eval()
        torch.set_num_threads(max(1, (os.cpu_count() or 2) // 2))
        _model = model
    except Exception as e:  # noqa: BLE001 - a bad checkpoint must abstain, not crash
        _load_error = f"Lane A unavailable: checkpoint failed to load ({e})."
        return None
    return _model


def _patches(bgr: np.ndarray) -> tuple[np.ndarray, list[tuple[int, int]]]:
    h, w = bgr.shape[:2]
    coords = [
        (y, x)
        for y in range(0, max(1, h - PATCH + 1), STRIDE)
        for x in range(0, max(1, w - PATCH + 1), STRIDE)
    ] or [(0, 0)]
    crops = []
    for y, x in coords:
        c = bgr[y : y + PATCH, x : x + PATCH]
        if c.shape[0] != PATCH or c.shape[1] != PATCH:
            pad = np.zeros((PATCH, PATCH, 3), dtype=bgr.dtype)
            pad[: c.shape[0], : c.shape[1]] = c
            c = pad
        crops.append(c)
    return np.stack(crops), coords


def lane_a_synthesis(bgr: np.ndarray) -> LaneResult:
    model = _get_model()
    if model is None:
        return LaneResult("A", "Local synthesis (trained)", 0.0, 0.0, [_load_error or "unavailable"])

    import torch

    h, w = bgr.shape[:2]
    if min(h, w) < PATCH:
        return LaneResult("A", "Local synthesis (trained)", 0.0, 0.0,
                          [f"Image smaller than the {PATCH}px patch size."])

    crops, coords = _patches(bgr)
    # BGR uint8 -> RGB float, ImageNet normalisation (matches training)
    x = crops[..., ::-1].astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    x = (x - mean) / std
    tensor = torch.from_numpy(x.transpose(0, 3, 1, 2))

    probs: list[float] = []
    with torch.no_grad():
        for i in range(0, len(tensor), 16):  # chunked: bounded peak memory on CPU
            probs.extend(torch.sigmoid(model(tensor[i : i + 16]).squeeze(-1)).tolist())
    p = np.asarray(probs, dtype=float)

    k = min(TOP_K, p.size)
    score = float(np.sort(p)[-k:].mean())

    worst = int(np.argmax(p))
    y, x0 = coords[worst]
    box = (x0, y, min(PATCH, w - x0), min(PATCH, h - y))

    reasons = [f"Scored {p.size} overlapping {PATCH}px patches; top-{k} mean {score:.2f}."]
    if score >= CFG.fake_above:
        reasons.append(
            f"Most suspicious patch at ({x0},{y}) scored {p[worst]:.2f}, "
            "consistent with locally synthesised content."
        )
    else:
        reasons.append("No patch cluster reads as locally synthesised.")

    # A trained lane is only as trustworthy as its validation set. The
    # checkpoint records its own held-out accuracy on INP-X exchanged
    # images, which is the honest number to weight this lane by.
    conf = float(np.clip(_checkpoint_confidence(), 0.0, 1.0))
    return LaneResult("A", "Local synthesis (trained)", score, conf, reasons, box)


def _checkpoint_confidence() -> float:
    """Confidence = the checkpoint's own held-out accuracy on exchanged images.

    Falls back low if the checkpoint does not record one, so an undocumented
    model cannot silently dominate the judge.
    """
    try:
        import torch

        ckpt = torch.load(WEIGHTS, map_location="cpu")
        return float(ckpt.get("val_acc_exchanged", 0.4))
    except Exception:  # noqa: BLE001
        return 0.4
