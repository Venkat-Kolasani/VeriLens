# VeriLens — Project Story & Evaluation Preparation Guide

**Track:** Deepfake / AI-Generated Image Detector for KYC · Cybersecurity
**One line:** VeriLens takes an ID document photo and a live selfie, runs
five independent forensic checks over both, and returns three separate,
explainable verdicts instead of one opaque score — refusing to guess when
the evidence doesn't support an answer, and anchoring the decision itself
on-chain so it can't be quietly altered afterwards.

This document is written to be read straight through before a demo or viva.
It tells the story of how we got from the problem statement to this
architecture, then gives a preparation guide mapped to how the round is
scored.

---

## Part 1 — The Story: How We Got Here

### Starting point: what the problem statement actually asks

The brief was simple to state and hard to solve honestly: *build something
that looks at an image and says whether it's AI-generated or manipulated,
explains why, and is honest about uncertainty rather than pretending to be
perfect.* The obvious first instinct — upload an image, call a pretrained
model, print a percentage — takes about an hour to build and tells you
almost nothing useful. We spent our first real effort not writing code, but
asking what a KYC team actually needs from a detector, because "for KYC"
was the part of the brief every generic detector skips.

That question reframes the whole project. KYC isn't "is this photo fake" in
the abstract — it's "is this specific applicant who they claim to be, and
can we prove later that we checked properly." That single reframing decided
almost every architectural choice that followed:

- A KYC check is never one image. It's always **two**: an ID document and a
  selfie, matched against each other. A detector that only takes one image
  can't actually be "for KYC" — it's a generic tool with a KYC label on it.
- The output can't be a single number. "The selfie is a real photo of the
  wrong person" and "the selfie is an AI-generated photo of the right
  person" are two completely different failures that need different
  handling — one is identity fraud, the other is presentation fraud. A
  blended score erases that distinction exactly when it matters most.
- A KYC decision has consequences a demo doesn't: a wrongly rejected real
  applicant is locked out of a bank account. That means an honest "I'm not
  sure, ask a human" has to be a first-class output, not an edge case we
  ignore.

### Finding the actual technical gap

