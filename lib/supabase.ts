import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/constants/config';
import type { KYCCase, LaneOut, VerdictReason } from './types';

// ──────────────── Supabase Client ────────────────

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// Table and bucket names come from supabase-setup.sql — keep them in sync.
const TABLE = 'kyc_cases';
const BUCKET = 'kyc-media';

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

/** One row of the kyc_cases table (see supabase-setup.sql). */
export interface SupabaseCase {
  id: string;
  created_at: string;
  updated_at: string;
  id_image_sha256: string;
  id_image_url: string | null;
  id_image_attested: boolean;
  selfie_sha256: string;
  selfie_url: string | null;
  selfie_attested: boolean;
  lanes: LaneOut[] | null;
  authenticity: string | null;
  identity: string | null;
  decision: string | null;
  confidence: number | null;
  confidence_is_calibrated: boolean;
  reasons: VerdictReason[] | null;
  anchor_tx: string | null;
  anchor_block: number | null;
  anchor_payload_hash: string | null;
  signature: string | null;
  public_key: string | null;
  review_status: string | null;
  device_info: string | null;
}

// ──────────────── Insert Case ────────────────

export async function uploadCaseToSupabase(kycCase: KYCCase): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.log('[Supabase] Not configured, skipping cloud sync.');
    return false;
  }

  try {
    const row: SupabaseCase = {
      id: kycCase.id,
      created_at: kycCase.createdAt,
      updated_at: kycCase.updatedAt,
      id_image_sha256: kycCase.idImageSha256,
      id_image_url: kycCase.idImageUrl,
      id_image_attested: kycCase.idImageAttested,
      selfie_sha256: kycCase.selfieSha256,
      selfie_url: kycCase.selfieUrl,
      selfie_attested: kycCase.selfieAttested,
      lanes: kycCase.lanes,
      authenticity: kycCase.authenticity,
      identity: kycCase.identity,
      decision: kycCase.decision,
      confidence: kycCase.confidence,
      confidence_is_calibrated: kycCase.confidenceIsCalibrated,
      reasons: kycCase.reasons,
      anchor_tx: kycCase.anchorTx,
      anchor_block: kycCase.anchorBlock,
      anchor_payload_hash: kycCase.anchorPayloadHash,
      signature: kycCase.signature,
      public_key: kycCase.publicKey,
      review_status: kycCase.reviewStatus,
      device_info: kycCase.deviceInfo,
    };

    const { error } = await getSupabase().from(TABLE).insert(row);

    if (error) {
      console.warn('[Supabase] Insert error:', error.message);
      return false;
    }

    console.log('[Supabase] Case uploaded:', kycCase.id);
    return true;
  } catch (err) {
    console.warn('[Supabase] Upload failed:', err);
    return false;
  }
}

// ──────────────── Look up a case by image hash ────────────────

/** Either uploaded image can match — a verifier only holds one of them. */
export async function verifyCaseByImageHash(
  sha256: string
): Promise<SupabaseCase | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .or(`id_image_sha256.eq.${sha256},selfie_sha256.eq.${sha256}`)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as SupabaseCase;
  } catch {
    return null;
  }
}

// ──────────────── Look up a case by anchor tx hash ────────────────

export async function verifyCaseByTxHash(
  txHash: string
): Promise<SupabaseCase | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .eq('anchor_tx', txHash)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as SupabaseCase;
  } catch {
    return null;
  }
}

// ──────────────── Get recent cases ────────────────

export async function getRecentCases(limit = 20): Promise<SupabaseCase[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as SupabaseCase[];
  } catch {
    return [];
  }
}

// ──────────────── Get Stats from Supabase ────────────────

export async function getCloudStats(): Promise<{
  totalCases: number;
  totalAccepted: number;
} | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { count: totalCases } = await getSupabase()
      .from(TABLE)
      .select('*', { count: 'exact', head: true });

    const { count: totalAccepted } = await getSupabase()
      .from(TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('decision', 'ACCEPT');

    return {
      totalCases: totalCases ?? 0,
      totalAccepted: totalAccepted ?? 0,
    };
  } catch {
    return null;
  }
}

// ──────────────── Upload a case image to Storage ────────────────

export async function uploadCaseImageToStorage(
  caseId: string,
  kind: 'id' | 'selfie',
  base64Data: string,
  contentType = 'image/jpeg'
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const fileName = `${caseId}/${kind}.jpg`;

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const { error } = await getSupabase().storage
      .from(BUCKET)
      .upload(fileName, bytes, { contentType, upsert: true });

    if (error) {
      console.warn('[Supabase Storage] Upload error:', error.message);
      return null;
    }

    const { data: urlData } = getSupabase().storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (err) {
    console.warn('[Supabase Storage] Failed:', err);
    return null;
  }
}
