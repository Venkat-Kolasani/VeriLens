"""Train Lane A on INP-X, optionally blended with a real-vs-AI-generated
face dataset. Designed to run in a free Kaggle or Colab notebook (T4/P100)
or locally.

    INP-X dataset:  https://www.kaggle.com/datasets/emirhanbilgic/inpainting-exchange
    Paper:          arXiv 2602.00192 (Nebioglu, Bilgic, Popescu)
    Faces dataset:  https://www.kaggle.com/datasets/xhlulu/140k-real-and-fake-faces
                     (optional, see --faces140k-data below)

Run (INP-X only, original behaviour, unchanged):
    python train_lane_a.py --data /kaggle/input/inpainting-exchange --out weights/lane_a.pt

Run (INP-X + real-vs-AI-generated faces, recommended - see HANDOFF.md §6):
    python train_lane_a.py --data /kaggle/input/inpainting-exchange \\
        --faces140k-data /kaggle/input/140k-real-and-fake-faces \\
        --out weights/lane_a.pt

Why the second dataset. Manual testing this session found two real, distinct
failure modes in a --face-only checkpoint trained on INP-X/CelebA-HQ alone:

1. FALSE POSITIVES on genuine real-world photos (>0.95 "fake" on a real ID
   card and a real portrait). --face-only trains on ONLY the narrowest,
   most curated slice of INP-X (CelebA-HQ), so the model never saw ordinary
   real-world photo variety during training. Fix: drop --face-only (or use
   a smaller --face-weight) so CityScapes/OpenImages/SUN_RGBD - already
   downloaded, no new dataset needed - contribute genuine real-world photo
   diversity to the "real" class.

2. FALSE NEGATIVES on actual AI-generated photos (an AI-generated headshot
   scored ~0, "not fake"). INP-X's fakes are all LOCAL EDITS on top of a
   real photo (inpainting/exchange) - it has no whole-image, generated-
   from-scratch examples, so a model trained only on INP-X never learns
   that failure mode at all. Fix: --faces140k-data blends in whole-image
   real (FFHQ) vs whole-image AI-generated (StyleGAN) examples.

3. AUGMENTATION. Per Wang et al. 2020 ("CNN-generated images are
   surprisingly easy to spot... for now") and the broader generalisation
   literature, random JPEG recompression / blur / resize at train time is
   the single most load-bearing trick for cross-generator generalisation -
   more than architecture choice. --augment (on by default) adds this.

VALIDATE ANY NEW CHECKPOINT AGAINST REAL PHOTOS BEFORE TRUSTING IT. This
script's own val_acc_exchanged/val_acc_faces140k are measured on held-out
splits of the SAME datasets it trained on - useful for catching a broken
run, but not proof of real-world generalisation (that mistake is exactly
what produced the checkpoint this rewrite is fixing). Drop the new
checkpoint into service/weights/lane_a.pt and re-run service/test_service.py
plus a manual check against real, non-dataset photos first.

Two INP-X-specific decisions worth knowing about (unchanged from before):

1. MASKS SHIP WITH THE DATASET, under {split}/masks/{DATASET}_masks/.
   No derivation needed. (|real - exchanged| would also recover them, since
   the exchange restores original pixels outside the edit, but the provided
   masks are exact and free.) They give patch-level labels and localisation.

2. FACES ARE WEIGHTED UP within INP-X. --face-weight oversamples CelebAHQ
   relative to the other three (non-face) INP-X datasets. The paper also
   found face data has the *narrowest* spectral gap, i.e. faces are where
   the global-artifact shortcut is weakest and local content-aware
   detection matters most. --face-only (still supported) restricts to
   CelebAHQ only - this is what produced the narrow-distribution checkpoint
   found unreliable this session; prefer --face-weight alone now.

Trains on real + inpainted + EXCHANGED (+ real/fake faces if blended in).
Including exchanged is the entire point: it removes the global VAE artifact
the incumbent detectors lean on.
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np

PATCH = 224
FACE_DATASET = "celebahq"

# ImageNet normalisation; must match lane_a.py inference.
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


DATASETS = ("CelebAHQ", "CityScapes", "OpenImages", "SUN_RGBD")


def _find_split_root(root: Path, split: str) -> Path:
    """Locate the directory containing `{split}/data`, wherever it is nested.

    Mount layouts differ: a Kaggle script kernel exposed this dataset at
    /kaggle/input/datasets/<owner>/<slug>/inpainting_exchange/, not at the
    usual /kaggle/input/<slug>/. Rather than encode any single guess, search
    for the marker directory and fail loudly with what was actually present.
    """
    direct = root / "inpainting_exchange" / split
    if (direct / "data").is_dir():
        return direct
    if (root / split / "data").is_dir():
        return root / split

    for cand in sorted(root.rglob(split)):
        if (cand / "data").is_dir():
            return cand

    seen = sorted({str(p.relative_to(root)) for p in root.glob("*/*")})[:25]
    raise SystemExit(
        f"Could not locate '{split}/data' anywhere under {root}.\n"
        f"Top-level entries seen: {seen}\n"
        "Pass --data pointing at the mount root, or fix _find_split_root()."
    )


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
    base = _find_split_root(root, split)

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


# --------------------------------------------- 140k Real and Fake Faces


def _find_faces140k_split(root: Path, split_hint: str) -> Path | None:
    """Locate a directory containing both a `real/` and `fake/` subfolder.

    xhlulu/140k-real-and-fake-faces ships as
    real_vs_fake/real-vs-fake/{train,valid,test}/{real,fake}/*.jpg on
    Kaggle, but exact mount nesting varies by platform (same issue
    documented in _find_split_root for INP-X) - search rather than assume
    one exact path. Prefers a directory whose name matches split_hint
    ("train" for the training set, anything else falls back to "valid"
    then "test" for validation), but accepts any real+fake pair if no
    named split is found (e.g. someone pointed --faces140k-data directly
    at one split's folder).
    """
    named = [d for d in root.rglob("*") if d.is_dir() and (d / "real").is_dir() and (d / "fake").is_dir()]
    if not named:
        if (root / "real").is_dir() and (root / "fake").is_dir():
            return root
        return None
    for d in named:
        if d.name.lower() == split_hint.lower():
            return d
    fallback_order = ("train",) if split_hint == "train" else ("valid", "val", "test")
    for name in fallback_order:
        for d in named:
            if d.name.lower() == name:
                return d
    return sorted(named)[0]


def discover_faces140k(root: Path | None, split_hint: str) -> tuple[list[Path], list[Path]]:
    """Returns (real_image_paths, fake_image_paths) for one split, or
    ([], []) if root is None (dataset not provided) or nothing matched.
    Never raises for a missing optional dataset - only a provided-but-
    unreadable path is a hard failure, so a typo doesn't silently train
    without it.
    """
    if root is None:
        return [], []
    split_dir = _find_faces140k_split(root, split_hint)
    if split_dir is None:
        raise SystemExit(
            f"--faces140k-data was given ({root}) but no real/+fake/ folder pair "
            "was found under it. Inspect the layout and fix _find_faces140k_split(), "
            "or drop --faces140k-data to train on INP-X alone."
        )
    exts = {".jpg", ".jpeg", ".png"}
    real = sorted(p for p in (split_dir / "real").iterdir() if p.suffix.lower() in exts)
    fake = sorted(p for p in (split_dir / "fake").iterdir() if p.suffix.lower() in exts)
    return real, fake


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


def _load_mask(mask_path, shape):
    import cv2

    m = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if m is None:
        return None
    if m.shape[:2] != shape:
        m = cv2.resize(m, (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)
    return (m > 127).astype(np.uint8)


def _augment(crop: np.ndarray, r: random.Random) -> np.ndarray:
    """CNNDetection-style augmentation (Wang et al. 2020): random JPEG
    recompression, blur, and resize. This is the single most-established
    trick for cross-generator generalisation - a detector that only ever
    sees pristine training images overfits to that pristine-ness rather
    than to synthesis artifacts, and falls apart on anything recompressed
    by a phone, a messaging app, or a different generator's export
    pipeline. Applied independently and randomly per patch, matching the
    paper's recipe (each augmentation applied with its own probability,
    not all-or-nothing).
    """
    import cv2

    out = crop
    if r.random() < 0.5:  # JPEG recompression at a random quality
        q = r.randint(30, 95)
        ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, q])
        if ok:
            out = cv2.imdecode(enc, cv2.IMREAD_COLOR)
    if r.random() < 0.5:  # Gaussian blur
        k = r.choice([3, 5])
        out = cv2.GaussianBlur(out, (k, k), sigmaX=r.uniform(0.1, 2.0))
    if r.random() < 0.5:  # downsample then upsample: simulates a resize pipeline
        scale = r.uniform(0.5, 0.95)
        h, w = out.shape[:2]
        small = cv2.resize(out, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
        out = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    return out


class Patches:
    """One patch per index, decoded on demand.

    Materialising every patch up front cost ~13 GB on the face-only split
    and OOM-killed a 12.7 GB Colab runtime. Defined at module level so
    DataLoader worker processes can pickle it.

    Each record is (img_path, mask_path_or_None, source_label,
    forced_label_or_None). forced_label is used for whole-image datasets
    with no mask (140k real/fake faces): None means "derive the label from
    the mask via sample_patches", a float means "every patch from this
    image gets this label" (the 140k dataset's own real/fake ground truth).

    Returns numpy; the default collate converts to tensors, which keeps
    torch out of this module's import path.
    """

    def __init__(self, recs, per_image: int, seed: int, augment: bool):
        self.recs = recs
        self.per = per_image
        self.seed = seed
        self.augment = augment

    def __len__(self):
        return len(self.recs) * self.per

    def source(self, i: int) -> str:
        return self.recs[i // self.per][2]

    def __getitem__(self, i):
        import cv2

        ri, k = divmod(i, self.per)
        img_path, mask_path, _, forced_label = self.recs[ri]
        r = random.Random(hash((self.seed, ri, k)) & 0xFFFFFFFF)

        img = cv2.imread(str(img_path))
        if img is None or min(img.shape[:2]) < PATCH:
            return np.zeros((3, PATCH, PATCH), np.float32), np.zeros(1, np.float32)

        if forced_label is not None:
            # Whole-image ground truth (140k faces): any PATCH-sized crop
            # carries the image's own label, no mask involved.
            h, w = img.shape[:2]
            y, x = r.randint(0, h - PATCH), r.randint(0, w - PATCH)
            crop, label = img[y : y + PATCH, x : x + PATCH], float(forced_label)
        else:
            mask = _load_mask(mask_path, img.shape[:2]) if mask_path is not None else None
            crop, label = None, 0.0
            for _ in range(8):  # retry: 2-30% overlaps are ambiguous and skipped
                for c, l in sample_patches(img, mask, 1, r):
                    crop, label = c, l
                    break
                if crop is not None:
                    break
            if crop is None:
                h, w = img.shape[:2]
                y, x = r.randint(0, h - PATCH), r.randint(0, w - PATCH)
                crop = img[y:y + PATCH, x:x + PATCH]
                label = 0.0 if mask is None else float(mask[y:y + PATCH, x:x + PATCH].mean() > 0.5)

        if self.augment:
            crop = _augment(crop, r)

        x_ = (crop[..., ::-1].astype(np.float32) / 255.0 - MEAN) / STD
        return x_.transpose(2, 0, 1).copy(), np.array([label], dtype=np.float32)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True, help="INP-X dataset root")
    ap.add_argument("--faces140k-data", type=Path, default=None,
                    help="optional: 140k-real-and-fake-faces root, adds whole-image "
                         "real/AI-generated examples INP-X doesn't have")
    ap.add_argument("--out", type=Path, default=Path("weights/lane_a.pt"))
    ap.add_argument("--arch", default="efficientnet_b0")
    ap.add_argument("--epochs", type=int, default=3)       # paper's setting
    ap.add_argument("--batch-size", type=int, default=32)  # paper's setting
    ap.add_argument("--lr", type=float, default=1e-4)      # paper's setting
    ap.add_argument("--face-weight", type=int, default=3, help="oversample CelebAHQ")
    ap.add_argument("--face-only", action="store_true",
                     help="CelebAHQ only within INP-X (narrow distribution - found "
                          "unreliable on real photos this session; prefer --face-weight alone)")
    ap.add_argument("--faces140k-limit", type=int, default=0,
                     help="cap real/fake images per split from --faces140k-data (0 = all)")
    ap.add_argument("--augment", action=argparse.BooleanOptionalAction, default=True,
                     help="random JPEG/blur/resize per patch (on by default - see _augment docstring)")
    ap.add_argument("--patches-per-image", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0, help="cap pairs per split (smoke test)")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    import cv2
    import timm
    import torch
    from torch.utils.data import DataLoader

    rng = random.Random(args.seed)
    torch.manual_seed(args.seed)

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

    train_real_140k, train_fake_140k = discover_faces140k(args.faces140k_data, "train")
    val_real_140k, val_fake_140k = discover_faces140k(args.faces140k_data, "valid")
    if args.faces140k_limit:
        train_real_140k = train_real_140k[: args.faces140k_limit]
        train_fake_140k = train_fake_140k[: args.faces140k_limit]
        val_real_140k = val_real_140k[: args.faces140k_limit]
        val_fake_140k = val_fake_140k[: args.faces140k_limit]

    print(f"train: {len(train_pairs)} edits + {len(train_orig)} originals"
          + (f" + {len(train_real_140k)} real/{len(train_fake_140k)} fake (140k faces)" if args.faces140k_data else ""))
    print(f"val:   {len(val_pairs)} edits + {len(val_orig)} originals"
          + (f" + {len(val_real_140k)} real/{len(val_fake_140k)} fake (140k faces)" if args.faces140k_data else ""))
    for ds in DATASETS:
        n = sum(1 for p in train_pairs if p["dataset"] == ds)
        m = sum(1 for p in val_pairs if p["dataset"] == ds)
        if n or m:
            print(f"  {ds:<12} train {n:>6}  val {m:>6}")

    # Records, not decoded patches. Materialising every patch up front cost
    # ~13 GB for the face-only split and OOM-killed a 12.7 GB Colab runtime,
    # so images are decoded and sampled lazily in __getitem__ instead.
    def records(pairs, originals, real140k, fake140k, train: bool):
        out = []
        for rec in pairs:
            reps = args.face_weight if (train and rec["dataset"] == "CelebAHQ") else 1
            for _ in range(reps):
                out.append((rec["exchanged"], rec["mask"], "exchanged", None))
                if rec["inpainted"] is not None:
                    out.append((rec["inpainted"], rec["mask"], "inpainted", None))
        out += [(op, None, "original", None) for op in originals]
        out += [(p, None, "faces140k_real", 0.0) for p in real140k]
        out += [(p, None, "faces140k_fake", 1.0) for p in fake140k]
        rng.shuffle(out)
        return out

    train_recs = records(train_pairs, train_orig, train_real_140k, train_fake_140k, True)
    val_recs = records(val_pairs, val_orig, val_real_140k, val_fake_140k, False)
    train_ds = Patches(train_recs, args.patches_per_image, args.seed, args.augment)
    val_ds = Patches(val_recs, args.patches_per_image, args.seed + 1, augment=False)  # eval on clean patches
    print(f"train {len(train_recs)} images -> {len(train_ds)} patches | "
          f"val {len(val_recs)} images -> {len(val_ds)} patches")
    if not len(train_ds) or not len(val_ds):
        raise SystemExit("Empty patch set. Check --patches-per-image and the mask threshold.")

    dev = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"device: {dev}")
    model = timm.create_model(args.arch, pretrained=True, num_classes=1).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    lossf = torch.nn.BCEWithLogitsLoss()

    tl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2, drop_last=True)
    vl = DataLoader(val_ds, batch_size=args.batch_size, num_workers=2)

    from tqdm.auto import tqdm

    SOURCES = ("exchanged", "inpainted", "original", "faces140k_real", "faces140k_fake")
    best = 0.0
    for ep in range(args.epochs):
        model.train()
        run = 0.0
        pbar = tqdm(enumerate(tl), total=len(tl), desc=f"epoch {ep+1}/{args.epochs}")
        for i, (x, y) in pbar:
            x, y = x.to(dev), y.to(dev)
            opt.zero_grad()
            loss = lossf(model(x), y)
            loss.backward()
            opt.step()
            run += loss.item()
            pbar.set_postfix(loss=f"{run/(i+1):.4f}")

        # Score per source. The exchanged column is the honest headline for
        # INP-X: it is the setting where published detectors drop to
        # chance. faces140k_fake is the new headline for whole-image
        # generation - the failure mode exchanged/inpainted don't cover.
        model.eval()
        by = {k: [0, 0] for k in SOURCES}
        idx = 0
        with torch.no_grad():
            for x, y in vl:
                pred = (torch.sigmoid(model(x.to(dev))) > 0.5).float().cpu()
                for j in range(y.shape[0]):
                    src = val_ds.source(idx)
                    by[src][1] += 1
                    if pred[j].item() == y[j].item():
                        by[src][0] += 1
                    idx += 1
        accs = {k: (v[0] / v[1] if v[1] else 0.0) for k, v in by.items()}
        overall = sum(v[0] for v in by.values()) / max(sum(v[1] for v in by.values()), 1)
        print(f"epoch {ep+1}: overall {overall:.4f} | " +
              " | ".join(f"{k} {accs[k]:.4f} (n={by[k][1]})" for k in accs if by[k][1]))

        # Headline metric: exchanged accuracy if INP-X data is present,
        # else faces140k_fake (pure-140k runs have no exchanged examples).
        headline = accs["exchanged"] if by["exchanged"][1] else accs["faces140k_fake"]
        # Always save the first epoch. Guarding only on improvement meant a
        # run whose first-epoch exchanged accuracy was 0.0 never wrote a
        # checkpoint at all, and failed later with a bare "no checkpoint".
        if headline > best or ep == 0:
            best = headline
            args.out.parent.mkdir(parents=True, exist_ok=True)
            torch.save(
                {
                    "arch": args.arch,
                    "state_dict": model.state_dict(),
                    # lane_a.py weights this lane by this number, so an
                    # undocumented checkpoint cannot dominate the judge.
                    # NOTE: measured on a held-out split of the SAME
                    # datasets trained on - validate against real,
                    # non-dataset photos before trusting it (see the
                    # module docstring).
                    "val_acc_exchanged": accs["exchanged"],
                    "val_acc_inpainted": accs["inpainted"],
                    "val_acc_original": accs["original"],
                    "val_acc_faces140k_real": accs["faces140k_real"],
                    "val_acc_faces140k_fake": accs["faces140k_fake"],
                    "val_acc_overall": overall,
                    "epochs": ep + 1,
                    "face_weight": args.face_weight,
                    "face_only": args.face_only,
                    "augment": args.augment,
                    "faces140k_used": args.faces140k_data is not None,
                    "datasets": sorted({p["dataset"] for p in train_pairs}),
                },
                args.out,
            )
            print(f"  saved {args.out} (headline acc={headline:.4f})")

    print(f"\ndone. best headline val acc: {best:.4f}")
    print("Copy the checkpoint to service/weights/lane_a.pt and install requirements-ml.txt.")
    print("Then VALIDATE against real, non-dataset photos before trusting it - see the module docstring.")


if __name__ == "__main__":
    main()
