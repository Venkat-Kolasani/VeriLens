import 'react-native-get-random-values';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

// Configure @noble/ed25519 to use @noble/hashes SHA-512
// Required because Hermes (React Native) does not provide crypto.subtle
const sha512Hash = (...msgs: Uint8Array[]) => sha512(ed.etc.concatBytes(...msgs));
ed.etc.sha512Sync = sha512Hash;
ed.etc.sha512Async = async (...msgs: Uint8Array[]) => sha512Hash(...msgs);

const PRIVATE_KEY_STORE = 'proofsnap_private_key';
const PUBLIC_KEY_STORE = 'proofsnap_public_key';

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return arr;
}

// Generate new Ed25519 keypair and store securely
export async function generateKeyPair(): Promise<{ publicKey: string }> {
  const privateKeyBytes = Crypto.getRandomBytes(32);
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);

  const privateKeyHex = uint8ArrayToHex(privateKeyBytes);
  const publicKeyHex = uint8ArrayToHex(publicKeyBytes);

  await SecureStore.setItemAsync(PRIVATE_KEY_STORE, privateKeyHex);
  await SecureStore.setItemAsync(PUBLIC_KEY_STORE, publicKeyHex);

  return { publicKey: publicKeyHex };
}

// Check if keys exist
export async function hasKeys(): Promise<boolean> {
  const pk = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
  return pk !== null;
}

// Get public key
export async function getPublicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(PUBLIC_KEY_STORE);
}

// Sign data with the stored private key
export async function signData(dataHex: string): Promise<string> {
  const privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
  if (!privateKeyHex) throw new Error('No private key found. Generate keys first.');

  const privateKey = hexToUint8Array(privateKeyHex);
  const message = hexToUint8Array(dataHex);
  const signature = await ed.signAsync(message, privateKey);
  return uint8ArrayToHex(signature);
}

// Verify a signature
export async function verifySignature(
  dataHex: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  const message = hexToUint8Array(dataHex);
  const signature = hexToUint8Array(signatureHex);
  const publicKey = hexToUint8Array(publicKeyHex);
  return ed.verifyAsync(signature, message, publicKey);
}

// Hash a media file using SHA-256
export async function hashMediaFile(uri: string): Promise<string> {
  try {
    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to bytes
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Hash with expo-crypto
    const hash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
    return uint8ArrayToHex(new Uint8Array(hash));
  } catch (error) {
    console.warn('Primary hash failed, using fallback:', error);
    // Fallback: read file as base64, decode to raw bytes, then hash
    // This ensures we hash the same raw bytes as the primary path
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryStr = atob(base64);
    const fallbackBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      fallbackBytes[i] = binaryStr.charCodeAt(i);
    }
    const fallbackHash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, fallbackBytes);
    return uint8ArrayToHex(new Uint8Array(fallbackHash));
  }
}

// Get file info
export async function getFileInfo(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info;
}
