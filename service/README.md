# VeriLens forensics service

The detection brain behind a KYC deepfake / AI-generated image detector. A small
FastAPI app that runs two training-free forensic lanes plus a quality gate over
an uploaded image and hands back a structured verdict with the reasons behind it.

CPU-only. **No model weights are needed for the shipped lanes** (B and C are pure
signal processing over OpenCV/NumPy), so it deploys as-is on free CPU hosting.

Version string is `CFG.version` in `config.py` — currently `0.1.0-lanes-bc`.

---

## Run it locally

```bash
cd service
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Interactive docs at `http://localhost:8000/docs`.

**A physical phone cannot reach `localhost`.** `localhost` on the handset is the
handset. Bind `0.0.0.0` (as above) and point the app at the dev machine's LAN
address — e.g. `http://192.168.1.42:8000`. Find it with `ipconfig getifaddr en0`
on macOS or `hostname -I` on Linux. Both devices must be on the same network.
CORS is already wide open (`allow_origins=["*"]`), so no extra config is needed.

---

## Endpoints

Uploads are `multipart/form-data`. `attested` is a **query parameter**, not a form
field — it is declared as a plain `bool` on the handler, which FastAPI reads from
the query string. Any single upload over **12 MB** returns `413`; an empty file
returns `400`; an undecodable image returns `400`.

### `POST /v1/analyze`

Full KYC check. Two files: `id_image` and `selfie`. Authenticity is the **worst**
of the two — a genuine selfie paired with a doctored ID still fails. Reasons are
prefixed `[ID]` / `[Selfie]`. `attested` applies to the selfie only.

```bash
curl -X POST "http://localhost:8000/v1/analyze?attested=false" \
  -F "id_image=@/path/to/id.jpg" \
  -F "selfie=@/path/to/selfie.jpg"
```

Returns `AnalyzeOut` with both `id_image` and `selfie` analyses populated.

Note the current honest ceiling: Lane E (face match) is wired in, but its
dependencies are optional. Without `requirements-ml.txt` installed, no face
similarity can be computed, so this endpoint reports
`identity: "INDETERMINATE"` and routes to `decision: "REVIEW"`.

That is deliberate, not a stub. A pair check whose identity cannot be verified
must not accept — `identity: null` means "not applicable" (single image), never
"unverified". **`ACCEPT` is therefore not reachable from
this endpoint yet** — by design, not by accident.

### `POST /v1/analyze/single`

Authenticity only. One file: `image`. No identity axis — there is nothing to
match against, so `identity` comes back `null` and `ACCEPT` is reachable.

```bash
curl -X POST "http://localhost:8000/v1/analyze/single?attested=true" \
  -F "image=@/path/to/photo.jpg"
```

The per-image analysis is returned under the `selfie` field (`id_image` is
`null`) — the response model is shared with `/v1/analyze`.

### `POST /v1/baseline`

Runs one image through the configured baseline detectors and through our judge,
returning both side by side. This is the comparison the demo turns on: a
commercial detector returns a single number with no region and no reasoning,
while ours reports per-lane evidence and can abstain.

```bash
curl -X POST "http://localhost:8000/v1/baseline" -F "image=@selfie.jpg"
```

Baseline credentials are optional. Without `SIGHTENGINE_USER` /
`SIGHTENGINE_SECRET` the baseline reports `available: false` with a reason and
our own verdict is still returned.

Before quoting the paper's numbers anywhere, re-measure them:

```bash
export SIGHTENGINE_USER=... SIGHTENGINE_SECRET=...
python scripts/verify_baseline.py --data /path/to/inpainting-exchange -n 40
```

arXiv 2602.00192 Table 2 reports Sightengine and Hive both falling from ~91%
to ~55% on INP-X exchanged images. That paper was submitted 2026-01-30, so the
vendor has had months to patch a documented failure. The script prints
accuracy per category and states whether the finding still reproduces.

### `GET /v1/health`

```bash
curl http://localhost:8000/v1/health
# {"status":"ok","version":"0.1.0-lanes-bc"}
```

