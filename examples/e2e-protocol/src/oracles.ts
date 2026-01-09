import { Keypair } from '@solana/web3.js';
import { ethers } from 'ethers';
import { Oracle, OracleVote, Escrow, DisputeResolution } from './types';
import { DEFAULTS } from './config';
import { log } from './logger';

const DEFAULT_ORACLE_PROFILES = [
  { id: 'oracle-1', weight: 100, reputation: 95 },
  { id: 'oracle-2', weight: 80, reputation: 88 },
  { id: 'oracle-3', weight: 60, reputation: 82 },
  { id: 'oracle-4', weight: 40, reputation: 75 },
  { id: 'oracle-5', weight: 30, reputation: 70 },
];

export class OracleNetwork {
  private oracles: Map<string, Oracle> = new Map();

  async registerOracles(count: number = 5): Promise<Oracle[]> {
    const profiles = DEFAULT_ORACLE_PROFILES.slice(0, count);
    const registered: Oracle[] = [];

    for (const profile of profiles) {
      const oracle: Oracle = {
        id: profile.id,
        keypair: Keypair.generate(),
        weight: profile.weight,
        reputation: profile.reputation,
        violations: 0,
      };

      this.oracles.set(oracle.id, oracle);
      registered.push(oracle);

      await log.ok(`${oracle.id}: weight ${oracle.weight} | rep ${oracle.reputation}%`);
    }

    const minQuorum = DEFAULTS.oracle.minQuorum;
    const highQuorum = DEFAULTS.oracle.highValueQuorum;
    await log.dim(`Quorum: ${minQuorum}-of-${count} standard | ${highQuorum}-of-${count} high-value`);

    return registered;
  }

  selectOracles(escrow: Escrow): Oracle[] {
    const quorum = escrow.amount > DEFAULTS.oracle.highValueThreshold
      ? DEFAULTS.oracle.highValueQuorum
      : DEFAULTS.oracle.minQuorum;

    const sorted = Array.from(this.oracles.values())
      .filter(o => o.violations < 3)
      .sort((a, b) => b.weight - a.weight);

    return sorted.slice(0, quorum);
  }

  async commitPhase(escrow: Escrow, oracles: Oracle[]): Promise<OracleVote[]> {
    const votes: OracleVote[] = [];

    for (const oracle of oracles) {
      const score = this.assessQuality(escrow, oracle);
      const blinding = ethers.hexlify(ethers.randomBytes(16));
      const commitment = ethers.keccak256(
        ethers.toUtf8Bytes(`${score}:${blinding}:${escrow.id}`)
      );

      const vote: OracleVote = {
        oracle,
        commitment,
        blinding,
        score,
        revealed: false,
        timestamp: Date.now(),
      };

      votes.push(vote);
      await log.ok(`${oracle.id}: committed (${commitment.slice(0, 18)}...)`);
    }

    return votes;
  }

  async revealPhase(votes: OracleVote[]): Promise<void> {
    for (const vote of votes) {
      vote.revealed = true;
      await log.ok(`${vote.oracle.id}: revealed score ${vote.score}%`);
    }
  }

  calculateSettlement(escrow: Escrow, votes: OracleVote[]): DisputeResolution {
    const scores = votes.map(v => v.score).sort((a, b) => a - b);
    const medianScore = scores[Math.floor(scores.length / 2)];

    const refundPct = this.calculateRefundPercent(medianScore);
    const consumerRefund = escrow.amount * (refundPct / 100);
    const providerPayout = escrow.amount - consumerRefund;

    const oracleRewards = new Map<string, number>();
    const oracleSlashes = new Map<string, number>();

    for (const vote of votes) {
      const deviation = Math.abs(vote.score - medianScore);
      if (deviation > DEFAULTS.oracle.maxScoreDeviation) {
        const slash = escrow.amount * DEFAULTS.reputation.slashAmount;
        oracleSlashes.set(vote.oracle.id, slash);
        vote.oracle.violations++;
      } else {
        const reward = (escrow.amount * 0.01) / votes.length;
        oracleRewards.set(vote.oracle.id, reward);
      }
    }

    return {
      escrowId: escrow.id,
      votes,
      medianScore,
      refundPct,
      consumerRefund,
      providerPayout,
      oracleRewards,
      oracleSlashes,
      resolvedAt: Date.now(),
    };
  }

  private calculateRefundPercent(score: number): number {
    for (const tier of DEFAULTS.refund.tiers) {
      if (score >= tier.minScore) {
        return tier.refundPct;
      }
    }
    return 100;
  }

  private assessQuality(escrow: Escrow, oracle: Oracle): number {
    if (!escrow.delivery) return 50;

    let score = escrow.delivery.quality;
    const variance = (100 - oracle.reputation) / 10;
    score += (Math.random() - 0.5) * variance * 2;

    return Math.floor(Math.max(0, Math.min(100, score)));
  }

  async logConsensusCheck(resolution: DisputeResolution): Promise<void> {
    for (const vote of resolution.votes) {
      const slash = resolution.oracleSlashes.get(vote.oracle.id);
      const reward = resolution.oracleRewards.get(vote.oracle.id);

      if (slash) {
        const deviation = Math.abs(vote.score - resolution.medianScore);
        await log.fail(`${vote.oracle.id}: slashed (${deviation}% deviation)`);
      } else if (reward) {
        await log.ok(`${vote.oracle.id}: rewarded ${reward.toFixed(6)} SOL`);
      }
    }
  }

  getOracle(id: string): Oracle | undefined {
    return this.oracles.get(id);
  }

  getAllOracles(): Oracle[] {
    return Array.from(this.oracles.values());
  }

  getActiveOracles(): Oracle[] {
    return this.getAllOracles().filter(o => o.violations < 3);
  }
}
