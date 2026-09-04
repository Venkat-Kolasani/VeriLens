import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { hashMediaFile, signData, getPublicKey, getFileInfo } from './crypto';
import { anchorProof } from './blockchain';
import { detectDeepfake, checkPlagiarism } from './ai-detection';
import { computeTrustScore } from './trust-score';
import { applyVisibleWatermark, generateInvisibleWatermarkId } from './watermark';
import { insertMediaRecord, updateMediaRecord } from './db';
import { uploadProofToSupabase, uploadThumbnailToStorage } from './supabase';
import type { MediaRecord, VerificationStep } from './types';
import { getGrade } from '@/constants/Colors';

type ProgressCallback = (steps: VerificationStep[]) => void;

function createSteps(): VerificationStep[] {
  return [
    { id: 'hash', label: 'Generating cryptographic hash', status: 'waiting' },
    { id: 'sign', label: 'Signing with device key', status: 'waiting' },
    { id: 'blockchain', label: 'Anchoring on Sepolia', status: 'waiting' },
    { id: 'ai', label: 'AI deepfake analysis', status: 'waiting' },
    { id: 'trust', label: 'Computing trust score', status: 'waiting' },
    { id: 'watermark', label: 'Applying watermark', status: 'waiting' },
    { id: 'cloud', label: 'Syncing to Supabase cloud', status: 'waiting' },
  ];
}

function updateStep(
  steps: VerificationStep[],
  stepId: string,
  status: VerificationStep['status'],
  detail?: string
): VerificationStep[] {
  return steps.map((s) =>
    s.id === stepId ? { ...s, status, detail } : s
  );
}

