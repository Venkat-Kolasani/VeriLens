import type {
  Authenticity,
  Decision,
  Identity,
  LaneOut,
  VerdictReason,
} from './forensics';

// Single import site for consumers: the verdict vocabulary lives in
// lib/forensics.ts (it mirrors the service contract) and is re-exported here
// alongside the persisted case shape.
export type { Authenticity, Decision, Identity, LaneOut, VerdictReason };

export type CaseStatus = 'pending' | 'analyzing' | 'complete' | 'failed';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface KYCCase {
  id: string;
  createdAt: string;
  updatedAt: string;
  idImageUri: string;
  idImageSha256: string;
  idImageAttested: boolean;
  idImageUrl: string | null;
  selfieUri: string;
  selfieSha256: string;
  selfieAttested: boolean;
  selfieUrl: string | null;
  lanes: LaneOut[] | null;
  authenticity: Authenticity | null;
  identity: Identity | null;
  decision: Decision | null;
  confidence: number | null;
  confidenceIsCalibrated: boolean;
  reasons: VerdictReason[] | null;
  anchorTx: string | null;
  anchorBlock: number | null;
  anchorPayloadHash: string | null;
  signature: string;
  publicKey: string;
  reviewStatus: ReviewStatus | null;
  status: CaseStatus;
  deviceInfo: string;
}

export interface VerificationStep {
  id: string;
  label: string;
  status: 'waiting' | 'running' | 'success' | 'error';
  detail?: string;
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
