# VeriLens — Handoff

**Deepfake / AI-Generated Image Detector for KYC.** Expo/React Native app + a
Python FastAPI forensics service. This document is the single place to read
before touching the repo, running the demo, or answering judge questions.

---

## 1. What this is, in one paragraph

VeriLens takes an **ID document photo** and a **live selfie**, runs five
forensic lanes over both, and returns **three independent verdicts** —
`authenticity` (REAL / LIKELY_FAKE / INSUFFICIENT_EVIDENCE), `identity`
(MATCH / MISMATCH / INDETERMINATE), `decision` (ACCEPT / REJECT / REVIEW) —
each with the specific evidence that produced it. When the image can't
support a verdict, it says so and routes to human review instead of
guessing. The verdict itself is signed and anchored on Ethereum Sepolia, so
the decision — not just the photo — is auditable later.

## 2. Why this exists (the pitch, condensed)

- KYC selfie-upload flows assume a photo is hard to fake. It isn't anymore:
  deepfakes are ~11% of global fraud in 2026, and injection-attack volume is
  up **2,665% YoY** (iProov).
- Published detectors (commercial and open-source) learn a **global** VAE
  artifact that inpainting leaves across the whole frame — not the
  synthesised content itself. Restore the pixels outside the edit
  ("Inpainting Exchange" / INP-X, arXiv 2602.00192) and accuracy collapses
  from ~91% to ~55% — chance level. The best published fix (FUSED, Aug 2026)
  **explicitly excludes faces** — exactly the domain KYC lives in.
- We do **not** claim novel research. ELA, noise-residual analysis, and
  patch-level classifiers are established forensics. The contribution is:
  a KYC-shaped system (paired ID+selfie, identity match), an honest
  abstention design, and a tamper-proof record of the decision itself.

See `docs/PPT` (below) or `DEMO_SCRIPT.md` for the full talk track.

## 3. Repository map

```
app/(tabs)/capture.tsx      Two-stage capture: ID (camera or gallery) → selfie (camera ONLY)
app/(tabs)/review.tsx       Review queue — cases routed to REVIEW, approve/reject
app/verify/[id].tsx         Case detail: per-lane evidence, signature, on-chain anchor
lib/forensics.ts            Typed client for the FastAPI service
lib/pipeline.ts             Orchestrates: hash → sign → analyze → anchor → cloud sync
lib/blockchain.ts           Sepolia anchoring (data-only self-transfer, no contract deploy)
lib/db.ts / lib/supabase.ts Local SQLite + optional Supabase cloud sync

service/main.py             FastAPI app — /v1/analyze, /v1/analyze/single, /v1/baseline,
                             /v1/health, /v1/model-card
service/lanes.py            Quality gate, Lane B (noise residual), Lane C (compression/ELA)
service/lane_a.py           Lane A — trained patch-level local-synthesis detector (optional)
service/lane_face.py        Lane E — ArcFace face match (optional)
service/judge.py            Rule-based judge: combines lanes into the three-axis verdict
service/config.py           Every threshold in one place — nothing hardcoded inline
service/train_lane_a.py     Lane A trainer (INP-X, Kaggle or Colab or local)
service/verilens_lane_a_training.ipynb   Notebook version of the trainer
service/test_service.py     11 assert-based checks — the safety net for the judge/lanes
scripts/verify_baseline.py  Re-measures the arXiv 91%→55% claim before it's quoted live

supabase-setup.sql          kyc_cases table, RLS policies, kyc-media bucket
pitch/                      Slide deck source (isolated npm project, see §7)
```

## 4. Running it

