import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { anchorProof } from './blockchain';
import { getPublicKey, hashMediaFile, signData } from './crypto';
import { insertCase, updateCase } from './db';
import {
  ForensicsUnavailable,
  analyzeKycPair,
  fetchAttestationNonce,
  type AnalyzeResult,
  type Attestation,
} from './forensics';
import { uploadCaseImageToStorage, uploadCaseToSupabase } from './supabase';
import type { KYCCase, VerificationStep } from './types';

type ProgressCallback = (steps: VerificationStep[]) => void;

function createSteps(): VerificationStep[] {
  return [
    { id: 'hash', label: 'Hashing ID document and selfie', status: 'waiting' },
    { id: 'sign', label: 'Signing the image pair', status: 'waiting' },
    { id: 'forensics', label: 'Running forensic analysis', status: 'waiting' },
    { id: 'anchor', label: 'Anchoring verdict on Sepolia', status: 'waiting' },
    { id: 'cloud', label: 'Syncing case to Supabase cloud', status: 'waiting' },
  ];
}

function updateStep(
  steps: VerificationStep[],
  stepId: string,
  status: VerificationStep['status'],
  detail?: string
): VerificationStep[] {
  return steps.map((s) => (s.id === stepId ? { ...s, status, detail } : s));
}

/** The record that gets anchored on-chain: the verdict, not the image.
 *
 *  Key order is fixed so the digest is reproducible from the stored case —
 *  a verifier can rebuild this string and confirm the on-chain hash. */
function canonicalVerdictRecord(
  kycCase: KYCCase,
  analysis: AnalyzeResult
): string {
  return JSON.stringify({
    id_image_sha256: kycCase.idImageSha256,
    selfie_sha256: kycCase.selfieSha256,
    authenticity: analysis.verdict.authenticity,
    identity: analysis.verdict.identity,
    decision: analysis.verdict.decision,
    confidence: analysis.verdict.confidence,
    lanes: (kycCase.lanes ?? []).map((l) => [l.lane, l.score, l.confidence]),
    created_at: kycCase.createdAt,
  });
}

async function readBase64(uri: string): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return '';
  }
}