### `GET /v1/model-card`

Every threshold in `config.py`, the lane inventory, `confidence_is_calibrated`,
and the `known_limitations` / `does_not_claim` lists. Served as an endpoint so
the honesty claims are machine-inspectable rather than only asserted in a README.

```bash
curl http://localhost:8000/v1/model-card
```

---

## Response shape

```jsonc
{
  "version": "0.1.0-lanes-bc",
  "verdict": {
    "authenticity": "INSUFFICIENT_EVIDENCE",
    "identity": null,
    "decision": "REVIEW",
    "confidence": 0.0,
    "confidence_is_calibrated": false,
    "score": null,                    // null when abstaining before aggregation
    "reasons": [{ "lane": "Q", "text": "...", "severity": "warn" }]
  },
  "id_image": null,
  "selfie": {
    "sha256": "...", "width": 512, "height": 512,
    "quality_usable": true, "quality_reasons": [],
    "jpeg_quality": 92,                // null when the image has no JPEG history
    "lanes": [
      { "lane": "B", "name": "Noise residual", "score": 0.0, "confidence": 0.9,
        "usable": true, "reasons": ["..."], "box": null }
    ]
  }
}
```

`box` is `[x, y, w, h]` in pixels of the largest flagged block cluster.
`reasons[].severity` is one of `info`, `warn`, `critical`, sorted critical-first.

---

## The three axes

Conflating these is how detectors produce nonsense. "A real photo of the wrong
person" and "an AI-generated image of the right person" are different failures.

| Axis | Allowed values |
|---|---|
| `authenticity` | `REAL` \| `LIKELY_FAKE` \| `INSUFFICIENT_EVIDENCE` |
| `identity` | `MATCH` \| `MISMATCH` \| `INDETERMINATE` \| `null` (only one image supplied / no face similarity computed) |
| `decision` | `ACCEPT` \| `REJECT` \| `REVIEW` |

Decision folds both axes: `LIKELY_FAKE` → `REJECT`; identity `MISMATCH` →
`REJECT` even when the pixels look authentic; identity `INDETERMINATE` →
`REVIEW`; otherwise `ACCEPT`. Every abstention routes to `REVIEW`, never to a
guess.

---

## The four ways it abstains

`INSUFFICIENT_EVIDENCE` + `REVIEW` is a first-class output, not an error path.
Four distinct conditions in `judge.py` produce it:

1. **Quality gate failure** (`quality.usable == False`). The image cannot carry a
   forensic read at all: short side below `min_side_px` (256), Laplacian variance
   below `min_laplacian_var` (60.0, i.e. blurred or upscaled), or estimated JPEG
   quality below `min_jpeg_quality` (55, i.e. recompression has destroyed the
   traces). Returns before any score is computed, so `score` is `null`.

2. **Too few usable lanes** — fewer than `min_usable_lanes` (2) lanes reported
   `confidence >= min_lane_confidence` (0.35). With nothing to cross-check
   against, a single lane's read is not evidence. `score` is `null`.

3. **Lane disagreement** — the confidence-weighted spread of lane scores exceeds
   `max_disagreement` (0.28). Averaging away a genuine conflict manufactures
   false confidence, so conflicting evidence abstains. `score` carries the
   aggregate so callers can see what was thrown out.

4. **Uncertainty band** — the aggregate score lands strictly between
   `real_below` (0.35) and `fake_above` (0.65). The band is deliberately wide:
   in KYC a confidently wrong reject locks a real user out of their bank.
   `score` carries the aggregate.

Attestation (`attested=true`) can only ever *raise* confidence, never lower it.
Its **absence is never evidence of fakery** — almost every genuine photo on
earth carries no attestation, so penalising its absence would fail real users
en masse.

**It currently grants nothing.** The flag is asserted by the client and the
service cannot verify it, so `config.trust_client_attestation` is `False` and
`attested_bonus` (0.10) is not applied. A hostile client would simply send
`attested=true`; honouring that would advertise an injection defence that does
not exist. The claim is still reported in `reasons[]` so the gap is visible
rather than silently dropped.

