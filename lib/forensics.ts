import { API_BASE_URL } from '@/constants/config';

// Mirrors the response contract in service/main.py. Kept as plain types
// rather than a validation library: if the service changes shape, the
// verdict rendering should fail loudly in review, not be silently coerced.

export type Authenticity = 'REAL' | 'LIKELY_FAKE' | 'INSUFFICIENT_EVIDENCE';
export type Identity = 'MATCH' | 'MISMATCH' | 'INDETERMINATE';
export type Decision = 'ACCEPT' | 'REJECT' | 'REVIEW';

export interface LaneOut {
  lane: string;
  name: string;
  score: number;
  confidence: number;
  usable: boolean;
  reasons: string[];
  box: [number, number, number, number] | null;
}

export interface ImageAnalysis {
  sha256: string;
  width: number;
  height: number;
  quality_usable: boolean;
  quality_reasons: string[];
  jpeg_quality: number | null;
  lanes: LaneOut[];
}

export interface VerdictReason {
  lane: string;
  text: string;
  severity: 'info' | 'warn' | 'critical';
}

export interface Verdict {
  authenticity: Authenticity;
  identity: Identity | null;
  decision: Decision;
  confidence: number;
  /** False until a held-out calibration set exists. Never render this
   *  number as a probability while it is false. */
  confidence_is_calibrated: boolean;
  score: number | null;
  reasons: VerdictReason[];
}

export interface AnalyzeResult {
  version: string;
  verdict: Verdict;
  id_image: ImageAnalysis | null;
  selfie: ImageAnalysis | null;
}

const TIMEOUT_MS = 60000;

/** Thrown when the service cannot be reached or returns an error.
 *
 *  Deliberately NOT caught into a fabricated verdict. The old build fell
 *  back to Math.random() scores when the API was down, which produced
 *  confident-looking output with no evidence behind it. A KYC decision
 *  must fail visibly instead. */
export class ForensicsUnavailable extends Error {}

function filePart(uri: string, name: string) {
  const ext = uri.split('.').pop()?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';
  return { uri, name: `${name}.${ext === 'png' ? 'png' : 'jpg'}`, type } as any;
}

/** Lane D capture attestation for one image (currently only ever the
 *  selfie — the ID image is never attested). Absent/null means "not
 *  attempted"; the service treats that as unattested, never as a penalty. */
export interface Attestation {
  nonce: string;
  signature: string;
  publicKey: string;
}

function appendAttestation(form: FormData, attestation: Attestation | null | undefined) {
  if (!attestation) return;
  form.append('attestation_nonce', attestation.nonce);
  form.append('attestation_signature', attestation.signature);
  form.append('attestation_public_key', attestation.publicKey);
}

/** GET a single-use nonce to sign for capture attestation. Expires 120s
 *  after issue (server-enforced) — fetch it right before signing. */
export async function fetchAttestationNonce(): Promise<{ nonce: string; expiresIn: number }> {
  const res = await fetch(`${API_BASE_URL}/v1/attest/nonce`);
  if (!res.ok) {
    throw new ForensicsUnavailable(`Nonce request returned ${res.status}`);
  }
  const body = await res.json();
  return { nonce: body.nonce, expiresIn: body.expires_in };
}

async function post(path: string, body: FormData): Promise<AnalyzeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ForensicsUnavailable(
        `Forensics service returned ${res.status}. ${detail.slice(0, 200)}`
      );
    }
    return (await res.json()) as AnalyzeResult;
  } catch (err: any) {
    if (err instanceof ForensicsUnavailable) throw err;
    const why = err?.name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : err?.message;
    throw new ForensicsUnavailable(`Could not reach forensics service at ${API_BASE_URL}: ${why}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Full KYC check. Authenticity is the worst of the two images.
 *  `attestation`, when present, attests the SELFIE only — the ID image is
 *  never attested. */
export async function analyzeKycPair(
  idImageUri: string,
  selfieUri: string,
  attestation?: Attestation | null
): Promise<AnalyzeResult> {
  const form = new FormData();
  form.append('id_image', filePart(idImageUri, 'id'));
  form.append('selfie', filePart(selfieUri, 'selfie'));
  appendAttestation(form, attestation);
  return post('/v1/analyze', form);
}

/** Single image, authenticity only. No identity axis to report. */
export async function analyzeSingle(
  imageUri: string,
  attestation?: Attestation | null
): Promise<AnalyzeResult> {
  const form = new FormData();
  form.append('image', filePart(imageUri, 'image'));
  appendAttestation(form, attestation);
  return post('/v1/analyze/single', form);
}

export async function serviceHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}
