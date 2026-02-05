import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { createHash, randomBytes } from 'crypto';
import type {
  UAL,
  QualityScores,
  QualityAssessment,
  OracleCommitment,
  OracleInfo,
  OracleProtocolConfig,
} from './types.js';
import { DEFAULT_ORACLE_CONFIG, DEFAULT_QUALITY_WEIGHTS } from './types.js';
import {
  ValidationError,
  UalError,
  OracleNotRegisteredError,
  InsufficientStakeError,
  CommitmentError,
  InvalidCommitmentError,
} from './errors.js';

export class OracleProtocolManager {
  private oracles: Map<string, OracleInfo> = new Map();
  private commitments: Map<string, OracleCommitment[]> = new Map();
  private reveals: Map<string, QualityAssessment[]> = new Map();
  private config: OracleProtocolConfig;

  constructor(config: Partial<OracleProtocolConfig> = {}) {
    this.config = { ...DEFAULT_ORACLE_CONFIG, ...config };
  }

  async registerOracle(params: { oracleId: PublicKey; stake: BN; }): Promise<OracleInfo> {
    const { oracleId, stake } = params;
    if (!oracleId) throw new ValidationError('Oracle ID (public key) is required', 'oracleId');
    if (!stake || stake.lten(0)) throw new ValidationError('Oracle stake must be positive', 'stake');
    if (stake.lt(this.config.minOracleStake)) throw new InsufficientStakeError(this.config.minOracleStake.toString(), stake.toString());

    const key = oracleId.toBase58();
    if (this.oracles.has(key)) throw new ValidationError(`Oracle already registered: ${key}`, 'oracleId');

    const info: OracleInfo = {
      oracleId,
      stake,
      totalAssessments: 0,
      correctAssessments: 0,
      slashedAmount: new BN(0),
      rewardedAmount: new BN(0),
      registeredAt: Math.floor(Date.now() / 1000),
      active: true,
    };

    this.oracles.set(key, info);
    return info;
  }

  async submitCommitment(params: { assetUal: UAL; oracleId: PublicKey; commitment: string; }): Promise<OracleCommitment> {
    const { assetUal, oracleId, commitment } = params;

    if (!assetUal || typeof assetUal !== 'string') throw new ValidationError('Asset UAL is required', 'assetUal');
    if (!assetUal.startsWith('did:dkg:')) throw new UalError(`Invalid UAL format: must start with "did:dkg:"`, assetUal);
    if (!oracleId) throw new ValidationError('Oracle ID is required', 'oracleId');
    if (!commitment || typeof commitment !== 'string' || commitment.length < 32) throw new ValidationError('Valid commitment hash is required (min 32 characters)', 'commitment');

    const oracle = this.oracles.get(oracleId.toBase58());
    if (!oracle || !oracle.active) throw new OracleNotRegisteredError(oracleId.toBase58());

    const existing = this.commitments.get(assetUal) || [];
    if (existing.some((c) => c.oracleId.equals(oracleId))) throw new CommitmentError(`Oracle already committed for asset: ${assetUal}`);

    const commit: OracleCommitment = { assetUal, oracleId, commitment, committedAt: Math.floor(Date.now() / 1000) };
    existing.push(commit);
    this.commitments.set(assetUal, existing);
    return commit;
  }

  async revealAssessment(params: { assetUal: UAL; oracleId: PublicKey; scores: QualityScores; salt: string; }): Promise<QualityAssessment> {
    const { assetUal, oracleId, scores, salt } = params;

    if (!assetUal || typeof assetUal !== 'string') throw new ValidationError('Asset UAL is required', 'assetUal');
    if (!oracleId) throw new ValidationError('Oracle ID is required', 'oracleId');
    if (!scores) throw new ValidationError('Quality scores are required', 'scores');
    if (!this.validateScores(scores)) throw new ValidationError('Invalid quality scores: all scores must be integers between 0-100', 'scores');
    if (!salt || typeof salt !== 'string' || salt.length < 16) throw new ValidationError('Valid salt is required (min 16 characters)', 'salt');

    const commitments = this.commitments.get(assetUal) || [];
    const commitment = commitments.find((c) => c.oracleId.equals(oracleId));
    if (!commitment) throw new CommitmentError(`No commitment found for oracle: ${oracleId.toBase58()}`);

    const overallScore = this.calculateOverallScore(scores);
    const expectedCommitment = this.computeCommitment(overallScore, salt, assetUal, oracleId);
    if (expectedCommitment !== commitment.commitment) throw new InvalidCommitmentError();

    const assessment: QualityAssessment = {
      assetUal,
      oracleId,
      scores,
      overallScore,
      commitment: commitment.commitment,
      salt,
      revealedAt: Math.floor(Date.now() / 1000),
    };

    const reveals = this.reveals.get(assetUal) || [];
    reveals.push(assessment);
    this.reveals.set(assetUal, reveals);

    return assessment;
  }

