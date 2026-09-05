# VeriLens — 3-Minute Video Demo Script

> **Total time:** ~3 minutes | **Tone:** Confident, slightly urgent, storytelling-driven  
> **Tip:** Record screen + face cam. Show the real app on a phone/emulator throughout.

---

## PART 1 — The Hook (0:00 – 0:25)

**[SCREEN: Show a headline about deepfakes / misinformation — or a dramatic AI-generated image]**

> *"Right now, anyone with a laptop can generate a hyper-realistic photo that never happened. Deepfakes are being used to spread misinformation, fabricate evidence, and destroy trust in digital media.*
>
> *So here's the question — when someone shows you a photo, how do you **prove** it's real?*
>
> ***That's exactly what VeriLens does."***

**[SCREEN: App splash / logo reveal — the # camera lens icon on dark background]**

---

## PART 2 — What Is VeriLens? (0:25 – 0:55)

**[SCREEN: Show the app home screen]**

> *"VeriLens is a mobile KYC check. It takes the two images every remote onboarding flow already collects — an **ID document photo** and a **live selfie** — and answers three separate questions in one pass:"*

**[SCREEN: Open the Capture screen, take the ID photo then the selfie, show the verification modal animating through steps]**

> 1. *"**Is either image AI-generated or manipulated?** Independent forensic lanes look for synthetic noise patterns and inconsistent recompression."*
> 2. *"**Is the person in the selfie the person on the ID?** Face embeddings from both images are compared."*
> 3. *"**What should a human do about it?** Accept, reject, or send it to manual review."*

> *"There's no single score. VeriLens reports three axes — **authenticity**, **identity**, **decision** — with the evidence behind each, and it **abstains** instead of guessing when an image is too degraded to read honestly. Every verdict is hashed, signed with the device's key, and anchored on Sepolia so it's an auditable record of what was decided and when."*

**[SCREEN: Show the verdict card — authenticity / identity / decision pills, with the reasons underneath]**

---

## PART 3 — Live Demo (0:55 – 1:50)

### Demo 1: Capture & Verify (0:55 – 1:20)

**[SCREEN: Open camera → capture the ID document → capture the live selfie]**

> *"Let me show you. First the ID document — I can import this one from the gallery, since people usually photograph their passport once. Then the selfie — camera only, no gallery import, because an importable selfie is exactly the injection attack this app exists to catch."*

**[SCREEN: Verification modal appears — steps animate one by one: Hash → Sign → Forensics → Anchor → Cloud Sync]**

> *"Watch — VeriLens hashes and signs the pair, runs it through the local forensics service, and anchors the verdict on Sepolia. That transaction is permanent — no one can delete it, not even me."*

**[SCREEN: Verification complete, three-axis result shows]**

> *"Authenticity: REAL. Identity: MATCH. Decision: ACCEPT — with the specific lane evidence that produced each call, not just a number."*

### Demo 2: Verify Someone Else's Proof (1:20 – 1:40)

**[SCREEN: Tap "Verify a Proof" from home screen → show the 3 verification modes]**

> *"But here's where it gets powerful. Say someone sends you a case and claims it's real. You can verify it three ways:"*
>
> - *"**Paste the blockchain transaction hash** — and VeriLens pulls the on-chain proof directly."*
> - *"**Enter the file hash** — and it cross-checks against our Supabase database."*
> - *"**Or just drop the image itself** — VeriLens re-hashes it and tells you if it matches any recorded case."*

**[SCREEN: Show a verification result — green checkmark, hash match confirmed, on-chain proof found]**

> *"If even a single pixel was changed — a screenshot, a crop, a filter — the hash won't match. Tampering is mathematically impossible to hide."*

### Demo 3: Manual Review Queue (1:40 – 1:50)

**[SCREEN: Open the Review tab]**

> *"Not every case is a clean accept or reject. When the forensics service can't reach a confident verdict — lanes disagree, the identity can't be verified, the image quality is too low — VeriLens routes it here instead of guessing, and a human makes the final call."*

---

## PART 4 — Tech Stack & Architecture (1:50 – 2:25)

**[SCREEN: Show a simple architecture diagram or bullet list on screen]**

> *"Under the hood:"*
>
> - *"**React Native + Expo** — cross-platform mobile app"*
> - *"**SHA-256 hashing** with `expo-crypto` — the same algorithm Bitcoin uses"*
> - *"**Ed25519 digital signatures** from `@noble/ed25519` — elliptic curve cryptography"*
> - *"**Sepolia Testnet** — a real EVM-compatible blockchain, with an optional custom Solidity contract, `MediaProof.sol`"*
> - *"**A Python FastAPI forensics service** — the actual detector: training-free noise-residual and compression/ELA lanes, plus an optional trained detector and face-match lane, all running locally with no third-party call"*
> - *"**Supabase** — PostgreSQL database + cloud storage for case records"*
> - *"**SQLite** — offline-first local cache so the app works without internet"*

> *"Every layer is designed so that no single point of failure can compromise the verdict."*

---

## PART 5 — Why It Matters / Real-World Use Cases (2:25 – 2:50)

**[SCREEN: Show the profile page with wallet address, device key, and stats]**

> *"Think about who needs this:"*
>
> - *"**Banks & fintechs** — remote account opening that catches an AI-generated face or a spliced ID photo before a human reviewer sees it"*
> - *"**Crypto exchanges** — KYC/AML onboarding with an auditable reason for every accept or reject"*
> - *"**Rental & gig platforms** — identity checks before handing over keys or a delivery route"*
> - *"**Compliance teams** — an immutable, timestamped record of what was decided and why"*

> *"In a world drowning in deepfakes, VeriLens doesn't just flag fakes — it gives KYC a reason it can act on."*

---

## PART 6 — The Close (2:50 – 3:00)

**[SCREEN: Back to the home screen, then logo]**

> *"VeriLens. One tap to capture. One hash to prove it. One blockchain to make it permanent.*
>
> ***Because in the age of AI, truth needs a receipt."***

**[SCREEN: Logo + team name + "Built at HackSRM"]**

---

## Production Notes

| Element | Detail |
|---|---|
| **Best opening visual** | Split-screen: deepfake vs real photo, with "Which one is real?" text |
| **Background music** | Subtle tech/cinematic — try [Epidemic Sound](https://www.epidemicsound.com/) "Technology" category |
| **Screen recording** | Use `scrcpy` or Expo Go on a physical device for best quality |
| **Pacing tip** | The verification modal animation is your **hero moment** — let it breathe for 3–4 seconds |
| **Closing slide** | Team name, GitHub repo link, "Built with React Native, Sepolia, Supabase" |
| **Captions** | Add subtitles — many hackathon judges watch on mute first |

---

### Key Phrases to Emphasize (for judge impact)

- *"It shows you which region it flagged, and why"*
- *"The same cryptography Bitcoin uses"*
- *"Real transaction on a public testnet — open it in the explorer"*
- *"A wrong reject locks a real person out of their bank"*
- *"It abstains instead of guessing when the image is too degraded to read"*
