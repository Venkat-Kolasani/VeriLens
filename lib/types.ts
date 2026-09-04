export type VerificationStatus = 'pending' | 'verifying' | 'verified' | 'failed';

export interface MediaRecord {
  id: string;
  fileUri: string;
  fileName: string;
  fileType: 'image' | 'video';
  fileSize: number;
  fileHash: string;
  signature: string;
  publicKey: string;
  timestamp: number;
  blockchainTx: string | null;
  blockNumber: number | null;
  aiDeepfakeScore: number;
  aiGeneratedScore: number;
  plagiarismScore: number;
  trustScore: number;
  trustGrade: string;
  watermarkedUri: string | null;
  imageUrl: string | null;
  status: VerificationStatus;
  deviceInfo: string;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationStep {
  id: string;
  label: string;
  status: 'waiting' | 'running' | 'success' | 'error';
  detail?: string;
}

export interface TrustScoreResult {
  score: number;
  grade: string;
  factors: {
    hashVerified: boolean;
    signatureValid: boolean;
    blockchainAnchored: boolean;
    deepfakeScore: number;
    aiGeneratedScore: number;
    plagiarismScore: number;
    hasMetadata: boolean;
  };
}

export interface AIDetectionResult {
  deepfakeScore: number;
  aiGeneratedScore: number;
  isGenuine: boolean;
  simulated: boolean;
}

export interface PlagiarismResult {
  isOriginal: boolean;
  matchPercentage: number;
  sources: string[];
  simulated: boolean;
}

export interface BlockchainProof {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  signer: string;
  fileHash: string;
  signature: string;
  publicKey: string;
  exists: boolean;
}