  async finalizeAssessment(assetUal: UAL): Promise<{ medianScore: number; oracleCount: number; rewards: Array<{ oracleId: PublicKey; reward: BN; slashed: BN }>; }> {
    const reveals = this.reveals.get(assetUal) || [];
    if (reveals.length < this.config.minOraclesRequired) throw new ValidationError(`Insufficient reveals: ${reveals.length} < ${this.config.minOraclesRequired}`, 'reveals');

    const scores = reveals.map((r) => r.overallScore).sort((a, b) => a - b);
    const mid = Math.floor(scores.length / 2);
    const medianScore = scores.length % 2 === 0 ? Math.round((scores[mid - 1] + scores[mid]) / 2) : scores[mid];

    const rewards: Array<{ oracleId: PublicKey; reward: BN; slashed: BN }> = [];

    for (const reveal of reveals) {
      const oracle = this.oracles.get(reveal.oracleId.toBase58());
      if (!oracle) continue;

      const deviation = Math.abs(reveal.overallScore - medianScore);
      const denom = Math.max(1, medianScore);
      const deviationPercent = (deviation / denom) * 100;

      let reward = new BN(0);
      let slashed = new BN(0);

      if (deviationPercent <= 10) {
        reward = oracle.stake.muln(1).divn(1000);
        oracle.correctAssessments += 1;
        oracle.rewardedAmount = oracle.rewardedAmount.add(reward);
      } else if (deviationPercent > this.config.outlierThresholdPercent) {
        slashed = oracle.stake.muln(this.config.slashingPercent).divn(100);
        oracle.slashedAmount = oracle.slashedAmount.add(slashed);
        oracle.stake = oracle.stake.sub(slashed);
        const violations = oracle.totalAssessments - oracle.correctAssessments;
        if (violations >= this.config.maxViolations) oracle.active = false;
      }

      oracle.totalAssessments += 1;
      rewards.push({ oracleId: reveal.oracleId, reward, slashed });
    }

    return { medianScore, oracleCount: reveals.length, rewards };
  }

  getOracle(oracleId: PublicKey): OracleInfo | undefined { return this.oracles.get(oracleId.toBase58()); }
  getActiveOracles(): OracleInfo[] { return Array.from(this.oracles.values()).filter((o) => o.active); }
  getCommitments(assetUal: UAL): OracleCommitment[] { return this.commitments.get(assetUal) || []; }
  getReveals(assetUal: UAL): QualityAssessment[] { return this.reveals.get(assetUal) || []; }

  isCommitWindowOpen(assetUal: UAL, stakeCreatedAt: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const commitDeadline = stakeCreatedAt + this.config.commitWindowMinutes * 60;
    return now < commitDeadline;
  }

  isRevealWindowOpen(assetUal: UAL, stakeCreatedAt: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const commitDeadline = stakeCreatedAt + this.config.commitWindowMinutes * 60;
    const revealDeadline = commitDeadline + this.config.revealWindowMinutes * 60;
    return now >= commitDeadline && now < revealDeadline;
  }

  computeCommitment(score: number, salt: string, assetUal: UAL, oracleId: PublicKey): string {
    const data = `${score}:${salt}:${assetUal}:${oracleId.toBase58()}`;
    return createHash('sha256').update(data).digest('hex');
  }

  generateSalt(): string { return randomBytes(32).toString('hex'); }

  calculateOverallScore(scores: QualityScores, weights: QualityScores = DEFAULT_QUALITY_WEIGHTS): number {
    const totalWeight = weights.factualAccuracy + weights.sourceQuality + weights.completeness + weights.consistency;
    const weighted = scores.factualAccuracy * weights.factualAccuracy + scores.sourceQuality * weights.sourceQuality + scores.completeness * weights.completeness + scores.consistency * weights.consistency;
    return Math.round(weighted / totalWeight);
  }

  validateScores(scores: QualityScores): boolean {
    const values = [scores.factualAccuracy, scores.sourceQuality, scores.completeness, scores.consistency];
    return values.every((v) => v >= 0 && v <= 100 && Number.isInteger(v));
  }
}