To make it real, the service must issue a nonce that the device signs over the
image bytes, and verify that signature. Then flip the flag.

---

## What the lanes actually measure

Both lanes are **intra-image consistency checks**: they look for regions
anomalous *relative to the rest of the same image*. No reference image, no camera
attribution, no PRNU database. Shared machinery: a 16 px (`block_px`)
non-overlapping block grid, a median/MAD modified z-score
(Iglewicz–Hoaglin, cutoff `outlier_z = 3.5`) so a large manipulated region cannot
drag the baseline it is measured against, and a largest-connected-cluster step
(`min_cluster_blocks = 4`) because one stray block is sensor noise while a
contiguous cluster is what an edited region looks like. Cluster area maps to a
0–1 score through a saturating curve shaped so `score_area_saturation` (5 %) of
the frame reads ≈ 0.6.

**Lane B — Noise residual.** Bilateral-filters the greyscale image, takes
`|original − denoised|` as a per-pixel residual, and blocks it. It flags the
**low side only** (`z < -outlier_z`): diffusion-generated content is typically
*smoother* than sensor output — it lacks the per-pixel noise a real camera
imprints. So the signal is "regions unnaturally noise-free for their detail
level". Lane confidence scales with the median residual energy: no texture
anywhere means no noise floor to compare against.

**Lane C — Compression / ELA.** Recompresses the image at a known quality
(`ela_quality = 90`), takes the per-pixel max channel difference as the error
level, and blocks it. It flags **both sides** (`|z| > outlier_z`): a region
pasted or synthesised with a different compression history reacts differently to
recompression than the rest of the frame. Confidence is derived from the
estimated JPEG quality (recovered by inverting the stored luma quantization table
against the IJG Annex K standard table); with **no JPEG history at all** —
PNG, raw camera output — confidence drops to a flat 0.30, because ELA has nothing
to compare against and must say so rather than invent a score.

### Why the gradient normalisation exists

Both lanes divide their block statistic by per-block gradient energy (Sobel
magnitude, `+1.0` to avoid dividing by zero) before the z-score. This is the
load-bearing step, not a tidying detail:

- ELA rises with local detail, so **without normalisation Lane C flags every
  textured edge** in every genuine photo.
- Residual energy falls with local detail, so **without normalisation Lane B
  flags every smooth region** — every sky, wall, and studio backdrop.

Normalising replaces "is this region bright in ELA / quiet in residual?" — which
mostly measures texture — with the question that is actually diagnostic: *is this
region anomalous **given its own structure**?*

---

## Limitations — read this before trusting an output

Straight from `known_limitations` in `/v1/model-card`:

- **Confidence values are raw lane agreement, NOT calibrated probabilities.**
  `confidence: 0.72` does *not* mean "72 % likely fake". It means the usable
  lanes were individually confident and agreed with each other. There is no
  calibration set behind it. `confidence_is_calibrated` ships as `false` and is
  returned on every response so this cannot be misread.
- Lanes B and C are intra-image consistency checks. **A fully synthetic image
  with globally uniform statistics can pass both** — there is no inconsistency to
  find when the whole frame was generated together.
- No camera attribution and no PRNU reference database.
- Absence of capture attestation is never treated as evidence of fakery.
- The `attested` flag is client-asserted and NOT verified server-side, so it
  grants no confidence bonus and is not yet an injection defence.
- Heavily compressed or low-resolution images return `INSUFFICIENT_EVIDENCE` by
  design rather than a guess.
- Lane A (trained local-synthesis detector) is wired in but needs both
  `requirements-ml.txt` and a checkpoint at `weights/lane_a.pt`. Without
  either it abstains with a reason and lanes B/C carry the verdict.
- Lane E (face match) is wired in but its dependencies are optional. Without
  them installed, identity reports `INDETERMINATE` and the case goes to review.

And what it explicitly does **not** claim (`does_not_claim`):

