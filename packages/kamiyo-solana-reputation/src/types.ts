import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
export { KAMIYO_PROGRAM_ID, modelIdFromString } from '@kamiyo/solana-common';

export interface ModelReputation {
  modelId: Uint8Array;
  owner: PublicKey;
  totalInferences: BN;
  successfulInferences: BN;
  totalQualitySum: BN;
  disputes: BN;
  createdAt: BN;
  lastUpdated: BN;
  bump: number;
}

export interface ModelStats {
  successRate: number;
  avgQuality: number;
  totalInferences: number;
  disputes: number;
}

export interface UserReputation {
  totalSpent: BN;
  totalInferences: number;
  disputeRate: number;
  avgScore: number;
}