export async function runVerificationPipeline(
  fileUri: string,
  fileType: 'image' | 'video',
  onProgress: ProgressCallback
): Promise<MediaRecord> {
  let steps = createSteps();
  const recordId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();

  // Determine file name
  const uriParts = fileUri.split('/');
  const fileName = uriParts[uriParts.length - 1] || `capture_${Date.now()}`;

  // Get file info
  const fileInfo = await getFileInfo(fileUri);
  const fileSize = (fileInfo && 'exists' in fileInfo && fileInfo.exists && 'size' in fileInfo)
    ? (fileInfo as any).size ?? 0
    : 0;

  // Create initial record
  const record: MediaRecord = {
    id: recordId,
    fileUri,
    fileName,
    fileType,
    fileSize,
    fileHash: '',
    signature: '',
    publicKey: '',
    timestamp: Date.now(),
    blockchainTx: null,
    blockNumber: null,
    aiDeepfakeScore: 0,
    aiGeneratedScore: 0,
    plagiarismScore: 0,
    trustScore: 0,
    trustGrade: 'F',
    watermarkedUri: null,
    imageUrl: null,
    status: 'verifying',
    deviceInfo: `${Platform.OS} ${Platform.Version}`,
    location: null,
    createdAt: now,
    updatedAt: now,
  };

  await insertMediaRecord(record);

  try {
    // Step 1: Hash
    steps = updateStep(steps, 'hash', 'running');
    onProgress(steps);
    const fileHash = await hashMediaFile(fileUri);
    record.fileHash = fileHash;
    steps = updateStep(steps, 'hash', 'success', fileHash.substring(0, 12) + '...');
    onProgress(steps);
    await sleep(300);

    // Step 2: Sign
    steps = updateStep(steps, 'sign', 'running');
    onProgress(steps);
    const signature = await signData(fileHash);
    const publicKey = (await getPublicKey()) ?? '';
    record.signature = signature;
    record.publicKey = publicKey;
    steps = updateStep(steps, 'sign', 'success', 'Signed ✓');
    onProgress(steps);
    await sleep(300);

    // Step 3: Blockchain anchor
    steps = updateStep(steps, 'blockchain', 'running');
    onProgress(steps);
    let bcResult: { txHash: string; blockNumber: number } | null = null;
    let bcError: string | null = null;
    try {
      bcResult = await anchorProof(fileHash, signature, publicKey);
    } catch (err: any) {
      bcError = err?.message ?? 'Anchoring failed';
    }
    if (bcResult) {
      record.blockchainTx = bcResult.txHash;
      record.blockNumber = bcResult.blockNumber;
      steps = updateStep(
        steps,
        'blockchain',
        'success',
        `Tx: ${bcResult.txHash.substring(0, 10)}...`
      );
    } else {
      steps = updateStep(
        steps,
        'blockchain',
        'error',
        bcError ?? 'Failed - will retry'
      );
    }
    onProgress(steps);
    await sleep(300);

    // Step 4: AI detection
    steps = updateStep(steps, 'ai', 'running');
    onProgress(steps);

    let imageBase64 = '';
    try {
      if (fileType === 'image') {
        imageBase64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
    } catch { }

    const aiResult = await detectDeepfake(imageBase64);
    record.aiDeepfakeScore = aiResult.deepfakeScore;
    record.aiGeneratedScore = aiResult.aiGeneratedScore;
    steps = updateStep(
      steps,
      'ai',
      aiResult.simulated ? 'error' : 'success',
      aiResult.simulated
        ? 'Simulated — API unavailable'
        : aiResult.isGenuine
        ? 'Genuine ✓'
        : `Suspicious (${(aiResult.deepfakeScore * 100).toFixed(0)}%)`
    );
    onProgress(steps);
    await sleep(300);

    // Step 5: Plagiarism (silent — no visible step, no real API)
    const plagiarismResult = await checkPlagiarism(imageBase64);
    record.plagiarismScore = plagiarismResult.matchPercentage;

    // Step 5 (visible): Trust score
    steps = updateStep(steps, 'trust', 'running');
    onProgress(steps);
    const trustResult = computeTrustScore({
      hashVerified: true,
      signatureValid: true,
      blockchainAnchored: bcResult !== null,
      deepfakeScore: aiResult.deepfakeScore,
      aiGeneratedScore: aiResult.aiGeneratedScore,
      plagiarismScore: plagiarismResult.matchPercentage,
      hasMetadata: true,
    });
    record.trustScore = trustResult.score;
    record.trustGrade = trustResult.grade;
    steps = updateStep(
      steps,
      'trust',
      'success',
      `Score: ${trustResult.score} (Grade ${trustResult.grade})`
    );
    onProgress(steps);
    await sleep(300);

    // Step 7: Watermark
    steps = updateStep(steps, 'watermark', 'running');
    onProgress(steps);
    if (fileType === 'image') {
      const watermarkedUri = await applyVisibleWatermark(
        fileUri,
        trustResult.score,
        trustResult.grade
      );
      record.watermarkedUri = watermarkedUri;
    }
    const wmId = generateInvisibleWatermarkId();
    steps = updateStep(steps, 'watermark', 'success', `ID: ${wmId}`);
    onProgress(steps);

    // Step 8: Supabase cloud sync
    steps = updateStep(steps, 'cloud', 'running');
    onProgress(steps);

    // Upload image to Supabase storage bucket first
    if (imageBase64 && imageBase64.length > 0) {
      try {
        const publicImageUrl = await uploadThumbnailToStorage(recordId, imageBase64, 'image/jpeg');
        if (publicImageUrl) {
          record.imageUrl = publicImageUrl;
          console.log('[Pipeline] Image uploaded to Supabase storage:', publicImageUrl);
        }
      } catch (err) {
        console.warn('[Pipeline] Image upload to storage failed:', err);
      }
    }

    const cloudSynced = await uploadProofToSupabase(record);
    steps = updateStep(
      steps,
      'cloud',
      cloudSynced ? 'success' : 'error',
      cloudSynced ? 'Synced ✓' : 'Local only'
    );
    onProgress(steps);

    // Final: Mark verified
    record.status = 'verified';
    record.updatedAt = new Date().toISOString();
    await updateMediaRecord(recordId, record);

    return record;
  } catch (error) {
    console.error('Verification pipeline error:', error);
    record.status = 'failed';
    record.updatedAt = new Date().toISOString();
    await updateMediaRecord(recordId, { status: 'failed' });
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