- **Novel research.** ELA, noise residuals, and robust outlier statistics are
  established image forensics.
- **Detection of manipulations that leave no local statistical trace.**

No accuracy, precision, recall, or benchmark number is stated anywhere in this
service, because none has been measured. Every threshold in `config.py` is an
uncalibrated default. Treat the output as triage evidence for a human reviewer,
not as a verdict.

---

## Tests

```bash
cd service
source .venv/bin/activate
python test_service.py
```

Plain asserts, no framework, no fixtures — synthetic images generated from a
seeded RNG so the assertions are deterministic. Covers JPEG quality inversion,
the quality gate, all abstention paths, Lane B catching a spliced smooth patch,
attestation never lowering confidence, and the identity axis staying independent
of authenticity.

---

## Deploy (HuggingFace Spaces, free CPU)

`Dockerfile` targets the free CPU tier and listens on port **7860**, which Spaces
requires. Copy `.env.example` to `.env` if you want the optional integrations;
the service runs fine with none of them set.

## Files

| File | What it holds |
|---|---|
| `main.py` | FastAPI app, request/response models, the five endpoints |
| `lanes.py` | Quality gate, Lane B, Lane C, shared block/z-score/cluster helpers |
| `judge.py` | Rule-based judge: three axes, four abstention gates |
| `config.py` | Every threshold that drives a verdict, in one place |
| `test_service.py` | Runnable checks |

Thresholds live only in `config.py` — lanes and judge must not hardcode them, so
calibration has exactly one file to touch.

> `requirements-ml.txt` holds the optional extras for Lane E (face match).
> `main.py` imports Lane E; with the extras installed, `/v1/analyze` resolves a
> real `identity` axis and `ACCEPT` becomes reachable. Without them,
> `face_similarity()` returns `None` with a reason and the case routes to
> review — it never raises. The base service
> is deliberately deployable without them, and the `Dockerfile` installs only
> `requirements.txt`.

---

## Training Lane A

Lane A is the only trained lane. It reads locally synthesised content at patch
level, and it is trained on INP-X *exchanged* images specifically so it cannot
lean on the global VAE artifact that arXiv 2602.00192 showed published
detectors depend on.

### On Kaggle (free T4, no download)

The 9.9 GB dataset is already mounted there, so this is far faster than
pulling it locally. Push the trainer as a script kernel:

```bash
kaggle kernels push -p kaggle_train
```

`kaggle_train/kernel-metadata.json` needs `enable_gpu: true`,
`enable_internet: true` (timm downloads pretrained weights), and
`dataset_sources: ["emirhanbilgic/inpainting-exchange"]`.

Two things that will waste your time if you do not know them:

1. **The kernel `id` must use your real Kaggle username**, not your display
   name or GitHub handle. A mismatch fails every update with a bare
   `409 Conflict` that never explains itself. Check with `kaggle config view`.
2. **Kaggle runs the file as a bare script with no CLI arguments.** Set
   `sys.argv` inside the `if __name__ == "__main__":` block at the *end* of the
   file. Prepending it at the top is a `SyntaxError`, because
   `from __future__ import annotations` must be the first statement.

Then collect the checkpoint:

```bash
kaggle kernels output <user>/verilens-lane-a-train -p /tmp/out && cp /tmp/out/lane_a.pt weights/lane_a.pt
```

### Locally

```bash
python train_lane_a.py --data /path/to/inpainting-exchange --out weights/lane_a.pt --face-only --limit 50
```

Use `--limit` first: it validates the dataset layout cheaply before a full run.
`--face-only` restricts training to CelebAHQ, the KYC domain — 2010 train and
893 held-out mask-paired edits. Without it, `--face-weight` oversamples faces
while still training across all four datasets.

### Reading the output

Validation accuracy is reported per source. The **exchanged** column is the
honest headline: it is the setting where published detectors fall to chance,
and it is the number `lane_a.py` reads back as the lane's confidence, so an
undocumented checkpoint cannot quietly dominate the judge.
