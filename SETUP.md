# 🚀 VeriLens — Complete Setup Guide

## Step-by-Step: Get Everything Running

---

## 1️⃣ Sepolia Blockchain Setup (Optional)

Sepolia is Ethereum's public L1 testnet. Anchoring is **real** — every verdict
writes an actual transaction you can open in a block explorer.

Anchoring is optional: the app detects and judges images without it. Set it up
if you want the tamper-proof audit record.

### Step A: Select Sepolia in MetaMask

Sepolia ships with MetaMask — no custom network needed. Just enable it:

1. Open **MetaMask** → network dropdown → **Show test networks**
2. Select **Sepolia**

Reference values (only needed for a non-MetaMask wallet):

| Field | Value |
|-------|-------|
| Network Name | `Sepolia Testnet` |
| RPC URL | `https://ethereum-sepolia-rpc.publicnode.com` |
| Chain ID | `11155111` |
| Currency Symbol | `SepoliaETH` |
| Block Explorer | `https://eth-sepolia.blockscout.com` |

### Step B: Get Free SepoliaETH

The app generates its own device wallet in `expo-secure-store` and shows the
address in the Profile tab. Fund **that** address, not your MetaMask account.

1. Copy the wallet address from the app's Profile tab
2. Go to the [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)
3. Sign in with a Google account
4. Paste the address and request SepoliaETH
5. Wait ~15 seconds, then pull-to-refresh the Profile tab

### Step C: Deploy the Smart Contract

1. Go to [Remix IDE](https://remix.ethereum.org)
2. Create a new file called `MediaProof.sol`
3. Paste the content from `contracts/MediaProof.sol` in your project
4. Go to **Solidity Compiler** tab:
   - Compiler version: `0.8.20`
   - Click **Compile**
5. Go to **Deploy & Run** tab:
   - Environment: **Injected Provider - MetaMask**
   - Make sure MetaMask is on **Sepolia Testnet**
   - Click **Deploy**
   - Confirm the transaction in MetaMask
6. Copy the deployed contract address (looks like `0x1234...abcd`)
7. Open `constants/config.ts` and set `CONTRACT_ADDRESS` to the deployed address:
   ```typescript
   export const CONTRACT_ADDRESS: string = '0xYOUR_DEPLOYED_ADDRESS_HERE';
   ```

   This is the one value that stays in source rather than `.env` — a contract
   address is public, not a secret. Leaving it as the zero address is the
   supported default: anchoring then uses a data-only self-transfer and no
   deployment is needed at all.

### Step D: Verify It Works

1. Open the block explorer: https://eth-sepolia.blockscout.com
2. Search for your contract address
3. You should see the deployment transaction

> **That's it!** Now every proof your app creates will be **genuinely anchored** on Sepolia.

---

## 2️⃣ Supabase Setup (Optional)

> Optional. Without it, every case is analysed and stored in local SQLite and
> the verdict is identical — the pipeline marks the cloud step "Local only" and
> continues. This holds even when Supabase is configured but the schema has not
> been run yet, so a missing table cannot break a demo.


Supabase gives you a free PostgreSQL database + file storage.

### Step A: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → **Start your project** (free)
2. Sign up with GitHub
3. Click **New Project**
4. Choose a name (e.g., `verilens`), set a database password, pick a region
5. Wait ~2 minutes for the project to spin up

### Step B: Create the Database Table

1. In Supabase Dashboard → **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open `supabase-setup.sql` from your project root
4. Copy-paste the entire SQL into the editor
5. Click **Run** (green play button)
6. You should see "Success" — the `proofs` table is created

### Step C: Get Your API Keys

1. Go to **Settings** → **API** (left sidebar)
2. Copy these values:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### Step D: Add Keys to Your App

1. Create `.env` in the project root: `cp .env.example .env`
2. Fill in:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR...
   ```

### Step E: Add Keys to the Forensics Service (Optional)

1. Open `service/.env` (SightEngine only — the service has no database)
2. Add:
   ```
   SUPABASE_URL=https://abc123.supabase.co
   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR...
   ```

---

## 3️⃣ SightEngine Setup (Optional — comparison baseline only, NOT the detector)

Detection does not depend on this. The lanes in `service/` are the detector; SightEngine is only used as a comparison baseline.

### Step A: Create Account

1. Go to [sightengine.com](https://sightengine.com) → Sign Up (free)
2. Free tier: **500 operations/month**

### Step B: Get API Keys

1. Dashboard → API Keys
2. Copy **API User** and **API Secret**

### Step C: Add to the Forensics Service

1. Create `service/.env`
2. Add:
   ```
   SIGHTENGINE_USER=123456789
   SIGHTENGINE_SECRET=abcdefghijk
   ```

---

## 4️⃣ Forensics Service (REQUIRED — it is the detector)

Unlike everything above, this is not optional. `service/` is what actually
analyses the images. The app cannot produce a verdict without it, and it will
not invent one: if the service is unreachable the case is marked `failed` with
every verdict field left `null`.

### Local run

```bash
cd service && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
cd service && .venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Check it:

```bash
curl -s http://localhost:8000/v1/health
```

Set `EXPO_PUBLIC_API_BASE_URL` in `.env` to match. **On a physical phone use
your machine's LAN IP, not `localhost`** — the phone resolves `localhost` to
itself:

```bash
ipconfig getifaddr en0
```

**On an Android Studio emulator, use `http://10.0.2.2:8000`, not
`localhost` and not your LAN IP.** The emulator runs in its own network
namespace; `10.0.2.2` is the special alias Android's emulated network maps
back to the host machine's `localhost`. (This is unrelated to and different
from the physical-phone LAN-IP case above — the emulator is not on your LAN.)
Rebuild/restart `expo start` after changing `.env`, since `EXPO_PUBLIC_*`
values are inlined at build time, not read live.

