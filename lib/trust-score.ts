import type { TrustScoreResult } from './types';
import { getGrade } from '@/constants/Colors';

export function computeTrustScore(factors: {
  hashVerified: boolean;
  signatureValid: boolean;
  blockchainAnchored: boolean;
  deepfakeScore: number;
  aiGeneratedScore: number;
  plagiarismScore: number;
  hasMetadata: boolean;
}): TrustScoreResult {
  let score = 100;

  // Cryptographic integrity (most important)
  if (!factors.hashVerified) score -= 50;
  if (!factors.signatureValid) score -= 30;

  // Blockchain anchoring
  if (!factors.blockchainAnchored) score -= 10;

  // AI analysis penalties
  if (factors.deepfakeScore > 0.7) {
    score -= 40;
  } else if (factors.deepfakeScore > 0.4) {
    score -= 20;
  } else if (factors.deepfakeScore > 0.2) {
    score -= 5;
  }

  if (factors.aiGeneratedScore > 0.7) {
    score -= 30;
  } else if (factors.aiGeneratedScore > 0.4) {
    score -= 15;
  } else if (factors.aiGeneratedScore > 0.2) {
    score -= 3;
  }

  // Plagiarism penalty
  if (factors.plagiarismScore > 50) {
    score -= 20;
  } else if (factors.plagiarismScore > 30) {
    score -= 10;
  }

  // Metadata bonus
  if (factors.hasMetadata) {
    score = Math.min(100, score + 2);
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));
  const grade = getGrade(score);

  return {
    score: Math.round(score),
    grade,
    factors,
  };
}
