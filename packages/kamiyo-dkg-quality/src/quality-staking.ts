import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import type {
  UAL,
  QualityStake,
  QualityStakeStatus,
  QualityMetadata,
  QualityStakingConfig,
  PublisherReputation,
} from './types.js';
import { DEFAULT_STAKING_CONFIG } from './types.js';
import { deriveEscrowPDA, type PDAConfig } from './pda.js';

/**
 * Links SOL escrow stakes to DKG Knowledge Assets.
 */
export class QualityStakingManager {
  private stakes: Map<string, QualityStake> = new Map();
  private reputations: Map<string, PublisherReputation> = new Map();
  private config: QualityStakingConfig;
  private pdaConfig?: PDAConfig;

  constructor(config: Partial<QualityStakingConfig> = {}, pdaConfig?: PDAConfig) {
    this.config = { ...DEFAULT_STAKING_CONFIG, ...config };
    this.pdaConfig = pdaConfig;
  }

  async createQualityStake(params: {
    assetUal: UAL;
    publisher: PublicKey;
    stakeAmount: BN;
    verificationDeadlineHours?: number;
  }): Promise<QualityStake> {
    const { assetUal, publisher, stakeAmount, verificationDeadlineHours } = params;

    // Validate UAL format
    if (!assetUal || typeof assetUal !== 'string') {
      throw new Error('Asset UAL is required');
    }
    if (!assetUal.startsWith('did:dkg:')) {
      throw new Error(`Invalid UAL format: must start with "did:dkg:". Got: ${assetUal.slice(0, 20)}`);
    }
    const ualParts = parseUAL(assetUal);
    if (!ualParts) {
      throw new Error(`Invalid UAL format: ${assetUal}. Expected: did:dkg:{network}/{contract}/{tokenId}`);
    }

    // Validate stake amount
    if (!stakeAmount || stakeAmount.lten(0)) {
      throw new Error('Stake amount must be positive');
    }
    if (stakeAmount.lt(this.config.minStakeAmount)) {
      throw new Error(
        `Stake amount ${stakeAmount.toString()} below minimum ${this.config.minStakeAmount.toString()}`
      );
    }

    // Validate deadline
    if (verificationDeadlineHours !== undefined && verificationDeadlineHours <= 0) {
      throw new Error('Verification deadline hours must be positive');
    }

    if (this.stakes.has(assetUal)) {
      throw new Error(`Quality stake already exists for asset: ${assetUal}`);
    }

    const now = Math.floor(Date.now() / 1000);
    const deadlineHours = verificationDeadlineHours ?? this.config.verificationWindowHours;

    // Derive escrow PDA from asset UAL
    const escrowPda = this.deriveEscrowPda(assetUal, publisher);

    const stake: QualityStake = {
      assetUal,
      publisher,
      stakeAmount,
      createdAt: now,
      verificationDeadline: now + deadlineHours * 3600,
      status: 'pending',
      escrowPda,
    };

    this.stakes.set(assetUal, stake);
    return stake;
  }

  async resolveQualityAssessment(params: {
    assetUal: UAL;
    medianScore: number;
    oracleCount: number;
  }): Promise<{ stake: QualityStake; metadata: QualityMetadata }> {
    const { assetUal, medianScore, oracleCount } = params;

    // Validate inputs
    if (!assetUal) {
      throw new Error('Asset UAL is required');
    }
    if (typeof medianScore !== 'number' || !Number.isFinite(medianScore)) {
      throw new Error('Median score must be a valid number');
    }
    if (medianScore < 0 || medianScore > 100) {
      throw new Error(`Median score must be between 0-100. Got: ${medianScore}`);
    }
    if (typeof oracleCount !== 'number' || !Number.isInteger(oracleCount) || oracleCount < 1) {
      throw new Error(`Oracle count must be a positive integer. Got: ${oracleCount}`);
    }

    const stake = this.stakes.get(assetUal);
    if (!stake) {
      throw new Error(`No quality stake found for asset: ${assetUal}`);
    }

    if (stake.status !== 'pending') {
      throw new Error(`Stake already resolved with status: ${stake.status}`);
    }

    // Determine status based on score thresholds
    let status: QualityStakeStatus;
    if (medianScore >= this.config.verifiedThreshold) {
      status = 'verified';
    } else if (medianScore < this.config.disputedThreshold) {
      status = 'disputed';
    } else {
      status = 'contested';
    }

    stake.status = status;

    // Update publisher reputation
    await this.updatePublisherReputation(stake.publisher, stake, medianScore);

    const metadata: QualityMetadata = {
      qualityScore: medianScore,
      verifiedAt: Math.floor(Date.now() / 1000),
      oracleConsensus: oracleCount,
      publisherReputation: this.getPublisherScore(stake.publisher),
      stakeAmount: stake.stakeAmount.toString(),
      verificationTx: '', // Set by caller
      status,
    };

    return { stake, metadata };
  }

  getStake(assetUal: UAL): QualityStake | undefined {
    return this.stakes.get(assetUal);
  }

  getReputation(publisher: PublicKey): PublisherReputation | undefined {
    return this.reputations.get(publisher.toBase58());
  }