No model weights or API keys are needed. Lanes B and C are training-free.

### Optional extras

Lane A (trained synthesis detector) and Lane E (face match) need
`requirements-ml.txt` plus, for Lane A, a checkpoint at
`service/weights/lane_a.pt` from `train_lane_a.py`. Without them both lanes
abstain with a reason and lanes B/C carry the verdict.

### Deploy free on HuggingFace Spaces

`service/Dockerfile` targets the free CPU tier and listens on port 7860.
Create a Space with SDK "Docker", push `service/`, then point
`EXPO_PUBLIC_API_BASE_URL` at the Space URL.

---

## 5️⃣ Running the Mobile App

```bash
# In the VeriLens root directory
npm install
npx expo start
```

**On your phone:**
1. Install **Expo Go** from Play Store / App Store
2. Scan the QR code from the terminal
3. The app loads on your device

**On emulator:**
```bash
npx expo start --android
# or
npx expo start --ios
```

---

## 📋 Quick Reference — What Each Service Does

| Service | Purpose | Required? | Cost |
|---------|---------|-----------|------|
| **Forensics service** (`service/`) | Detection + verdict | **Yes** — it is the detector | Free (self-hosted, CPU) |
| **Sepolia** | Tamper-proof audit anchor | No (detection works without it) | Free (testnet) |
| **Supabase** | Cloud case records + review queue | No (local SQLite used) | Free tier |
| **HuggingFace Spaces** | Hosting for `service/` | No (runs locally) | Free tier (CPU) |
| **SightEngine** | Baseline for side-by-side comparison only | No | Free trial |

> Detection never falls back to a simulation. If an image cannot be read, the
> service returns `INSUFFICIENT_EVIDENCE` rather than inventing a score.

---

## 🔑 All API Keys & Where They Go

### `.env` (Mobile App)

Read by `constants/config.ts`. Expo inlines `EXPO_PUBLIC_*` at build time.

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

`CONTRACT_ADDRESS` stays the zero address — anchoring uses a data-only
self-transfer, so no contract deployment is needed.
`WALLET_PRIVATE_KEY` stays empty — a per-device wallet is generated in
`expo-secure-store`. Never commit a private key.

### `service/.env` (Forensics Service)

The service is stateless and has no database. The only variables it reads are
the optional comparison baseline:

```
SIGHTENGINE_USER=your-user-id
SIGHTENGINE_SECRET=your-secret
```

Leave them unset in normal use. SightEngine is a third party, and sending it a
KYC image changes nothing in the returned verdict.

---

## 🏗️ Full Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile Framework | Expo SDK 54 + React Native 0.81 |
| Navigation | expo-router v6 (file-based routing) |
| Cryptography | SHA-256 (expo-crypto) + Ed25519 (@noble/ed25519) |
| Blockchain | Sepolia Testnet (EVM, Chain ID 11155111) via ethers v6 |
| Cloud Storage | Supabase (PostgreSQL + Object Storage) |
| Local Database | expo-sqlite v16 |
| Forensics Service | Python + FastAPI (`service/`) — training-free noise/compression lanes, optional trained detector + face match |
| AI Detection (optional baseline) | SightEngine API — comparison only, not the detector |
| State Management | Zustand v5 |
| UI | React Native + Reanimated 4 + Expo LinearGradient |
| Styling | NativeWind / Tailwind CSS |
| Secure Storage | expo-secure-store (keys & wallet mnemonic) |
