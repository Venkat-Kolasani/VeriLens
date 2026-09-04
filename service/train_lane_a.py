"""Train Lane A on INP-X. Designed to run in a free Kaggle notebook (T4/P100).

    Dataset: https://www.kaggle.com/datasets/emirhanbilgic/inpainting-exchange
    Paper:   arXiv 2602.00192 (Nebioglu, Bilgic, Popescu)

Run:  python train_lane_a.py --data /kaggle/input/inpainting-exchange --out weights/lane_a.pt

Two decisions worth knowing about:

1. MASKS ARE FREE. INP-X's "exchanged" variant restores the original pixels
   *outside* the edited region, so |real - exchanged| is non-zero ONLY where
   content was synthesised. That difference is a pixel-accurate supervision
   mask at no annotation cost, which is what makes patch-level labels and
   localisation possible here.

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


def find_triplets(root: Path) -> list[tuple[Path, Path, Path, str]]:
    """Locate (real, inpainted, exchanged, dataset) groups.

    The published layout is not guaranteed stable, so this discovers rather
    than assumes, and fails loudly with what it actually saw.
    """
    reals: dict[tuple[str, str], Path] = {}
    inpainted: dict[tuple[str, str], Path] = {}
    exchanged: dict[tuple[str, str], Path] = {}

    for p in root.rglob("*"):
        if p.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
            continue
        parts = [s.lower() for s in p.parts]
        blob = "/".join(parts)
        dataset = next(
            (d for d in ("celebahq", "celeba", "cityscapes", "openimages", "sun") if d in blob),
            "unknown",
        )
        key = (dataset, p.stem)
        if "exchang" in blob:
            exchanged[key] = p
        elif "inpaint" in blob:
            inpainted[key] = p
        elif "real" in blob or "original" in blob:
            reals[key] = p

    triplets = [
        (reals[k], inpainted[k], exchanged[k], k[0])
        for k in exchanged
        if k in reals and k in inpainted
    ]
    if not triplets:
        raise SystemExit(
            f"No (real, inpainted, exchanged) triplets found under {root}.\n"
            f"Saw {len(reals)} real, {len(inpainted)} inpainted, {len(exchanged)} exchanged.\n"
            "Inspect the layout and adjust find_triplets() rather than training on a "
            "partial match -- a silently mismatched pairing trains the wrong thing."
        )
    return triplets


def derive_mask(real: np.ndarray, exchanged: np.ndarray, tol: int = 6) -> np.ndarray:
    """The free mask: non-zero only where content was synthesised."""
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
    ap.add_argument("--face-weight", type=int, default=3, help="oversample CelebA-HQ")
    ap.add_argument("--patches-per-image", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0, help="cap triplets (smoke test)")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    import cv2
    import timm
    import torch
    from torch.utils.data import DataLoader, Dataset

    rng = random.Random(args.seed)
    torch.manual_seed(args.seed)

    triplets = find_triplets(args.data)
    if args.limit:
        triplets = triplets[: args.limit]
    rng.shuffle(triplets)
    split = int(len(triplets) * 0.9)
    train_t, val_t = triplets[:split], triplets[split:]
    print(f"{len(triplets)} triplets | train {len(train_t)} | val {len(val_t)}")
    for d in sorted({t[3] for t in triplets}):
        print(f"  {d}: {sum(1 for t in triplets if t[3] == d)}")

    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def build(items, train: bool):
        out = []
        for real_p, inp_p, exc_p, dataset in items:
            reps = args.face_weight if (train and dataset.startswith(FACE_DATASET)) else 1
            real = cv2.imread(str(real_p))
            exc = cv2.imread(str(exc_p))
            inp = cv2.imread(str(inp_p))
            if real is None or exc is None or inp is None or real.shape != exc.shape:
                continue
            mask = derive_mask(real, exc)
            if mask.mean() < 1e-4:  # no detectable edit -> unusable pair
                continue
            for _ in range(reps):
                # exchanged: local content only, global artifact removed
                out += list(sample_patches(exc, mask, args.patches_per_image, rng))
                # inpainted: same edit, artifact still present
                if inp.shape == mask.shape[:2] + (3,):
                    out += list(sample_patches(inp, mask, args.patches_per_image, rng))
                # real: negatives
                out += list(sample_patches(real, None, args.patches_per_image, rng))
        return out

    class Patches(Dataset):
        def __init__(self, items): self.items = items
        def __len__(self): return len(self.items)
        def __getitem__(self, i):
            crop, label = self.items[i]
            x = (crop[..., ::-1].astype(np.float32) / 255.0 - mean) / std
            return torch.from_numpy(x.transpose(2, 0, 1).copy()), torch.tensor([label])

    print("building patch sets (decoding images)...")
    train_ds, val_ds = Patches(build(train_t, True)), Patches(build(val_t, False))
    pos = sum(1 for _, l in train_ds.items if l > 0.5)
    print(f"train patches {len(train_ds)} ({pos} positive) | val {len(val_ds)}")
    if not len(train_ds) or not len(val_ds):
        raise SystemExit("Empty patch set. Check --patches-per-image and the mask tolerance.")

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
            if i % 50 == 0:
                print(f"  epoch {ep+1} step {i}/{len(tl)} loss {run/(i+1):.4f}")

        model.eval()
        correct = total = 0
        with torch.no_grad():
            for x, y in vl:
                pred = (torch.sigmoid(model(x.to(dev))) > 0.5).float().cpu()
                correct += (pred == y).sum().item()
                total += y.numel()
        acc = correct / max(total, 1)
        print(f"epoch {ep+1}: val acc on exchanged-inclusive held-out = {acc:.4f}")

        if acc > best:
            best = acc
            args.out.parent.mkdir(parents=True, exist_ok=True)
            torch.save(
                {
                    "arch": args.arch,
                    "state_dict": model.state_dict(),
                    # lane_a.py weights this lane by this number. Recorded so an
                    # undocumented checkpoint cannot silently dominate the judge.
                    "val_acc_exchanged": acc,
                    "epochs": ep + 1,
                    "face_weight": args.face_weight,
                    "datasets": sorted({t[3] for t in triplets}),
                },
                args.out,
            )
            print(f"  saved {args.out} (val_acc_exchanged={acc:.4f})")

    print(f"\ndone. best val acc {best:.4f}")
    print("Copy the checkpoint to service/weights/lane_a.pt and install requirements-ml.txt.")


if __name__ == "__main__":
    main()
