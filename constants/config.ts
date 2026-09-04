// ═══════════════════════════════════════════════════════════
//  VeriLens — App Configuration
//  Separated from Colors.ts for clarity
// ═══════════════════════════════════════════════════════════
//
//  Secrets are read from EXPO_PUBLIC_* env vars (Expo inlines these
//  at build time). Every value falls back to a safe empty/default so
//  the app still runs — see isSupabaseConfigured() in lib/supabase.ts
//  for the graceful-degrade path.

// ──── Backend API ────
// The forensics service (FastAPI). Defaults to a local dev server;
// set EXPO_PUBLIC_API_BASE_URL to the deployed URL for release builds.
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

// ──── Supabase Cloud ────
export const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ──── Blockchain: Ethereum Sepolia Testnet ────
// Public L1 testnet. Free SepoliaETH from the Google Cloud Web3 faucet.
export const CHAIN_RPC: string = 'https://ethereum-sepolia-rpc.publicnode.com';
export const CHAIN_ID: number = 11155111;
export const CHAIN_NAME: string = 'Sepolia Testnet';
export const CHAIN_CURRENCY: string = 'SepoliaETH';
// Blockscout-based explorer (v2 REST API)
export const CHAIN_EXPLORER: string = 'https://eth-sepolia.blockscout.com';
export const CHAIN_FAUCET: string =
  'https://cloud.google.com/application/web3/faucet/ethereum/sepolia';
export const BLOCK_EXPLORER: string = CHAIN_EXPLORER;

// ──── Smart Contract ────
// Intentionally the zero address. Proofs are anchored as data-only
// self-transfers (ABI-encoded payload in tx.data) — see the fallback
// path in lib/blockchain.ts anchorProof(). Verification reads the tx
// by hash from Blockscout and decodes tx.input, so no on-chain
// contract lookup is needed and no deploy is required.
// To use a real contract instead, deploy contracts/MediaProof.sol and
// paste its address here.
export const CONTRACT_ADDRESS: string = '0x0000000000000000000000000000000000000000';

// ──── Wallet ────
// Leave empty. getOrCreateWallet() in lib/blockchain.ts generates a
// per-device wallet and stores it in expo-secure-store; the user funds
// it from the in-app faucet button.
// NEVER commit a private key here.
export const WALLET_PRIVATE_KEY: string = '';
