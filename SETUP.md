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
7. Open `constants/config.ts` in your code
8. Replace the CONTRACT_ADDRESS:
   ```typescript
   export const CONTRACT_ADDRESS: string = '0xYOUR_DEPLOYED_ADDRESS_HERE';
   ```

### Step D: Verify It Works

1. Open the block explorer: https://eth-sepolia.blockscout.com
2. Search for your contract address
3. You should see the deployment transaction

> **That's it!** Now every proof your app creates will be **genuinely anchored** on Sepolia.

---

## 2️⃣ Supabase Setup (Required for cloud storage)

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

1. Open `constants/config.ts`
2. Replace the placeholder values:
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

## 3️⃣ SightEngine AI Setup (Optional — for real AI detection)

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

## 4️⃣ Backend Server Deployment (Optional)

The app works **fully offline** without the backend. The backend adds real AI detection + cloud API.

### Local Development

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your keys
npm run dev
```

Server runs at `http://localhost:3001`

### Deploy to Render.com (Free)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Settings:
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
5. Add environment variables (SIGHTENGINE_USER, SIGHTENGINE_SECRET, SUPABASE_URL, SUPABASE_KEY)
6. Copy the Render URL (e.g., `https://verilens-api.onrender.com`)
7. Update `API_BASE_URL` in `constants/config.ts`

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
| AI Detection | SightEngine API (deepfake + AI-generated) |
| Backend | Express.js + multer + node-fetch |
| State Management | Zustand v5 |
| UI | React Native + Reanimated 4 + Expo LinearGradient |
| Styling | NativeWind / Tailwind CSS |
| Secure Storage | expo-secure-store (keys & wallet mnemonic) |
