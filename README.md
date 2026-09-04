<p align="center">
  <img src="assets/images/icon.png" width="120" alt="VeriLens Logo" />
</p>

<h1 align="center">VeriLens</h1>

<p align="center">
  <strong>Deepfake / AI-Generated Image Detector for KYC</strong>
</p>

<p align="center">
  A mobile app for identity verification: it takes an <b>ID document photo</b> and a <b>selfie</b>, detects whether either is <b>AI-generated or manipulated</b>, face-matches the two, and anchors the result on <b>Ethereum Sepolia</b>. It reports three explicit verdicts with per-lane reasoning instead of one opaque number — and abstains when the image is too degraded to read honestly.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-54-000020?logo=expo&logoColor=white" />
  <img src="https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-forensics-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity&logoColor=white" />
  <img src="https://img.shields.io/badge/Ethereum-Sepolia-627EEA?logo=ethereum&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## Table of Contents

- [The Problem](#-the-problem)
- [How VeriLens Solves It](#-how-verilens-solves-it)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Screenshots & Demo](#-screenshots--demo)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Verification Pipeline](#-verification-pipeline)
- [Verdicts & Abstention](#-verdicts--abstention)
- [Smart Contract (Optional)](#-smart-contract-optional)
- [External Services Setup](#-external-services-setup)
- [API Reference](#-api-reference)
- [Security Architecture](#-security-architecture)
- [Real-World Use Cases](#-real-world-use-cases)
- [Cost](#-cost)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🔴 The Problem

Anyone with a laptop can generate a hyper-realistic face that never existed, or paste a new portrait onto a real ID card. Remote KYC — the "upload your ID and a selfie" flow behind every bank account, exchange, and rental — was designed for a world where a photo was hard to fake. That world is gone.

The usual response is a detector that emits one confidence number. That fails twice: it gives no reason a compliance officer can act on, and it answers just as confidently on a 200-pixel blurred thumbnail as on a clean capture.

## 💡 How VeriLens Solves It

VeriLens takes the two images a KYC flow already collects — an **ID document photo** and a **selfie** — and answers three separate questions:

1. **Is either image synthetic or manipulated?** Independent forensic lanes look for AI generation, splicing, and retouching
2. **Is the person in the selfie the person on the ID?** Face embeddings from both images are compared
3. **What should a human do about it?** Accept, reject, or send it to manual review

Each lane **explains its own read** — which region it flagged, which statistic fired, how much its answer can be trusted — rather than folding everything into one opaque score.

And when the image cannot support a forensic read at all — too small, too blurred, too heavily recompressed — VeriLens says **INSUFFICIENT_EVIDENCE** and routes to a human instead of guessing. In KYC, a confidently wrong reject locks a real person out of their bank account.

Every verdict is hashed, signed with the device's Ed25519 key, and anchored on **Ethereum Sepolia**, so the result can be produced later as an immutable, timestamped record of what was decided and when.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🪪 **ID + Selfie KYC Flow** | Capture an ID document photo and a selfie; both are analysed together |
| 🤖 **AI-Generation Detection** | Noise-residual lane flags regions too clean for real sensor output — the signature of diffusion-generated content |
| 🩹 **Manipulation Detection** | ELA / compression lane flags regions whose recompression error is inconsistent with their own detail — splices and pasted portraits |
| 🧑‍🤝‍🧑 **Face Match** | Cosine similarity on face embeddings from the ID portrait and the selfie |
| 🚦 **Three-Axis Verdict** | `authenticity` + `identity` + `decision` — never a single blended number |
| 🛑 **Honest Abstention** | A quality gate rejects unreadable images up front; conflicting or low-confidence lanes return `INSUFFICIENT_EVIDENCE` → human review |
| 🗣️ **Per-Lane Explanations** | Every lane reports the statistic that fired, the region it flagged, and its own confidence |
| 📸 **Proof-of-Capture** | SHA-256 hash computed from raw file bytes at capture time |
| ✍️ **Digital Signatures** | Ed25519 elliptic-curve key pair signing per device |
| ⛓️ **Blockchain Anchoring** | Immutable record on Ethereum Sepolia (Chain ID 11155111) — no contract deployment required |
| ☁️ **Cloud Sync** | Proof records + thumbnails synced to Supabase (PostgreSQL + Object Storage) |
| 🔎 **3-Mode Verification** | Verify any prior result by blockchain TX hash, file hash, or image re-hash |
| 🌙 **Dark / Light Theme** | Automatic system theme detection with custom palettes |
| 📶 **Offline-First** | Local SQLite cache — capture and hashing work without internet; syncs when online |

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     React Native (Expo) App                       │
├──────────────┬───────────────┬──────────────┬────────────────────┤
│   Capture    │    Results    │   Profile    │   Verify Proof     │
│  ID + Selfie │  3-axis + why │  Wallet/Key  │  TX / hash / image │
├──────────────┴───────────────┴──────────────┴────────────────────┤
│                    Zustand State Management                       │
├──────────────────────────────────────────────────────────────────┤
│                     Verification Pipeline                         │
│  Quality Gate → Forensic Lanes → Face Match → Judge →            │
│  Hash → Sign → Anchor → Cloud Sync                               │
├──────────┬────────────────────────────────┬──────────┬───────────┤
│  Crypto  │      Forensics (HTTP)          │Blockchain│ Supabase  │
│ Ed25519  │                                │ethers.js │  Cloud    │
│ SHA-256  │                                │ Sepolia  │ Storage   │
├──────────┴────────────────────────────────┴──────────┴───────────┤
│                    SQLite (local records)                         │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│              Python FastAPI Forensics Service  (service/)         │
├──────────────────────────────────────────────────────────────────┤
│  Quality Gate — resolution / blur / JPEG-quality floor            │
│      ↓ (abstain if unreadable)                                    │
│  Lane A  trained detector          (optional, requirements-ml)    │
│  Lane B  noise residual            → too clean = synthetic        │
│  Lane C  compression / ELA         → inconsistent = spliced       │
│  Lane E  face embedding match      (optional, requirements-ml)    │
│      ↓                                                            │
│  Judge — cross-checks usable lanes, abstains on disagreement      │
│      ↓                                                            │
│  authenticity | identity | decision  + per-lane reasons           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┬───────────────────────────────────┐
│  Ethereum Sepolia (EVM)      │  Supabase (PostgreSQL + Storage)  │
│  Data-only self-transfer     │  Blockscout v2 Explorer API       │
│  (contract optional)         │                                   │
│  Chain ID: 11155111          │                                   │
└──────────────────────────────┴───────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Mobile Framework** | Expo SDK 54 + React Native 0.81 |
| **Language** | TypeScript 5.9 |
| **Navigation** | Expo Router v6 (file-based routing) |
| **State Management** | Zustand v5 |
| **Cryptography** | SHA-256 (`expo-crypto`) + Ed25519 (`@noble/ed25519`) |
| **Blockchain** | `ethers.js` v6 → Ethereum Sepolia (Chain ID 11155111) |
| **Smart Contract** | Solidity 0.8.20 (`MediaProof.sol`) — optional, not deployed by default |
| **Cloud Database** | Supabase (PostgreSQL + Object Storage) |
| **Local Database** | `expo-sqlite` v16 |
| **Forensics Service** | Python + FastAPI (`service/`) — OpenCV, NumPy, SciPy, Pillow |
| **Forensic Lanes** | Noise-residual + ELA/compression (training-free); trained detector and face match optional |
| **Animations** | React Native Reanimated v4 |
| **Styling** | NativeWind / Tailwind CSS v3 |
| **Camera** | `expo-camera` v17 |
| **Key Storage** | `expo-secure-store` (hardware-backed keychain) |

---

## 📸 Screenshots & Demo

> _Take screenshots of the app and place them in the `assets/images/screenshots/` directory._

<!-- Add screenshots here:
| Home | Capture | Verification | Gallery | Scanner | Profile |
|------|---------|-------------|---------|---------|---------|
| ![](assets/images/screenshots/home.png) | ![](assets/images/screenshots/capture.png) | ... | ... | ... | ... |
-->

For a full walkthrough, see the [Demo Script](DEMO_SCRIPT.md).

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18
- **Expo CLI** — `npm install -g expo-cli`
- **Android device** or emulator (with [Expo Go](https://expo.dev/go))

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/VeriLens.git
cd VeriLens

# Install dependencies
npm install

# Start the Expo dev server
npx expo start
```

### Running on Device

1. Install **Expo Go** from the Play Store / App Store
2. Scan the QR code from the terminal
3. The app loads on your device

### Running on Emulator

```bash
# Android
npx expo start --android

# iOS
npx expo start --ios
```

### Forensics Service (Required for detection)

Detection runs in the Python service under `service/`. Without it the app can still capture, hash, sign, and anchor — but it cannot produce an authenticity or identity verdict.

```bash
cd service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Service runs at http://localhost:8000
```

Point the app at it with `EXPO_PUBLIC_API_BASE_URL` (defaults to `http://localhost:8000`).

> The old Node backend in `server/` is deprecated and being removed — see [server/README.md](server/README.md).

> See the [Full Setup Guide](SETUP.md) for detailed instructions on configuring Sepolia, Supabase, and the forensics service.

---

## 📁 Project Structure

```
VeriLens/
├── app/                        # Expo Router screens
│   ├── _layout.tsx             # Root layout with onboarding guard
│   ├── onboarding.tsx          # 3-page swipeable onboarding
│   ├── verify-proof.tsx        # Multi-mode proof verification (TX / hash / image)
│   ├── (tabs)/                 # Main tab navigation
│   │   ├── _layout.tsx         # Tab bar configuration
│   │   ├── index.tsx           # Home dashboard (stats + recent activity)
│   │   ├── capture.tsx         # Camera capture + live verification modal
│   │   ├── gallery.tsx         # Media gallery grid with filters
│   │   ├── scanner.tsx         # Gallery integrity scanner
│   │   └── profile.tsx         # Profile, wallet, device key, settings
│   └── verify/
│       └── [id].tsx            # Verification detail view
│
├── lib/                        # Core business logic
│   ├── pipeline.ts             # Verification orchestrator
│   ├── crypto.ts               # Ed25519 key management + SHA-256 hashing
│   ├── blockchain.ts           # Sepolia integration (ethers.js + Blockscout v2)
│   ├── ai-detection.ts         # Forensics service client
│   ├── supabase.ts             # Supabase cloud integration
│   ├── db.ts                   # Local SQLite database layer
│   └── types.ts                # TypeScript interfaces
│
├── service/                    # Python FastAPI forensics service
│   ├── config.py               # Every threshold that drives a verdict
│   ├── lanes.py                # Quality gate + training-free lanes (B, C)
│   └── requirements.txt        # Base deps (CPU-only, no torch)
│
├── components/                 # Reusable UI components
│   ├── VerificationSteps.tsx   # Pipeline step timeline
│   └── MediaCard.tsx           # Result grid/list card
│
├── stores/
│   └── media-store.ts          # Zustand global state
│
├── constants/
│   ├── config.ts               # API URL, chain config (from EXPO_PUBLIC_* env)
│   ├── Colors.ts               # Theme palettes
│   ├── abi.ts                  # Proof payload ABI
│   └── theme.ts                # Theme constants
│
├── contracts/
│   └── MediaProof.sol          # Optional Solidity contract (0.8.20)
│
├── server/                     # DEPRECATED Express.js backend (being removed)
│
├── hooks/                      # Custom React hooks
│   └── useThemeColors.ts       # Dark/light theme hook
│
├── supabase-setup.sql          # Database schema & RLS policies
├── app.json                    # Expo configuration
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## 🔄 Verification Pipeline

When you capture or import a photo, VeriLens runs a **7-step verification pipeline** (orchestrated by `lib/pipeline.ts`):

```
Step 1: Hash       → SHA-256 digest of raw file bytes
Step 2: Sign       → Ed25519 signature using device private key
Step 3: Blockchain → Anchor proof on Sepolia (smart contract or data tx)
Step 4: AI Detect  → Deepfake + AI-generation analysis via SightEngine
Step 5: Trust      → Compute weighted 0–100 trust score
Step 6: Watermark  → Apply visible overlay + generate invisible ID
Step 7: Cloud Sync → Upload proof record + thumbnail to Supabase
```

Each step reports its status in real-time to the UI via progress callbacks. Steps are fault-tolerant — blockchain or cloud failures are recorded as errors but don't block the rest of the pipeline.

---

## 📊 Trust Score Algorithm

The trust score starts at **100** and applies weighted deductions:

| Factor | Condition | Penalty |
|--------|-----------|---------|
| **Hash integrity** | Hash not verified | **-50** |
| **Signature** | Signature invalid | **-30** |
| **Blockchain** | Not anchored on-chain | **-10** |
| **Deepfake score** | > 0.7 / > 0.4 / > 0.2 | **-40 / -20 / -5** |
| **AI-generated score** | > 0.7 / > 0.4 / > 0.2 | **-30 / -15 / -3** |
| **Plagiarism** | > 50% / > 30% | **-20 / -10** |
| **Metadata** | Has metadata | **+2 bonus** |

### Grade Scale

| Grade | Score Range | Meaning |
|-------|-------------|---------|
| **S** | 95 – 100 | Pristine — cryptographically perfect |
| **A** | 80 – 94 | Verified authentic |
| **B** | 60 – 79 | Minor concerns |
| **C** | 40 – 59 | Significant issues |
| **F** | 0 – 39 | Failed verification |

---

## ⛓ Smart Contract

**`contracts/MediaProof.sol`** — A Solidity 0.8.20 contract deployed on **Sepolia Testnet** (Chain ID `11155111`).

### Contract Interface

```solidity
// Store an immutable proof
function anchorProof(bytes32 _fileHash, string _signature, string _publicKey) external

// Retrieve a proof by file hash
function getProof(bytes32 _fileHash) external view returns (Proof memory)

// Check if a proof exists
function proofExists(bytes32 _fileHash) external view returns (bool)

// Get total number of proofs
function getProofCount() external view returns (uint256)
```

### Proof Struct

```solidity
struct Proof {
    bytes32 fileHash;
    string  signature;
    string  publicKey;
    address submitter;
    uint256 timestamp;
    uint256 blockNumber;
}
```

### Deployment Info

| Field | Value |
|-------|-------|
| **Network** | Sepolia Testnet |
| **RPC URL** | `https://ethereum-sepolia-rpc.publicnode.com` |
| **Chain ID** | `11155111` |
| **Currency** | `SepoliaETH` |
| **Explorer** | `https://eth-sepolia.blockscout.com` |
| **Faucet** | `https://cloud.google.com/application/web3/faucet/ethereum/sepolia` |
| **Compiler** | Solidity 0.8.20 |

> See [SETUP.md](SETUP.md) for step-by-step deployment instructions via Remix IDE + MetaMask.

---

## 🔧 External Services Setup

Detection runs locally in the FastAPI service under `service/` — no API key, no
third-party call, no simulated results. Everything below is optional and free.

| Service | Purpose | Required? | Cost |
|---------|---------|-----------|------|
| **Forensics service** (`service/`) | Detection + verdict | **Yes** — it is the detector | Free (self-hosted, CPU) |
| **Sepolia Testnet** | Tamper-proof audit anchor | No (detection works without it) | Free (testnet) |
| **Supabase** | Cloud case records + review queue | No (local SQLite used) | Free tier |
| **HuggingFace Spaces** | Hosting for `service/` | No (runs locally) | Free tier (CPU) |
| **SightEngine** | Baseline for side-by-side comparison only | No | Free trial |

Configuration goes in `.env` as `EXPO_PUBLIC_*` variables (mobile, read by `constants/config.ts`) and `service/.env` (forensics service). No keys are committed.

> Full setup guide with screenshots: [SETUP.md](SETUP.md)

---

## 📡 API Reference

The Express.js backend (deployed on Vercel) exposes these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/detect` | AI deepfake detection (SightEngine proxy / simulation) |
| `POST` | `/api/plagiarism` | Plagiarism check |
| `POST` | `/api/verify` | Verify proof against Supabase |
| `GET` | `/api/verify/:hash` | Lookup proof by file hash |
| `GET` | `/api/proofs` | Recent proofs feed |
| `POST` | `/api/upload-image` | Upload image to Supabase Storage |
| `GET` | `/admin` | Admin monitoring dashboard |

The backend includes a built-in **admin dashboard** with login, real-time stats, filterable request logs, and auto-refresh.

---

## 🔐 Security Architecture

### Cryptographic Chain of Trust

```
Raw Photo Bytes → SHA-256 Hash → Ed25519 Signature → Blockchain Anchor
```

1. **SHA-256 Hash** — Computed from raw file bytes at capture time using `expo-crypto`
2. **Ed25519 Signature** — Device private key signs the hash; key stored in `expo-secure-store` (hardware-backed keychain)
3. **Blockchain Anchor** — Hash + signature stored immutably on Sepolia via smart contract
4. **Cloud Backup** — Proof record synced to Supabase PostgreSQL with Row Level Security

### Key Storage

| Key | Storage | Access |
|-----|---------|--------|
| Ed25519 Private Key | `expo-secure-store` (hardware keychain) | Device-only |
| Ed25519 Public Key | SQLite + on-chain | Public |
| Wallet Mnemonic | `expo-secure-store` | Device-only |

### Tamper Detection

Any modification to a file changes its SHA-256 hash → **broken chain of trust**. The original hash is immutably stored on the blockchain, so:

- **Screenshots** → Different hash
- **Cropping** → Different hash
- **Filters / edits** → Different hash
- **Re-compression** → Different hash
- **Metadata stripping** → Different hash

---

## 🌍 Real-World Use Cases

- **Journalists** in conflict zones — proving a photo is real, not staged
- **Legal professionals** — submitting digital evidence that courts can trust
- **Insurance companies** — verifying damage photos weren't sourced from the internet
- **Social media platforms** — providing a verified "proof of capture" badge
- **Whistleblowers** — creating an immutable record that can't be denied or erased
- **Content creators** — proving ownership and originality of their work

---

## 💰 Cost

**$0** — Everything uses free tiers:

| Service | Tier | Limit |
|---------|------|-------|
| Expo | Free | Unlimited |
| Sepolia Testnet | Free | SepoliaETH from faucet |
| Supabase | Free | 500 MB database, 1 GB storage |
| SightEngine | Free | 500 operations/month |
| Vercel / Render | Free | Serverless hosting |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT — Built for **HackSRM Hackathon**.

---

<p align="center">
  <i>"In the age of AI, truth needs a receipt."</i>
</p>