Before building anything, we went looking for what published detectors
actually get wrong, rather than assuming we already knew. That search
surfaced a January 2026 paper (arXiv 2602.00192, *"AI-Generated Image
Detectors Overrely on Global Artifacts"*) with a finding that reframed our
whole technical approach: detectors — commercial ones included — don't
learn to recognise synthetic *content*. They learn a subtle, global
spectral shift that inpainting leaves across the **entire** image, not just
the edited region. The paper's "Inpainting Exchange" (INP-X) operation
restores the original pixels everywhere *except* the edited region,
isolating that shortcut. Under it, published detectors — Sightengine and
Hive Moderation included — collapse from roughly 91% accuracy to roughly
55%: a coin flip.

That was the moment the project stopped being "another deepfake detector"
and became something with a specific thesis: **the industry-standard
approach is measurably blind to local, targeted edits — precisely the kind
of edit a fraudster makes to a face on an ID photo or a selfie.** A month
later (August 2026), the best published fix for this (a system called
FUSED) closed most of that gap — but explicitly **excludes face
manipulation** from its scope. Faces are exactly what KYC checks. We
treated that exclusion as the opening: not a claim that nobody has ever
studied this, but a documented, current gap between what the best published
work covers and what our specific use case needs.

We were careful here not to overclaim. The forensic techniques we use — ELA,
noise-residual analysis, patch-level classifiers — are established, decades
old in some cases. Our contribution isn't a new algorithm; it's building a
system specifically shaped for KYC's two-image, identity-matching,
consequence-aware use case, on top of an honest read of where the published
approaches actually fail.

### Designing the architecture: lanes, not a monolith

Once we knew what we were guarding against, the shape of the system followed
naturally. A single model making a single call is a black box by
construction — you can't ask it *why*, and you can't make it say *I don't
know* without retraining it to do so. So we split detection into
independent **lanes**, each answering one narrow forensic question with its
own evidence, and put a separate, rule-based **judge** on top that combines
them and is allowed to disagree with itself:

- **Lane A — Local Synthesis.** A patch-level classifier, trained
  specifically on INP-X's *exchanged* images so it cannot fall back on the
  global-artifact shortcut the research identified. This is the lane
  directly answering the gap we found.
- **Lane B — Noise Residual.** Flags regions that are unnaturally clean for
  their level of visual detail — generated content tends to lack the
  per-pixel sensor noise a real camera leaves behind.
- **Lane C — Compression / ELA.** Flags regions whose recompression error
  doesn't match their surrounding detail — the signature of a pasted or
  re-edited region.
- **Lane D — Capture Attestation.** Distinguishes a live in-app photo from
  an uploaded file. Deliberately built to only ever *raise* confidence,
  never lower it — the absence of attestation is not evidence of anything;
  almost every genuine photo in the world was never "attested" by our app.
- **Lane E — Face Match.** Compares the ID photo and the selfie by face
  embedding. This is the lane that actually makes the system "for KYC"
  rather than a generic image checker — it answers the identity question a
  KYC flow exists to answer.

Each lane reports its own confidence and can **abstain** on its own if the
input doesn't give it enough to work with — a blurry patch, no detectable
face, no prior compression history to analyse. The judge only calls a
verdict when enough lanes agree; if they conflict, or too few lanes could
read the image at all, it routes to human review instead of averaging the
disagreement away, which would just manufacture false confidence.

### The output: three axes, not one score

This followed directly from the identity/authenticity distinction above.
Every check produces three independent answers:

- **Authenticity** — REAL / LIKELY_FAKE / INSUFFICIENT_EVIDENCE
- **Identity** — MATCH / MISMATCH / INDETERMINATE
- **Decision** — ACCEPT / REJECT / REVIEW (folds both axes together)

`INSUFFICIENT_EVIDENCE` and `REVIEW` are not fallback error states — they
are correct outputs the system is designed to produce whenever the
evidence genuinely doesn't support a confident answer. That was a
deliberate stance from early on: a system that never says "I don't know"
isn't more capable, it's just less honest about its own limits, and in a
KYC context that dishonesty has a real victim.

### The audit-trail layer: signing and anchoring the decision

Partway through, we asked a question most detectors never address: *what
stops someone from editing the verdict after the fact?* Proving an image
wasn't tampered with says nothing about whether the *decision* about that
image was altered later — which is what a bank or regulator actually needs
to trust months afterward. So every check is hashed and signed with a
per-device Ed25519 key at the moment it's made, and a digest of the full
verdict record — both image hashes, all three axes, the confidence, the
lane-level evidence, and a timestamp — is anchored on the Ethereum Sepolia
testnet. The decision itself becomes tamper-evident, not just the photo.

### Building in honesty about our own limits

As the system came together, we made a deliberate choice to surface exactly
what it doesn't do, rather than let a demo imply more than the system
actually delivers:

- Confidence values are raw lane agreement, not a calibrated probability,
  and every response says so explicitly until we've validated that against
  a held-out dataset.
- The "live capture" attestation flag is currently asserted by the client
  and not yet cryptographically verified end-to-end — so it deliberately
  earns **no** confidence bonus yet, even though the mechanism for it
  exists. We would rather under-claim than let a demo imply a defense we
  haven't fully closed.
- Two lanes (A and E) depend on optional trained weights. Built so that,
  absent those weights, they abstain cleanly and the system still produces
  a full verdict from the remaining lanes — it never silently fails or
  falls back to a guess.

We treat this list as a strength worth presenting, not a weakness to hide.
A system that states its own boundaries clearly is more trustworthy than
one that claims to have none.

---

## Part 2 — Evaluation Preparation Guide

Mapped directly to a typical judging rubric (Problem Understanding /15,
Innovation /15, Technical Execution /20, Functionality & Completeness /25,
Real-World Impact /15, Presentation & Demo /10).

### 1. Problem Understanding (15)

**What to say:** KYC selfie-and-ID flows assume a photo is hard to fake.
That assumption is now false — deepfakes account for roughly 11% of global
fraud in 2026 (up from 7% in 2024), and injection-attack volume specifically
(feeding a synthetic image at the point a system trusts the camera) is up
over 2,600% year-on-year. A generic "is this image fake" tool doesn't solve
KYC because KYC is fundamentally a *paired, identity* problem, not a
single-image problem.

**Be ready for:** *"Isn't this just a deepfake detector with extra steps?"*
— Answer: no — a KYC check that doesn't verify identity against a document
isn't a KYC check, it's a filter. The two-image, identity-matching design
is the difference, and it's why a plain single-image tool can wear the "for
KYC" label without actually doing KYC.

### 2. Innovation (15)

**What to say:** The innovation isn't a new algorithm — it's targeting a
specific, documented, current gap: published detectors (commercial and
open-source) collapse toward chance accuracy on locally-edited images
because they lean on a global artifact rather than reading local content;
the best published fix for that explicitly excludes faces, which is exactly
KYC's domain. On top of that gap, the three-axis verdict and mandatory
abstention design are deliberately unusual — most systems are built to
always answer, and we built ours to sometimes correctly refuse to.

**Be ready for:** *"What's actually novel here versus the paper you cite?"*
— Answer honestly: the forensic techniques are established; we don't claim
otherwise. The novelty is the system-level design for KYC specifically —
paired identity verification, three independent axes instead of one score,
mandatory honest abstention, and a signed/anchored decision record — built
around a clearly identified and current blind spot in the existing
detector landscape.

### 3. Technical Execution (20)

**What to say:** Five independent lanes (patch-level trained synthesis
detector, noise-residual analysis, compression/ELA analysis, capture
attestation, face-match), each reporting its own confidence and able to
abstain independently, combined by a rule-based judge that requires lane
agreement before committing to a verdict and routes to review on
disagreement. The service is a Python FastAPI backend, CPU-only for the two
core lanes so it runs anywhere with zero setup; the app is Expo/React
Native, and every verdict is Ed25519-signed and anchored on Ethereum
Sepolia.

**Be ready for:** *"Walk me through what happens when I upload an image."*
— Have the actual flow memorised: quality gate first (rejects unreadable
input outright) → lanes run in parallel → judge cross-checks usable lanes →
three-axis verdict with per-lane reasons → signed and anchored.
*"What if a lane fails or isn't installed?"* — It reports its own low
confidence and abstains; the judge proceeds on the remaining lanes as long
as enough of them are usable, and refuses to answer if not.

### 4. Functionality & Completeness (25)

**What to say:** The core pipeline is fully working end-to-end today with
zero optional setup — capture ID and selfie, hash, sign, analyze, get a
verdict with evidence, anchor on-chain, sync to a review queue. Two of the
five lanes are additive (trained weights improve them but the system never
depends on them being present) — this was a deliberate design choice so the
system degrades gracefully rather than failing outright if a component
isn't available.

**Be ready for:** *"Show me it actually working, not slides."* — Have the
service running locally and the app connected **before** you're called up;
do one real capture live, and have a second device or a saved example ready
as a fallback in case live capture has a bad camera moment on stage.
*"What's not finished?"* — Answer plainly: the two optional trained lanes
depend on a training run; the core system doesn't need them to produce a
correct, evidence-backed verdict, and that separation was intentional, not
an accident of running out of time.

### 5. Real-World Impact (15)

**What to say:** This targets a live, growing, well-documented attack
surface — regulated onboarding for banks, wallets, lending apps, and
telecom SIM issuance, all of which run exactly this ID+selfie flow today
and are exactly what the injection-attack growth numbers describe being hit.
A wrongly *accepted* fake applicant is fraud; a wrongly *rejected* real
applicant is a locked-out customer and a compliance liability — the honest
abstention design is aimed squarely at reducing the second failure, which
most detector demos ignore entirely.

**Be ready for:** *"Who would actually deploy this, and how?"* — As a
pre-screening layer in an existing KYC pipeline: automatic accept/reject on
high-confidence cases, automatic routing to a human reviewer on everything
else, with the case record itself standing as an auditable artifact for a
regulator later.

### 6. Presentation & Demo (10)

**What to say/do:** Lead with the split-screen framing — the same image,
side by side, through a generic single-score detector and through this
system's per-lane breakdown — because that contrast **is** the pitch in one
visual, no explanation needed first. Close on the abstention example: a
deliberately degraded image that correctly returns "insufficient evidence"
instead of a confident wrong guess. That's the single moment most likely to
land with judges, because it's the one thing they won't have seen another
team's tool do.

**Before you present, physically check:**
- [ ] Service running and reachable from the demo device (not localhost, if
      on a physical phone) — confirmed with a real request, not assumed
- [ ] At least one clean end-to-end capture done today, on the actual demo
      hardware, not last week on a laptop
- [ ] A saved fallback case (screenshot or pre-recorded) in case live
      capture has a bad moment on stage
- [ ] The three-axis verdict screen and the per-lane evidence view both
      pulled up and ready to point at, not buried in navigation
- [ ] One answer rehearsed out loud for "is this novel research?" — say
      no, plainly, and pivot straight to what the system-level design adds