export async function runKycCheck(
  idImageUri: string,
  selfieUri: string,
  idAttested: boolean,
  onProgress: ProgressCallback
): Promise<KYCCase> {
  let steps = createSteps();
  const caseId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();

  const kycCase: KYCCase = {
    id: caseId,
    createdAt: now,
    updatedAt: now,
    idImageUri,
    idImageSha256: '',
    idImageAttested: idAttested,
    idImageUrl: null,
    selfieUri,
    selfieSha256: '',
    // Whether Lane D capture attestation was attempted (nonce fetched,
    // selfie hash signed with the device key, sent to the server). This is
    // NOT a verdict on whether the server accepted it — the service verifies
    // the signature independently and absence is never held against a case.
    selfieAttested: false,
    selfieUrl: null,
    lanes: null,
    authenticity: null,
    identity: null,
    decision: null,
    confidence: null,
    confidenceIsCalibrated: false,
    reasons: null,
    anchorTx: null,
    anchorBlock: null,
    anchorPayloadHash: null,
    signature: '',
    publicKey: '',
    reviewStatus: null,
    status: 'analyzing',
    deviceInfo: `${Platform.OS} ${Platform.Version}`,
  };

  await insertCase(kycCase);

  // Steps 1-2: Hash both images, then sign the pair. A failure here is fatal
  // (no hash, nothing to analyse or anchor) so the case is marked failed.
  try {
    steps = updateStep(steps, 'hash', 'running');
    onProgress(steps);
    kycCase.idImageSha256 = await hashMediaFile(idImageUri);
    kycCase.selfieSha256 = await hashMediaFile(selfieUri);
    steps = updateStep(
      steps,
      'hash',
      'success',
      `ID ${kycCase.idImageSha256.substring(0, 8)}… · selfie ${kycCase.selfieSha256.substring(0, 8)}…`
    );
    onProgress(steps);

    steps = updateStep(steps, 'sign', 'running');
    onProgress(steps);
    kycCase.signature = await signData(
      kycCase.idImageSha256 + kycCase.selfieSha256
    );
    kycCase.publicKey = (await getPublicKey()) ?? '';
    steps = updateStep(steps, 'sign', 'success', 'Pair signed with device key');
    onProgress(steps);
  } catch (err: any) {
    steps = updateStep(
      steps,
      kycCase.idImageSha256 ? 'sign' : 'hash',
      'error',
      err?.message ?? 'Failed'
    );
    onProgress(steps);
    kycCase.status = 'failed';
    await updateCase(caseId, { status: 'failed' });
    throw err;
  }

  // Lane D: best-effort selfie capture attestation. Deliberately NOT part of
  // the hash/sign try/catch above — a nonce-fetch or signing hiccup here
  // must never fail the case (HANDOFF.md: absence of attestation is never
  // evidence of anything).
  let attestation: Attestation | null = null;
  try {
    const { nonce } = await fetchAttestationNonce();
    const signature = await signData(nonce + kycCase.selfieSha256);
    const publicKey = (await getPublicKey()) ?? '';
    attestation = { nonce, signature, publicKey };
    kycCase.selfieAttested = true;
  } catch (err: any) {
    console.warn('Selfie attestation unavailable, proceeding without it:', err?.message ?? err);
  }

  // Step 3: Forensic analysis
  //
  // A ForensicsUnavailable here is terminal for the case: the verdict fields
  // stay null and the status becomes 'failed'. Nothing is synthesised — an
  // unreachable detector is not evidence of anything.
  steps = updateStep(steps, 'forensics', 'running');
  onProgress(steps);
  let analysis: AnalyzeResult;
  try {
    // The selfie is the image injection defence cares about — pass along
    // whatever attestation we managed to acquire above (may be null).
    analysis = await analyzeKycPair(idImageUri, selfieUri, attestation);
  } catch (err: any) {
    const detail =
      err instanceof ForensicsUnavailable
        ? 'Detection service unavailable — no verdict'
        : (err?.message ?? 'Analysis failed');
    steps = updateStep(steps, 'forensics', 'error', detail);
    steps = updateStep(steps, 'anchor', 'error', 'Skipped — nothing to anchor');
    steps = updateStep(steps, 'cloud', 'error', 'Skipped — no verdict to sync');
    onProgress(steps);

    kycCase.status = 'failed';
    kycCase.updatedAt = new Date().toISOString();
    await updateCase(caseId, {
      idImageSha256: kycCase.idImageSha256,
      selfieSha256: kycCase.selfieSha256,
      signature: kycCase.signature,
      publicKey: kycCase.publicKey,
      status: 'failed',
    });
    return kycCase;
  }

  const { verdict } = analysis;
  kycCase.lanes = [
    ...(analysis.id_image?.lanes ?? []),
    ...(analysis.selfie?.lanes ?? []),
  ];
  kycCase.authenticity = verdict.authenticity;
  kycCase.identity = verdict.identity;
  kycCase.decision = verdict.decision;
  kycCase.confidence = verdict.confidence;
  kycCase.confidenceIsCalibrated = verdict.confidence_is_calibrated;
  kycCase.reasons = verdict.reasons;
  kycCase.reviewStatus = verdict.decision === 'REVIEW' ? 'pending' : null;
  steps = updateStep(
    steps,
    'forensics',
    'success',
    `${verdict.authenticity} · ${verdict.identity ?? 'NO IDENTITY'} · ${verdict.decision}`
  );
  onProgress(steps);

  // Step 4: Anchor the verdict digest (not the image hash). Non-fatal.
  steps = updateStep(steps, 'anchor', 'running');
  onProgress(steps);
  try {
    const payloadHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      canonicalVerdictRecord(kycCase, analysis)
    );
    kycCase.anchorPayloadHash = payloadHash;
    const anchor = await anchorProof(
      payloadHash,
      kycCase.signature,
      kycCase.publicKey
    );
    if (anchor) {
      kycCase.anchorTx = anchor.txHash;
      kycCase.anchorBlock = anchor.blockNumber;
      steps = updateStep(steps, 'anchor', 'success', `Tx ${anchor.txHash.substring(0, 10)}…`);
    } else {
      steps = updateStep(steps, 'anchor', 'error', 'Anchoring failed — verdict kept locally');
    }
  } catch (err: any) {
    steps = updateStep(steps, 'anchor', 'error', err?.message ?? 'Anchoring failed');
  }
  onProgress(steps);

  // Step 5: Cloud sync. Non-fatal.
  steps = updateStep(steps, 'cloud', 'running');
  onProgress(steps);
  const [idBase64, selfieBase64] = await Promise.all([
    readBase64(idImageUri),
    readBase64(selfieUri),
  ]);
  if (idBase64) {
    kycCase.idImageUrl = await uploadCaseImageToStorage(caseId, 'id', idBase64);
  }
  if (selfieBase64) {
    kycCase.selfieUrl = await uploadCaseImageToStorage(caseId, 'selfie', selfieBase64);
  }
  const cloudSynced = await uploadCaseToSupabase(kycCase);
  steps = updateStep(steps, 'cloud', cloudSynced ? 'success' : 'error', cloudSynced ? 'Synced' : 'Local only');
  onProgress(steps);

  kycCase.status = 'complete';
  kycCase.updatedAt = new Date().toISOString();
  await updateCase(caseId, kycCase);

  return kycCase;
}