**Forensics service (required — it's the detector):**
```bash
cd service && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
No API key needed. Lanes B/C work with zero setup. Lane A/E activate
automatically if `requirements-ml.txt` is installed and `weights/lane_a.pt`
exists (see §6) — otherwise they abstain cleanly and B/C carry the verdict.

**App:**
```bash
cp .env.example .env   # fill in EXPO_PUBLIC_* values, see below
npx expo start
```
On a physical phone, set `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP
(`ipconfig getifaddr en0`), not `localhost`.

**`.env` values already provisioned this session** (see your password
manager / earlier messages — not reproduced here):
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — live project,
  schema applied, verified: table + CHECK constraints + RLS (SELECT/INSERT/
  UPDATE) + `kyc-media` bucket (upload + public read) all confirmed working
  by direct API probes, not assumed.
- Nothing is required for `service/.env` — SightEngine credentials there are
  optional and only feed the comparison baseline, never the verdict.

## 5. What's genuinely working vs. what's optional

| Piece | Status |
|---|---|
| Quality gate + Lane B + Lane C | ✅ working, zero setup, carry the verdict alone |
| Judge (3-axis verdict, 4 abstention paths) | ✅ working, 11/11 tests passing |
| Sepolia anchoring | ✅ working — zero-address self-transfer, no contract deploy needed |
| Supabase cloud (cases + review queue + images) | ✅ working, verified end-to-end |
| App capture flow, review queue, case detail | ✅ working, `tsc` clean (1 pre-existing baseline error, see §8) |
| Lane A (trained synthesis detector) | 🟡 optional — see §6 for current checkpoint status |
| Lane E (face match) | 🟡 optional — needs `requirements-ml.txt`; abstains cleanly without it |
| SightEngine baseline comparison | 🟡 optional — needs free-trial creds, only affects the demo narrative |

**The app and service are fully demoable right now with zero optional pieces
installed.** Lane A/E are additive, not load-bearing.

## 6. Lane A training — current state

A local training run (M4, MPS) is/was in progress against the real INP-X
dataset (`--face-only`, CelebAHQ, 2010 train / 893 held-out pairs). Check
`service/weights/lane_a.pt` for the latest checkpoint and read its recorded
metrics before trusting it:

```bash
cd service && .venv/bin/python -c "
import torch; ck = torch.load('weights/lane_a.pt', map_location='cpu')
print({k: v for k, v in ck.items() if k != 'state_dict'})"
```

`val_acc_exchanged` is the number that matters — it's the setting where
published detectors fall to chance, and `lane_a.py` reads it back as the
lane's confidence weight. **A checkpoint with a low `val_acc_exchanged` is
automatically down-weighted or excluded by the judge — it cannot be
accidentally trusted.**

If you need to (re)train: `service/verilens_lane_a_training.ipynb` runs on
Kaggle (dataset already mounted there — toggle **Internet: On**, which needs
a phone-verified Kaggle account) or Google Colab (always has internet, but
downloads the ~9.9 GB dataset per session). Both paths were fixed mid-build
after failing for three separate reasons — read the notebook's header cell,
it documents the gotchas so you don't hit them again.

## 7. The pitch deck

`pitch/VeriLens_Pitch.pptx` — 10 slides, structural + content QA passed,
visually rendered and reviewed. Speaker-ready; see `DEMO_SCRIPT.md` for the
talk track to go with it.

`pitch/` is a **separate, isolated npm project** (its own `package.json`,
`node_modules`) — do not `npm install` there without a scoped
`package.json` present; it previously leaked `pptxgenjs`/`sharp` into the
app's root `package.json` and was reverted. If you regenerate the deck,
`cd pitch && npm install && node build_deck.js`.

## 8. Known non-issues (don't "fix" these)

- `npx tsc --noEmit` reports exactly **one** error, in
  `app/(tabs)/_layout.tsx:43` — a React 19 `ref`-variance mismatch on the
  haptic-tab component, pre-existing since before this rebuild. Verified
  harmless; leave it.
- `confidence_is_calibrated` is `false` everywhere. This is intentional —
  confidence is raw lane agreement, not a calibrated probability, until a
  held-out calibration set exists. The UI is required to label it
  "(uncalibrated)" whenever this flag is false. Don't silently drop the
  label to make a number look more impressive.
- The `attested` flag (live capture vs. gallery import) is **client-asserted
  and not yet cryptographically verified** by the service
  (`config.trust_client_attestation = False`). It is deliberately excluded
  from the confidence calculation for this reason — a hostile client could
  otherwise just claim `attested=true`. This is documented in the model
  card (`GET /v1/model-card`) and the service README, not a bug to silently
  "fix" by trusting the flag.

## 9. If you only have 10 minutes before presenting

1. `git log --oneline` — 25+ commits, all real, all authored by
   `abhinavteja123`, no AI-authorship trailers.
2. Open `pitch/VeriLens_Pitch.pptx` and `DEMO_SCRIPT.md` together.
3. Run the service + app locally (§4) and do one real capture end-to-end —
   don't present from a cold start you haven't verified today.
4. If asked "is this novel research?" — no, and say so plainly (§2, and
   slide 9 of the deck). That's a strength, not an admission.
