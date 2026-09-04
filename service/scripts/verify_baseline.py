"""Re-verify the claim the demo rests on, before quoting it on stage.

arXiv 2602.00192 Table 2 reports Sightengine and Hive Moderation both falling
from ~91% accuracy to ~55% -- chance -- on INP-X "exchanged" images, where the
edit is local and the surrounding pixels are restored to the original.

That paper was submitted 2026-01-30. A vendor has had months to patch a
publicly documented failure, so the number must be re-measured rather than
quoted from the paper. This script measures it.

    export SIGHTENGINE_USER=... SIGHTENGINE_SECRET=...
    python scripts/verify_baseline.py --data /path/to/inpainting-exchange -n 40

Reads the same directory layout as train_lane_a.py. Outputs accuracy per
category for the baseline and for our judge.

If the baseline still collapses on `exchanged`, the side-by-side demo stands.
If it has been patched, drop Sightengine from the pitch and fall back to the
open-source detectors -- the paper's best of 11 still only reaches 0.604 on
INP-X, so the argument survives with less drama and full reproducibility.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from baseline import sightengine  # noqa: E402
from judge import judge  # noqa: E402
from lanes import lane_b_noise, lane_c_compression, load_image, quality_gate  # noqa: E402
from train_lane_a import discover  # noqa: E402


def ours(data: bytes) -> str:
    """Our verdict, collapsed to REAL/FAKE/ABSTAIN for scoring."""
    pil, bgr = load_image(data)
    q = quality_gate(pil, bgr)
    v = judge(q, [lane_b_noise(bgr), lane_c_compression(pil, bgr)])
    return {"REAL": "REAL", "LIKELY_FAKE": "FAKE"}.get(v.authenticity, "ABSTAIN")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("-n", type=int, default=40, help="images per category")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    if not os.getenv("SIGHTENGINE_USER") or not os.getenv("SIGHTENGINE_SECRET"):
        print("Set SIGHTENGINE_USER and SIGHTENGINE_SECRET first.")
        print("A free trial account is enough for this sample size.")
        raise SystemExit(1)

    pairs, originals = discover(args.data, "test-data")
    rnd = random.Random(args.seed)
    rnd.shuffle(pairs)
    rnd.shuffle(originals)
    pairs = pairs[: args.n]
    originals = originals[: args.n]
    print(f"{len(pairs)} edits + {len(originals)} originals "
          f"-> ~{len(pairs) * 2 + len(originals)} API calls\n")

    categories = {
        "real": ("REAL", [(o, None) for o in originals]),
        "inpainted": ("FAKE", [(p["inpainted"], None) for p in pairs if p["inpainted"]]),
        "exchanged": ("FAKE", [(p["exchanged"], None) for p in pairs]),
    }
    tally = {c: {"base_ok": 0, "ours_ok": 0, "ours_abstain": 0, "n": 0} for c in categories}

    for cat, (expected, items) in categories.items():
        for i, (path, _) in enumerate(items, 1):
            data = path.read_bytes()

            b = await sightengine(data, path.name)
            if not b.available:
                print(f"Baseline unavailable: {'; '.join(b.reasons)}")
                raise SystemExit(1)

            t = tally[cat]
            t["n"] += 1
            if b.verdict == expected:
                t["base_ok"] += 1
            o = ours(data)
            if o == expected:
                t["ours_ok"] += 1
            elif o == "ABSTAIN":
                t["ours_abstain"] += 1
            print(f"  {cat} {i}/{len(items)}   ", end="\r", flush=True)

    print("\n")
    print(f"{'category':<12}{'n':>5}{'baseline':>11}{'ours':>9}{'ours abstain':>15}")
    print("-" * 52)
    for cat, t in tally.items():
        n = max(t["n"], 1)
        print(
            f"{cat:<12}{t['n']:>5}{t['base_ok'] / n:>11.3f}"
            f"{t['ours_ok'] / n:>9.3f}{t['ours_abstain'] / n:>15.3f}"
        )

    ex = tally["exchanged"]
    ex_acc = ex["base_ok"] / max(ex["n"], 1)
    print(f"\nBaseline accuracy on exchanged images: {ex_acc:.3f}")
    if ex_acc < 0.65:
        print("Paper's finding REPRODUCES. The side-by-side demo stands.")
    else:
        print(
            "Baseline appears PATCHED since the paper. Do not claim it fails.\n"
            "Fall back to the open-source detectors (paper's best on INP-X: 0.604)."
        )
    print("\nAbstentions are not errors: they route to human review by design.")


if __name__ == "__main__":
    asyncio.run(main())
