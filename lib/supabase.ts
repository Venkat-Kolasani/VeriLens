import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/constants/config';
import type { MediaRecord } from './types';

// ──────────────── Supabase Client ────────────────

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// Check if Supabase is configured (not using placeholder values)
export function isSupabaseConfigured(): boolean {
  const configured =
    !!SUPABASE_URL &&
    !!SUPABASE_ANON_KEY &&
    SUPABASE_URL.length > 10 &&
    SUPABASE_ANON_KEY.length > 10 &&
    SUPABASE_URL.includes('supabase.co') &&
    !SUPABASE_URL.includes('your-project');
  if (!configured) {
    console.log('[Supabase] Config check failed:', {
      url: SUPABASE_URL?.substring(0, 30),
      keyLen: SUPABASE_ANON_KEY?.length,
    });
  }
  return configured;
}

// ──────────────── Database Types ────────────────

export interface SupabaseProof {
  id: string;
  file_hash: string;
  signature: string;
  public_key: string;
  blockchain_tx: string | null;
  block_number: number | null;
  ai_deepfake_score: number;
  ai_generated_score: number;
  plagiarism_score: number;
  trust_score: number;
  trust_grade: string;
  file_type: string;
  file_name: string;
  file_size: number;
  image_url: string | null;
  device_info: string | null;
  status: string;
  created_at: string;
}

// ──────────────── Insert Proof ────────────────

export async function uploadProofToSupabase(record: MediaRecord): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.log('[Supabase] Not configured, skipping cloud sync.');
    return false;
  }

  try {
    const proof: SupabaseProof = {
      id: record.id,
      file_hash: record.fileHash,
      signature: record.signature,
      public_key: record.publicKey,
      blockchain_tx: record.blockchainTx,
      block_number: record.blockNumber,
      ai_deepfake_score: record.aiDeepfakeScore,
      ai_generated_score: record.aiGeneratedScore,
      plagiarism_score: record.plagiarismScore,
      trust_score: record.trustScore,
      trust_grade: record.trustGrade,
      file_type: record.fileType,
      file_name: record.fileName,
      file_size: record.fileSize,
      image_url: record.imageUrl,
      device_info: record.deviceInfo,
      status: record.status,
      created_at: record.createdAt,
    };

    const { error } = await getSupabase().from('proofs').insert(proof);

    if (error) {
      console.warn('[Supabase] Insert error:', error.message);
      return false;
    }

    console.log('[Supabase] Proof uploaded:', record.id);
    return true;
  } catch (err) {
    console.warn('[Supabase] Upload failed:', err);
    return false;
  }
}

// ──────────────── Verify Proof by Hash ────────────────

export async function verifyProofOnSupabase(
  fileHash: string
): Promise<SupabaseProof | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await getSupabase()
      .from('proofs')
      .select('*')
      .eq('file_hash', fileHash)
      .single();

    if (error || !data) return null;
    return data as SupabaseProof;
  } catch {
    return null;
  }
}

// ──────────────── Verify Proof by Blockchain TX Hash ────────────────

export async function verifyProofByTxHash(
  txHash: string
): Promise<SupabaseProof | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await getSupabase()
      .from('proofs')
      .select('*')
      .eq('blockchain_tx', txHash)
      .single();

    if (error || !data) return null;
    return data as SupabaseProof;
  } catch {
    return null;
  }
}

// ──────────────── Get All Proofs (Global Feed) ────────────────

export async function getRecentProofs(limit = 20): Promise<SupabaseProof[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await getSupabase()
      .from('proofs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as SupabaseProof[];
  } catch {
    return [];
  }
}

// ──────────────── Get Stats from Supabase ────────────────

export async function getCloudStats(): Promise<{
  totalProofs: number;
  totalVerified: number;
} | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { count: totalProofs } = await getSupabase()
      .from('proofs')
      .select('*', { count: 'exact', head: true });

    const { count: totalVerified } = await getSupabase()
      .from('proofs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'verified');

    return {
      totalProofs: totalProofs ?? 0,
      totalVerified: totalVerified ?? 0,
    };
  } catch {
    return null;
  }
}

// ──────────────── Upload Media Thumbnail to Storage ────────────────

export async function uploadThumbnailToStorage(
  recordId: string,
  base64Data: string,
  contentType = 'image/jpeg'
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const fileName = `thumbnails/${recordId}.jpg`;

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const { error } = await getSupabase().storage
      .from('media')
      .upload(fileName, bytes, { contentType, upsert: true });

    if (error) {
      console.warn('[Supabase Storage] Upload error:', error.message);
      return null;
    }

    const { data: urlData } = getSupabase().storage
      .from('media')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (err) {
    console.warn('[Supabase Storage] Failed:', err);
    return null;
  }
}

// ──────────────── SQL Schema for Supabase ────────────────
/*
Run this in the Supabase SQL Editor to create the proofs table:

CREATE TABLE proofs (
  id TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  public_key TEXT NOT NULL,
  blockchain_tx TEXT,
  block_number BIGINT,
  ai_deepfake_score REAL DEFAULT 0,
  ai_generated_score REAL DEFAULT 0,
  plagiarism_score REAL DEFAULT 0,
  trust_score INTEGER DEFAULT 0,
  trust_grade TEXT DEFAULT 'F',
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  image_url TEXT,
  device_info TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read proofs (for verification)
CREATE POLICY "Proofs are publicly readable" ON proofs
  FOR SELECT USING (true);

-- Allow inserting proofs from anon key
CREATE POLICY "Anyone can insert proofs" ON proofs
  FOR INSERT WITH CHECK (true);

-- Create index on file_hash for fast lookups
CREATE INDEX idx_proofs_file_hash ON proofs(file_hash);
CREATE INDEX idx_proofs_status ON proofs(status);

-- Create storage bucket for media thumbnails
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true);

-- Allow public access to media bucket
CREATE POLICY "Public media access" ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

CREATE POLICY "Anyone can upload media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'media');
*/
