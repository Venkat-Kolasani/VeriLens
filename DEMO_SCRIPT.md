# ProofSnap — 3-Minute Video Demo Script

> **Total time:** ~3 minutes | **Tone:** Confident, slightly urgent, storytelling-driven  
> **Tip:** Record screen + face cam. Show the real app on a phone/emulator throughout.

---

## PART 1 — The Hook (0:00 – 0:25)

**[SCREEN: Show a headline about deepfakes / misinformation — or a dramatic AI-generated image]**

> *"Right now, anyone with a laptop can generate a hyper-realistic photo that never happened. Deepfakes are being used to spread misinformation, fabricate evidence, and destroy trust in digital media.*
>
> *So here's the question — when someone shows you a photo, how do you **prove** it's real?*
>
> ***That's exactly what ProofSnap does."***

**[SCREEN: App splash / logo reveal — the # camera lens icon on dark background]**

---

## PART 2 — What Is ProofSnap? (0:25 – 0:55)

**[SCREEN: Show the app home screen with the "Proof of Capture" tagline]**

> *"ProofSnap is a mobile app that creates an **unforgeable proof of capture** for every photo you take. The moment you snap a picture, ProofSnap does four things in under 10 seconds:"*

**[SCREEN: Open the Capture screen, take a photo, show the verification modal animating through steps]**

> 1. *"**Generates a SHA-256 cryptographic hash** — a unique digital fingerprint of every pixel."*
> 2. *"**Signs it with your device's Ed25519 key** — proving it came from YOUR phone."*
> 3. *"**Anchors that proof on a real blockchain** — the DataHaven Testnet — making it permanent and tamper-proof."*
> 4. *"**Runs AI deepfake analysis** — using SightEngine to detect manipulation, face-swaps, and AI generation."*

> *"At the end, you get a **Trust Score out of 100** — a single number that tells you: is this media authentic?"*

**[SCREEN: Show the Trust Score circle animating to a high score like 95/A+]**

---

## PART 3 — Live Demo (0:55 – 1:50)

### Demo 1: Capture & Verify (0:55 – 1:20)

**[SCREEN: Open camera → tap the capture button]**

> *"Let me show you. I'll take a photo right now..."*

**[SCREEN: Verification modal appears — steps animate one by one: Hash → Sign → Blockchain → AI → Trust Score → Watermark → Cloud Sync]**

> *"Watch — ProofSnap is hashing the file... signing it with my device key... and right now it's writing a transaction to the DataHaven blockchain. That transaction is permanent — no one can delete it, not even me."*

**[SCREEN: Verification complete, trust score shows]**

> *"Trust Score: 97, Grade A+. This photo is provably real, captured on this device, at this exact moment."*

### Demo 2: Verify Someone Else's Proof (1:20 – 1:40)

**[SCREEN: Tap "Verify a Proof" from home screen → show the 3 verification modes]**

> *"But here's where it gets powerful. Say someone sends you a photo and claims it's real. You can verify it three ways:"*
>
> - *"**Paste the blockchain transaction hash** — and ProofSnap pulls the on-chain proof directly."*
> - *"**Enter the file hash** — and it cross-checks against our Supabase database."*
> - *"**Or just drop the image itself** — ProofSnap re-hashes it and tells you if it matches any recorded proof."*

**[SCREEN: Show a verification result — green checkmark, hash match confirmed, on-chain proof found]**

> *"If even a single pixel was changed — a screenshot, a crop, a filter — the hash won't match. Tampering is mathematically impossible to hide."*

### Demo 3: Gallery Integrity Scanner (1:40 – 1:50)

**[SCREEN: Open the Scanner tab → tap "Scan Gallery"]**

> *"ProofSnap also has a gallery scanner. It scans every image on your phone — WhatsApp, Snapchat, Camera, Downloads — hashes them all, and detects if any files have been tampered with since they were first seen."*

---

## PART 4 — Tech Stack & Architecture (1:50 – 2:25)

**[SCREEN: Show a simple architecture diagram or bullet list on screen]**

> *"Under the hood, this is a full-stack, production-grade system:"*
>
> - *"**React Native + Expo** — cross-platform mobile app"*
> - *"**SHA-256 hashing** with `expo-crypto` — the same algorithm Bitcoin uses"*
> - *"**Ed25519 digital signatures** from `@noble/ed25519` — military-grade elliptic curve cryptography"*
> - *"**DataHaven Testnet** — a real EVM-compatible blockchain where we deploy a custom Solidity smart contract called `MediaProof.sol`"*
> - *"**SightEngine API** — AI deepfake and AI-generated content detection"*
> - *"**Supabase** — PostgreSQL database + cloud storage for proof records"*
> - *"**SQLite** — offline-first local cache so the app works without internet"*
> - *"And an **Express.js backend** deployed on Vercel for the AI analysis endpoints"*

> *"Every layer is designed so that no single point of failure can compromise the proof."*

---

## PART 5 — Why It Matters / Real-World Use Cases (2:25 – 2:50)

**[SCREEN: Show the profile page with wallet address, device key, and stats]**

> *"Think about who needs this:"*
>
> - *"**Journalists** in conflict zones — proving a photo is real, not staged"*
> - *"**Legal professionals** — submitting digital evidence that courts can trust"*
> - *"**Insurance companies** — verifying damage photos weren't taken from Google"*
> - *"**Social media platforms** — giving users a verified 'proof of capture' badge"*
> - *"**Whistleblowers** — creating an immutable record that can't be denied or erased"*

> *"In a world drowning in deepfakes, ProofSnap doesn't just detect fakes — it **proves originals**."*

---

## PART 6 — The Close (2:50 – 3:00)

**[SCREEN: Back to the home screen, then logo]**

> *"ProofSnap. One tap to capture. One hash to prove it. One blockchain to make it permanent.*
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
| **Closing slide** | Team name, GitHub repo link, "Built with React Native, DataHaven, Supabase" |
| **Captions** | Add subtitles — many hackathon judges watch on mute first |

---

### Key Phrases to Emphasize (for judge impact)

- *"Mathematically impossible to hide tampering"*
- *"The same cryptography Bitcoin uses"*
- *"Real blockchain, not simulated"*
- *"Truth needs a receipt"*
- *"Proves originals, not just detects fakes"*
