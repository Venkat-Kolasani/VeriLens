"""Train Lane A on INP-X. Designed to run in a free Kaggle notebook (T4/P100).

    Dataset: https://www.kaggle.com/datasets/emirhanbilgic/inpainting-exchange
    Paper:   arXiv 2602.00192 (Nebioglu, Bilgic, Popescu)

Run:  python train_lane_a.py --data /kaggle/input/inpainting-exchange --out weights/lane_a.pt

Two decisions worth knowing about:

1. MASKS SHIP WITH THE DATASET, under {split}/masks/{DATASET}_masks/.
   No derivation needed. (|real - exchanged| would also recover them, since
   the exchange restores original pixels outside the edit, but the provided
   masks are exact and free.) They give patch-level labels and localisation.

2. FACES ARE WEIGHTED UP. INP-X spans CelebA-HQ, CityScapes, OpenImages and
   SUN-RGBD - only CelebA-HQ is faces. Trained flat, this becomes a general
   inpainting detector, not a KYC one. --face-weight oversamples CelebA-HQ.
   The paper also found face data has the *narrowest* spectral gap, i.e. faces
   are where the global-artifact shortcut is weakest and local content-aware
   detection matters most.

Trains on real + inpainted + EXCHANGED. Including exchanged is the entire
point: it removes the global VAE artifact the incumbent detectors lean on.
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np

PATCH = 224
FACE_DATASET = "celebahq"


DATASETS = ("CelebAHQ", "CityScapes", "OpenImages", "SUN_RGBD")


def discover(root: Path, split: str) -> tuple[list[dict], list[Path]]:
    """Find mask-paired edits, plus untouched originals to use as negatives.

    Real layout (confirmed by inspecting the mounted dataset, not guessed):

        {split}/data/originals/{DATASET}/
        {split}/data/standard_inpainting/{DATASET}/
        {split}/data/inpainting_exchange/{DATASET}/
        {split}/masks/{DATASET}_masks/

    Filenames are `{mask_stem}_{DATASET}_{MODEL}[_simple].jpg`, where the
    `_simple` suffix marks the exchanged variant. So splitting an exchanged
    stem on `_{DATASET}_` recovers the mask stem exactly.
    """
    base = root / "inpainting_exchange" / split
    if not base.exists():  # some mounts nest one level deeper
        found = next((p.parent for p in root.rglob(f"{split}/data") if p.is_dir()), None)
        if found is None:
            raise SystemExit(f"Could not locate {split} under {root}")
        base = found

    pairs: list[dict] = []
    originals: list[Path] = []

    for ds in DATASETS:
        mask_dir = base / "masks" / f"{ds}_masks"
        exc_dir = base / "data" / "inpainting_exchange" / ds
        inp_dir = base / "data" / "standard_inpainting" / ds
        org_dir = base / "data" / "originals" / ds

        if org_dir.is_dir():
            originals += [p for p in org_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
        if not (mask_dir.is_dir() and exc_dir.is_dir()):
            continue

        masks = {p.stem: p for p in mask_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}}
        for exc in exc_dir.iterdir():
            if exc.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            stem = exc.stem
            key = stem.split(f"_{ds}_")[0]
            mask = masks.get(key)
            if mask is None:
                continue
            inp = inp_dir / f"{stem[:-len('_simple')]}{exc.suffix}" if stem.endswith("_simple") else None
            pairs.append({
                "dataset": ds,
                "mask": mask,
                "exchanged": exc,
                "inpainted": inp if (inp and inp.exists()) else None,
            })

    if not pairs:
        raise SystemExit(
            f"No mask-paired edits found under {base}.\n"
            "Inspect the layout and fix discover() rather than training on a "
            "partial match: a silently mismatched pairing trains the wrong thing."
        )
    return pairs, originals


def derive_mask(real: np.ndarray, exchanged: np.ndarray, tol: int = 6) -> np.ndarray:
    """Fallback mask recovery, unused when the dataset ships masks.

    Kept because it documents why the exchange operation makes supervision
    cheap: outside the edit the pixels are identical to the original.
    """
    d = np.abs(real.astype(np.int16) - exchanged.astype(np.int16)).max(axis=2)
    return (d > tol).astype(np.uint8)


def sample_patches(img: np.ndarray, mask: np.ndarray | None, n: int, rng: random.Random):
    """Yield (patch, label). Label 1 if the patch substantially overlaps the
    synthesised region, else 0. A patch clipping only the edge of an edit is
    ambiguous, so it is skipped rather than labelled either way."""
    h, w = img.shape[:2]
    if h < PATCH or w < PATCH:
        return
    for _ in range(n):
        y, x = rng.randint(0, h - PATCH), rng.randint(0, w - PATCH)
        crop = img[y : y + PATCH, x : x + PATCH]
        if mask is None:
            yield crop, 0.0
            continue
        frac = float(mask[y : y + PATCH, x : x + PATCH].mean())
        if frac > 0.30:
            yield crop, 1.0
        elif frac < 0.02:
            yield crop, 0.0
        # 0.02..0.30 -> ambiguous, dropped on purpose


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("weights/lane_a.pt"))
    ap.add_argument("--arch", default="efficientnet_b0")
    ap.add_argument("--epochs", type=int, default=3)       # paper's setting
    ap.add_argument("--batch-size", type=int, default=32)  # paper's setting
    ap.add_argument("--lr", type=float, default=1e-4)      # paper's setting
    ap.add_argument("--face-weight", type=int, default=3, help="oversample CelebAHQ")
    ap.add_argument("--face-only", action="store_true", help="CelebAHQ only (pure KYC domain)")
    ap.add_argument("--patches-per-image", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0, help="cap pairs per split (smoke test)")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    import cv2
    import timm
    import torch
    from torch.utils.data import DataLoader, Dataset

    rng = random.Random(args.seed)
    torch.manual_seed(args.seed)

    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def load_split(split: str):
        pairs, originals = discover(args.data, split)
        if args.face_only:
            pairs = [p for p in pairs if p["dataset"] == "CelebAHQ"]
            originals = [p for p in originals if "CelebAHQ" in str(p)]
        rng.shuffle(pairs)
        rng.shuffle(originals)
        if args.limit:
            pairs = pairs[: args.limit]
            originals = originals[: args.limit]
        return pairs, originals

    train_pairs, train_orig = load_split("train-data")
    val_pairs, val_orig = load_split("test-data")

    print(f"train: {len(train_pairs)} edits + {len(train_orig)} originals")
    print(f"val:   {len(val_pairs)} edits + {len(val_orig)} originals")
    for ds in DATASETS:
        n = sum(1 for p in train_pairs if p["dataset"] == ds)
        m = sum(1 for p in val_pairs if p["dataset"] == ds)
        if n or m:
            print(f"  {ds:<12} train {n:>6}  val {m:>6}")

    def build(pairs, originals, train: bool):
        """(patch, label, source) where source is 'exchanged'/'inpainted'/'original'."""
        out = []
        for rec in pairs:
            reps = args.face_weight if (train and rec["dataset"] == "CelebAHQ") else 1
            exc = cv2.imread(str(rec["exchanged"]))
            mask_img = cv2.imread(str(rec["mask"]), cv2.IMREAD_GRAYSCALE)
            if exc is None or mask_img is None:
                continue
            if mask_img.shape[:2] != exc.shape[:2]:
                mask_img = cv2.resize(mask_img, (exc.shape[1], exc.shape[0]),
                                      interpolation=cv2.INTER_NEAREST)
            mask = (mask_img > 127).astype(np.uint8)
            if mask.mean() < 1e-4:
                continue
            inp = cv2.imread(str(rec["inpainted"])) if rec["inpainted"] else None
            for _ in range(reps):
                # exchanged: local content only, global VAE artifact removed.
                # This is the case incumbent detectors fail, so it carries
                # the most weight in how we judge the model.
                for c, l in sample_patches(exc, mask, args.patches_per_image, rng):
                    out.append((c, l, "exchanged"))
                if inp is not None and inp.shape[:2] == mask.shape[:2]:
                    for c, l in sample_patches(inp, mask, args.patches_per_image, rng):
                        out.append((c, l, "inpainted"))
        for op in originals:
            img = cv2.imread(str(op))
            if img is None:
                continue
            for c, l in sample_patches(img, None, args.patches_per_image, rng):
                out.append((c, l, "original"))
        rng.shuffle(out)
        return out

    class Patches(Dataset):
        def __init__(self, items): self.items = items
        def __len__(self): return len(self.items)
        def __getitem__(self, i):
            crop, label, _ = self.items[i]
            x = (crop[..., ::-1].astype(np.float32) / 255.0 - mean) / std
            return torch.from_numpy(x.transpose(2, 0, 1).copy()), torch.tensor([label])

    print("\ndecoding images and sampling patches...")
    train_items = build(train_pairs, train_orig, True)
    val_items = build(val_pairs, val_orig, False)
    train_ds, val_ds = Patches(train_items), Patches(val_items)
    pos = sum(1 for _, l, _ in train_items if l > 0.5)
    print(f"train patches {len(train_items)} ({pos} positive) | val {len(val_items)}")
    if not len(train_ds) or not len(val_ds):
        raise SystemExit("Empty patch set. Check --patches-per-image and the mask threshold.")

    dev = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"device: {dev}")
    model = timm.create_model(args.arch, pretrained=True, num_classes=1).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    lossf = torch.nn.BCEWithLogitsLoss()

    tl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2, drop_last=True)
    vl = DataLoader(val_ds, batch_size=args.batch_size, num_workers=2)

    best = 0.0
    for ep in range(args.epochs):
        model.train()
        run = 0.0
        for i, (x, y) in enumerate(tl):
            x, y = x.to(dev), y.to(dev)
            opt.zero_grad()
            loss = lossf(model(x), y)
            loss.backward()
            opt.step()
            run += loss.item()
            if i % 100 == 0:
                print(f"  epoch {ep+1} step {i}/{len(tl)} loss {run/(i+1):.4f}", flush=True)

        # Score per source. The exchanged column is the honest headline: it is
        # the setting where published detectors drop to chance.
        model.eval()
        by = {k: [0, 0] for k in ("exchanged", "inpainted", "original")}
        idx = 0
        with torch.no_grad():
            for x, y in vl:
                pred = (torch.sigmoid(model(x.to(dev))) > 0.5).float().cpu()
                for j in range(y.shape[0]):
                    src = val_items[idx][2]
                    by[src][1] += 1
                    if pred[j].item() == y[j].item():
                        by[src][0] += 1
                    idx += 1
        accs = {k: (v[0] / v[1] if v[1] else 0.0) for k, v in by.items()}
        overall = sum(v[0] for v in by.values()) / max(sum(v[1] for v in by.values()), 1)
        print(f"epoch {ep+1}: overall {overall:.4f} | " +
              " | ".join(f"{k} {accs[k]:.4f} (n={by[k][1]})" for k in accs))

        if accs["exchanged"] > best:
            best = accs["exchanged"]
            args.out.parent.mkdir(parents=True, exist_ok=True)
            torch.save(
                {
                    "arch": args.arch,
                    "state_dict": model.state_dict(),
                    # lane_a.py weights this lane by this number, so an
                    # undocumented checkpoint cannot dominate the judge.
                    "val_acc_exchanged": accs["exchanged"],
                    "val_acc_inpainted": accs["inpainted"],
                    "val_acc_original": accs["original"],
                    "val_acc_overall": overall,
                    "epochs": ep + 1,
                    "face_weight": args.face_weight,
                    "face_only": args.face_only,
                    "datasets": sorted({p["dataset"] for p in train_pairs}),
                },
                args.out,
            )
            print(f"  saved {args.out} (val_acc_exchanged={accs['exchanged']:.4f})")

    print(f"\ndone. best val acc on exchanged: {best:.4f}")
    print("Copy the checkpoint to service/weights/lane_a.pt and install requirements-ml.txt.")


if __name__ == "__main__":
    main()