  getPublisherScore(publisher: PublicKey): number {
    const rep = this.reputations.get(publisher.toBase58());
    if (!rep || rep.totalAssets === 0) return 0;
    return Math.round(rep.averageQualityScore);
  }

  calculateDistribution(stake: QualityStake, score: number): {
    publisherReturn: BN;
    oracleReward: BN;
    protocolFee: BN;
    slashed: BN;
  } {
    const total = stake.stakeAmount;

    if (score >= this.config.verifiedThreshold) {
      // Full return minus small protocol fee
      const protocolFee = total.muln(this.config.protocolFeeBps).divn(10000);
      return {
        publisherReturn: total.sub(protocolFee),
        oracleReward: new BN(0),
        protocolFee,
        slashed: new BN(0),
      };
    }

    if (score < this.config.disputedThreshold) {
      // Full slash - split between oracles and protocol
      const oracleReward = total.muln(this.config.oracleRewardBps).divn(10000);
      const protocolFee = total.muln(this.config.protocolFeeBps).divn(10000);
      return {
        publisherReturn: new BN(0),
        oracleReward,
        protocolFee,
        slashed: total.sub(oracleReward).sub(protocolFee),
      };
    }

    // Contested - partial return proportional to score
    const returnPercent = ((score - this.config.disputedThreshold) /
      (this.config.verifiedThreshold - this.config.disputedThreshold)) * 100;
    const publisherReturn = total.muln(Math.round(returnPercent)).divn(100);
    const remainder = total.sub(publisherReturn);
    const oracleReward = remainder.muln(this.config.oracleRewardBps).divn(10000);
    const protocolFee = remainder.muln(this.config.protocolFeeBps).divn(10000);

    return {
      publisherReturn,
      oracleReward,
      protocolFee,
      slashed: remainder.sub(oracleReward).sub(protocolFee),
    };
  }

  getPendingStakes(): QualityStake[] {
    return Array.from(this.stakes.values()).filter((s) => s.status === 'pending');
  }

  getExpiredStakes(): QualityStake[] {
    const now = Math.floor(Date.now() / 1000);
    return this.getPendingStakes().filter((s) => s.verificationDeadline < now);
  }

  buildQualityMetadataJsonLd(metadata: QualityMetadata): object {
    return {
      '@context': {
        kamiyo: 'https://kamiyo.ai/schema/',
        quality: 'kamiyo:quality',
        verifiedAt: 'kamiyo:verifiedAt',
        qualityScore: 'kamiyo:qualityScore',
        oracleConsensus: 'kamiyo:oracleConsensus',
        publisherReputation: 'kamiyo:publisherReputation',
        stakeAmount: 'kamiyo:stakeAmount',
        verificationTx: 'kamiyo:verificationTx',
      },
      'kamiyo:qualityScore': metadata.qualityScore,
      'kamiyo:verifiedAt': new Date(metadata.verifiedAt * 1000).toISOString(),
      'kamiyo:oracleConsensus': metadata.oracleConsensus,
      'kamiyo:publisherReputation': metadata.publisherReputation,
      'kamiyo:stakeAmount': metadata.stakeAmount,
      'kamiyo:verificationTx': metadata.verificationTx,
      'kamiyo:status': metadata.status,
    };
  }

  private deriveEscrowPda(assetUal: UAL, publisher: PublicKey): PublicKey {
    const { pda } = deriveEscrowPDA(assetUal, publisher, this.pdaConfig);
    return pda;
  }

  private async updatePublisherReputation(
    publisher: PublicKey,
    stake: QualityStake,
    score: number
  ): Promise<void> {
    const key = publisher.toBase58();
    let rep = this.reputations.get(key);

    if (!rep) {
      rep = {
        publisher,
        totalAssets: 0,
        verifiedAssets: 0,
        disputedAssets: 0,
        contestedAssets: 0,
        averageQualityScore: 0,
        totalStakeSlashed: new BN(0),
        totalStakeReturned: new BN(0),
        memberSince: Math.floor(Date.now() / 1000),
      };
    }

    // Update counts
    rep.totalAssets += 1;
    if (stake.status === 'verified') {
      rep.verifiedAssets += 1;
      rep.totalStakeReturned = rep.totalStakeReturned.add(stake.stakeAmount);
    } else if (stake.status === 'disputed') {
      rep.disputedAssets += 1;
      rep.totalStakeSlashed = rep.totalStakeSlashed.add(stake.stakeAmount);
    } else {
      rep.contestedAssets += 1;
      // Partial amounts handled by distribution calculation
    }

    // Update rolling average
    rep.averageQualityScore =
      (rep.averageQualityScore * (rep.totalAssets - 1) + score) / rep.totalAssets;

    this.reputations.set(key, rep);
  }
}

export function parseUAL(ual: UAL): {
  network: string;
  contract: string;
  tokenId: string;
} | null {
  const match = ual.match(/^did:dkg:([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    network: match[1],
    contract: match[2],
    tokenId: match[3],
  };
}

export function buildUAL(network: string, contract: string, tokenId: string): UAL {
  return `did:dkg:${network}/${contract}/${tokenId}`;
}
