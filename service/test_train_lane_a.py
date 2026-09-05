"""Checks for the 140k-real-and-fake-faces blending added to
train_lane_a.py. Run: python test_train_lane_a.py

Uses tmp directories with tiny synthetic images -- no real dataset needed,
same "no fixtures to ship" approach as test_service.py.
"""

import random
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from train_lane_a import PATCH, Patches, _augment, _find_faces140k_split, discover_faces140k


def _make_split(root: Path, split_name: str, n_real: int, n_fake: int):
    for label, n in (("real", n_real), ("fake", n_fake)):
        d = root / split_name / label
        d.mkdir(parents=True, exist_ok=True)
        for i in range(n):
            img = Image.fromarray((np.random.rand(300, 300, 3) * 255).astype("uint8"))
            img.save(d / f"{i}.jpg")


def test_discover_faces140k_none_is_a_noop():
    real, fake = discover_faces140k(None, "train")
    assert real == [] and fake == [], "no dataset given must never raise or block training"
    print("ok  discover_faces140k(None, ...) is a no-op")


def test_finds_split_regardless_of_nesting_depth():
    """Mirrors _find_split_root's own defensiveness: don't assume one exact
    mount path, search for the real/+fake/ marker pair."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        # Nested one level deeper than the "obvious" root, like a Kaggle
        # dataset-vs-slug mount mismatch.
        _make_split(root / "real_vs_fake" / "real-vs-fake", "train", n_real=3, n_fake=2)
        _make_split(root / "real_vs_fake" / "real-vs-fake", "valid", n_real=2, n_fake=2)

        found = _find_faces140k_split(root, "train")
        assert found is not None and found.name == "train", found

        train_real, train_fake = discover_faces140k(root, "train")
        assert len(train_real) == 3 and len(train_fake) == 2, (train_real, train_fake)

        val_real, val_fake = discover_faces140k(root, "valid")
        assert len(val_real) == 2 and len(val_fake) == 2, (val_real, val_fake)
    print("ok  finds train/valid splits regardless of nesting depth")


def test_missing_dataset_path_fails_loud_not_silent():
    """A PROVIDED but wrong path must raise, not silently train without the
    data the caller thought they were adding."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)  # empty, no real/fake anywhere
        try:
            discover_faces140k(root, "train")
            raise AssertionError("must have raised SystemExit for an unreadable path")
        except SystemExit:
            pass
    print("ok  wrong --faces140k-data path fails loudly instead of training silently without it")


def test_augment_preserves_shape_and_dtype():
    crop = (np.random.rand(PATCH, PATCH, 3) * 255).astype("uint8")
    rng = random.Random(0)
    for _ in range(20):  # augmentation is randomised; run several draws
        out = _augment(crop, rng)
        assert out.shape == (PATCH, PATCH, 3), out.shape
        assert out.dtype == np.uint8, out.dtype
    print("ok  _augment always returns a PATCHxPATCHx3 uint8 array")


def test_forced_label_overrides_mask_derivation():
    """A 140k-faces record (mask=None, forced_label=1.0) must always yield
    that label -- it must not fall through the mask-derivation path meant
    for INP-X's mask-paired records."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        img_path = root / "fake.jpg"
        Image.fromarray((np.random.rand(300, 300, 3) * 255).astype("uint8")).save(img_path)

        recs = [(img_path, None, "faces140k_fake", 1.0)]
        ds = Patches(recs, per_image=4, seed=0, augment=False)
        for i in range(len(ds)):
            _, label = ds[i]
            assert label[0] == 1.0, f"forced_label=1.0 must always win, got {label}"
    print("ok  forced_label overrides mask-based derivation for whole-image datasets")


if __name__ == "__main__":
    for fn in [
        test_discover_faces140k_none_is_a_noop,
        test_finds_split_regardless_of_nesting_depth,
        test_missing_dataset_path_fails_loud_not_silent,
        test_augment_preserves_shape_and_dtype,
        test_forced_label_overrides_mask_derivation,
    ]:
        fn()
    print("\nall checks passed")
