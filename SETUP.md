# 🚀 ProofSnap — Complete Setup Guide

## Step-by-Step: Get Everything Running

---

## 1️⃣ DataHaven Blockchain Setup (Required for real blockchain)

DataHaven is a **Substrate-based L1 blockchain with full EVM compatibility**, secured by EigenLayer.
Your app currently runs with **simulated blockchain** (fake tx hashes). To use the REAL blockchain:

### Step A: Add DataHaven Testnet to MetaMask

1. Open **MetaMask** → Networks → Add Network → Add manually
2. Fill in:
   | Field | Value |
   |-------|-------|
   | Network Name | `DataHaven Testnet` |
   | RPC URL | `https://services.datahaven-testnet.network/testnet` |
   | Chain ID | `55931` |
   | Currency Symbol | `MOCK` |
   | Block Explorer | `https://datahaven-testnet.explorer.caldera.xyz` |
3. Click **Save**

### Step B: Get Free MOCK Tokens

1. Go to [DataHaven Faucet](https://apps.datahaven.xyz/faucet)
2. Sign in (create a DataHaven account if needed)
3. Paste your MetaMask wallet address
4. Click **Request MOCK Tokens**
5. Wait ~10 seconds — you'll see MOCK tokens in your wallet

### Step C: Deploy the Smart Contract

1. Go to [Remix IDE](https://remix.ethereum.org)
2. Create a new file called `MediaProof.sol`
3. Paste the content from `contracts/MediaProof.sol` in your project
4. Go to **Solidity Compiler** tab:
   - Compiler version: `0.8.20`
   - Click **Compile**
5. Go to **Deploy & Run** tab:
   - Environment: **Injected Provider - MetaMask**
   - Make sure MetaMask is on **DataHaven Testnet**
   - Click **Deploy**
   - Confirm the transaction in MetaMask
6. Copy the deployed contract address (looks like `0x1234...abcd`)
7. Open `constants/config.ts` in your code
8. Replace the CONTRACT_ADDRESS:
   ```typescript
   export const CONTRACT_ADDRESS: string = '0xYOUR_DEPLOYED_ADDRESS_HERE';
   ```

### Step D: Verify It Works

1. Open the block explorer: https://datahaven-testnet.explorer.caldera.xyz
2. Search for your contract address
3. You should see the deployment transaction

> **That's it!** Now every proof your app creates will be **genuinely anchored** on DataHaven blockchain.

---

## 2️⃣ Supabase Setup (Required for cloud storage)

Supabase gives you a free PostgreSQL database + file storage.

### Step A: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → **Start your project** (free)
2. Sign up with GitHub
3. Click **New Project**
4. Choose a name (e.g., `proofsnap`), set a database password, pick a region
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
   ```typescript
   export const SUPABASE_URL: string = 'https://abc123.supabase.co';
   export const SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR...';
   ```

### Step E: Add Keys to Backend Server (Optional)

1. Open `server/.env` (create from `server/.env.example`)
2. Add:
   ```
   SUPABASE_URL=https://abc123.supabase.co
   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR...
   ```

---

## 3️⃣ SightEngine AI Setup (Optional — for real AI detection)

Without this, AI detection returns realistic **simulated** results (fine for hackathon demo).

### Step A: Create Account

1. Go to [sightengine.com](https://sightengine.com) → Sign Up (free)
2. Free tier: **500 operations/month**

### Step B: Get API Keys

1. Dashboard → API Keys
2. Copy **API User** and **API Secret**

### Step C: Add to Backend Server

1. Create `server/.env` from `server/.env.example`
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
6. Copy the Render URL (e.g., `https://proofsnap-api.onrender.com`)
7. Update `API_BASE_URL` in `constants/config.ts`

---

## 5️⃣ Running the Mobile App

```bash
# In the ProofSnap root directory
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
| **DataHaven** | Blockchain proof anchoring | No (simulated by default) | Free (testnet) |
| **Supabase** | Cloud database + file storage | No (local SQLite used) | Free tier |
| **SightEngine** | AI deepfake detection | No (simulated results) | Free (500/month) |
| **Render.com** | Backend API hosting | No (simulated locally) | Free tier |

> **Everything works without any external service** — the app uses simulations by default. Set up services one by one to enable real features.

---

## 🔑 All API Keys & Where They Go

### `constants/config.ts` (Mobile App)
```typescript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const CONTRACT_ADDRESS = '0xYourDeployedContract';
export const API_BASE_URL = 'https://your-render-url.onrender.com';
```

### `server/.env` (Backend)
```
PORT=3001
SIGHTENGINE_USER=your-user-id
SIGHTENGINE_SECRET=your-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
```

---

## 🏗️ Full Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile Framework | Expo SDK 54 + React Native 0.81 |
| Navigation | expo-router v6 (file-based routing) |
| Cryptography | SHA-256 (expo-crypto) + Ed25519 (@noble/ed25519) |
| Blockchain | DataHaven Testnet (EVM, Chain ID 55931) via ethers v6 |
| Cloud Storage | Supabase (PostgreSQL + Object Storage) |
| Local Database | expo-sqlite v16 |
| AI Detection | SightEngine API (deepfake + AI-generated) |
| Backend | Express.js + multer + node-fetch |
| State Management | Zustand v5 |
| UI | React Native + Reanimated 4 + Expo LinearGradient |
| Styling | NativeWind / Tailwind CSS |
| Secure Storage | expo-secure-store (keys & wallet mnemonic) |
