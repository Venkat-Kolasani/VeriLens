import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import { CHAIN_RPC, CONTRACT_ADDRESS, CHAIN_EXPLORER, CHAIN_FAUCET, WALLET_PRIVATE_KEY } from '@/constants/config';
import { MEDIA_PROOF_ABI } from '@/constants/abi';

const WALLET_KEY = 'proofsnap_eth_wallet';

// Blockscout v2 REST API (eth-sepolia.blockscout.com)
const BLOCKSCOUT_API = `${CHAIN_EXPLORER}/api/v2`;

// Interface for decoding / encoding anchorProof call data
const PROOF_IFACE = new ethers.Interface(MEDIA_PROOF_ABI);

let provider: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(CHAIN_RPC);
  }
  return provider;
}

// ──── Wallet helpers ────
//
// Priority order:
//   1. WALLET_PRIVATE_KEY from config (hardcoded funded deployer wallet)
//   2. Mnemonic stored in SecureStore from a previous random-wallet session
//   3. Brand new random wallet (stored to SecureStore for future use)
//
// Using a configured private key guarantees a consistent, funded address
// across all devices — ideal for a demo / hackathon build.

export async function getOrCreateWallet(): Promise<ethers.Wallet> {
  // 1. Use configured private key if provided (funded deployer wallet)
  if (WALLET_PRIVATE_KEY && WALLET_PRIVATE_KEY.trim().length > 0) {
    const key = WALLET_PRIVATE_KEY.trim();
    // Validate: a private key must be 64 hex chars (optionally 0x-prefixed → 66 chars)
    const hex = key.startsWith('0x') ? key.slice(2) : key;
    if (hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex)) {
      const wallet = new ethers.Wallet(key);
      return wallet.connect(getProvider()) as unknown as ethers.Wallet;
    }
    // Invalid format — warn and fall through to SecureStore wallet
    console.warn(
      '[Blockchain] WALLET_PRIVATE_KEY has invalid format (expected 64-char hex, got ' +
        hex.length +
        ' chars). Falling back to device wallet.'
    );
  }

  // 2. Fall back to SecureStore mnemonic
  let mnemonic = await SecureStore.getItemAsync(WALLET_KEY);

  if (!mnemonic) {
    const newWallet = ethers.Wallet.createRandom();
    mnemonic = newWallet.mnemonic?.phrase ?? '';
    await SecureStore.setItemAsync(WALLET_KEY, mnemonic);
  }

  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return wallet.connect(getProvider()) as unknown as ethers.Wallet;
}

export async function getWalletAddress(): Promise<string> {
  const wallet = await getOrCreateWallet();
  return wallet.address;
}

export async function getWalletBalance(): Promise<string> {
  try {
    const wallet = await getOrCreateWallet();
    const balance = await getProvider().getBalance(wallet.address);
    return ethers.formatEther(balance);
  } catch {
    return '0.0';
  }
}

// ──── Helper: convert file hash to bytes32 ────

function toBytes32(fileHash: string): string {
  const hex = fileHash.startsWith('0x') ? fileHash : '0x' + fileHash;
  // SHA-256 is 32 bytes → 64 hex chars. Pad if shorter, trim if longer.
  return ethers.zeroPadValue(
    hex.length > 66 ? '0x' + hex.slice(2, 66) : hex,
    32
  );
}

// ═══════════════════════════════════════════════════════════
//  Anchor proof on Sepolia Testnet
//  Sends a REAL on-chain transaction with proof data encoded
//  in the tx data field (ABI-encoded anchorProof call).
// ═══════════════════════════════════════════════════════════

export async function anchorProof(
  fileHash: string,
  edSignature: string,
  edPublicKey: string
): Promise<{ txHash: string; blockNumber: number } | null> {
  try {
    const wallet = await getOrCreateWallet();
    const paddedHash = toBytes32(fileHash);

    if (CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      // ── Real contract call ──
      const contract = new ethers.Contract(CONTRACT_ADDRESS, MEDIA_PROOF_ABI, wallet);
      const tx = await contract.anchorProof(paddedHash, edSignature, edPublicKey);
      const receipt = await tx.wait();
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    }

    // ── No contract deployed — send a data-only self-transfer ──
    // Encode proof data exactly like a contract call so it can be
    // decoded later from the explorer / Blockscout API.
    const data = PROOF_IFACE.encodeFunctionData('anchorProof', [
      paddedHash,
      edSignature,
      edPublicKey,
    ]);

    const tx = await wallet.sendTransaction({
      to: wallet.address, // self-transfer
      value: 0n,
      data,
    });

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction was not mined');

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error: any) {
    const msg = error?.message ?? '';
    // Surface insufficient-funds error clearly so the user knows to use the faucet
    if (
      msg.includes('insufficient funds') ||
      msg.includes("doesn't have enough funds") ||
      msg.includes('insufficient balance')
    ) {
      throw new Error(
        `Insufficient SepoliaETH for gas.\nGet free tokens from the faucet:\n${CHAIN_FAUCET}`
      );
    }
    console.warn('Blockchain anchoring failed:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  Decode proof data from raw tx input (ABI-encoded)
// ═══════════════════════════════════════════════════════════

export function decodeProofData(inputData: string): {
  fileHash: string;
  signature: string;
  publicKey: string;
} | null {
  try {
    const decoded = PROOF_IFACE.decodeFunctionData('anchorProof', inputData);
    return {
      fileHash: decoded[0] as string,
      signature: decoded[1] as string,
      publicKey: decoded[2] as string,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  Fetch transaction from Blockscout REST API
//  GET /api/v2/transactions/{hash}
// ═══════════════════════════════════════════════════════════

export interface ExplorerTxResult {
  found: boolean;
  hash?: string;
  from?: string;
  to?: string;
  blockNumber?: number;
  timestamp?: string;
  status?: string;
  value?: string;
  fee?: string;
  rawInput?: string;
  decodedProof?: { fileHash: string; signature: string; publicKey: string };
}

export async function fetchTransactionFromExplorer(txHash: string): Promise<ExplorerTxResult> {
  try {
    const url = `${BLOCKSCOUT_API}/transactions/${txHash}`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!resp.ok) return { found: false };

    const tx = await resp.json();

    // Extract raw input data (Blockscout v2 field name)
    const rawInput: string = tx.raw_input ?? tx.input ?? '';

    // Try to decode ProofSnap anchored data
    let decodedProof: { fileHash: string; signature: string; publicKey: string } | undefined;
    if (rawInput && rawInput.length > 10) {
      decodedProof = decodeProofData(rawInput) ?? undefined;
    }

    return {
      found: true,
      hash: tx.hash,
      from: tx.from?.hash ?? tx.from,
      to: tx.to?.hash ?? tx.to,
      blockNumber: tx.block_number ?? tx.block,
      timestamp: tx.timestamp,
      status: tx.status,
      value: tx.value,
      fee: tx.fee?.value,
      rawInput,
      decodedProof,
    };
  } catch (err) {
    console.warn('[Explorer] Fetch failed:', err);
    return { found: false };
  }
}

// ═══════════════════════════════════════════════════════════
//  Verify a proof on-chain (contract or Blockscout)
// ═══════════════════════════════════════════════════════════

export async function verifyOnChainProof(
  fileHash: string
): Promise<{ exists: boolean; signer?: string; timestamp?: number; txHash?: string } | null> {
  try {
    if (CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, MEDIA_PROOF_ABI, getProvider());
      const paddedHash = toBytes32(fileHash);
      try {
        const proof = await contract.getProof(paddedHash);
        return {
          exists: true,
          signer: proof.submitter ?? proof.signer,
          timestamp: Number(proof.timestamp),
        };
      } catch {
        return { exists: false };
      }
    }

    // Without a contract, we cannot search by hash alone.
    // The user must look up by tx hash using fetchTransactionFromExplorer.
    return null;
  } catch {
    return null;
  }
}
