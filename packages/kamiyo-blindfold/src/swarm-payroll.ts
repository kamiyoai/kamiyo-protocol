import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { BlindfoldClient } from './client';
import {
  SwarmConfig,
  SwarmMember,
  SwarmDistribution,
  SwarmPayoutResult,
  CardTier,
  CARD_TIERS,
  NATIVE_SOL_MINT,
} from './types';

export interface SwarmPayrollConfig {
  connection: Connection;
  blindfoldBaseUrl?: string;
}

// Manages swarm registration and payroll distribution
export class SwarmPayroll {
  private connection: Connection;
  private blindfold: BlindfoldClient;
  private swarms: Map<string, SwarmConfig> = new Map();

  constructor(config: SwarmPayrollConfig) {
    this.connection = config.connection;
    this.blindfold = new BlindfoldClient({ baseUrl: config.blindfoldBaseUrl });
  }

  // Register a new swarm with members and weights
  registerSwarm(
    swarmId: string,
    name: string,
    members: Array<{ agentPk: PublicKey | string; email: string; weight: number; tier?: CardTier }>
  ): SwarmConfig {
    const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error(`Weights must sum to 100, got ${totalWeight}`);
    }

    const swarmMembers: SwarmMember[] = members.map((m) => ({
      agentPk: typeof m.agentPk === 'string' ? new PublicKey(m.agentPk) : m.agentPk,
      email: m.email,
      weight: m.weight,
      tier: m.tier,
    }));

    const config: SwarmConfig = {
      swarmId,
      name,
      members: swarmMembers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.swarms.set(swarmId, config);
    return config;
  }

  // Get swarm config
  getSwarm(swarmId: string): SwarmConfig | undefined {
    return this.swarms.get(swarmId);
  }

  // Update member weights
  updateWeights(
    swarmId: string,
    newWeights: Array<{ agentPk: string; weight: number }>
  ): SwarmConfig {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const totalWeight = newWeights.reduce((sum, w) => sum + w.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error(`Weights must sum to 100, got ${totalWeight}`);
    }

    for (const update of newWeights) {
      const member = swarm.members.find((m) => m.agentPk.toBase58() === update.agentPk);
      if (member) {
        member.weight = update.weight;
      }
    }

    swarm.updatedAt = Date.now();
    return swarm;
  }

  // Calculate distribution for a given amount
  calculateDistribution(swarmId: string, totalAmount: bigint): SwarmDistribution[] {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    return swarm.members.map((member) => ({
      member,
      amount: (totalAmount * BigInt(Math.floor(member.weight * 100))) / 10000n,
      percentage: member.weight,
    }));
  }

  // Distribute funds to all swarm members' Blindfold cards
  async distribute(
    swarmId: string,
    totalAmount: BN,
    payer: Keypair,
    tokenMint: PublicKey = NATIVE_SOL_MINT
  ): Promise<SwarmPayoutResult> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const distributions = this.calculateDistribution(swarmId, BigInt(totalAmount.toString()));
    const results: SwarmPayoutResult['distributions'] = [];

    // Process each member's payment
    for (const dist of distributions) {
      if (dist.amount === 0n) continue;

      const amountSol = Number(dist.amount) / LAMPORTS_PER_SOL;
      const tier = dist.member.tier || this.getTierForAmount(amountSol);

      // Create payment on Blindfold
      const payment = await this.blindfold.createPayment({
        amount: amountSol,
        currency: 'SOL',
        recipientEmail: dist.member.email,
        useZkProof: true,
        agentPk: dist.member.agentPk.toBase58(),
        requestedTier: tier,
      });

      // Create holding wallet
      const holding = await this.blindfold.createHoldingWallet(
        payment.paymentId,
        dist.amount.toString(),
        tokenMint.toBase58()
      );

      // Transfer to holding wallet
      const holdingWalletPk = new PublicKey(holding.holdingWalletAddress);
      const transferSig = await this.transferSOL(
        payer,
        holdingWalletPk,
        new BN(dist.amount.toString())
      );

      results.push({
        agentPk: dist.member.agentPk.toBase58(),
        email: dist.member.email,
        amount: dist.amount,
        paymentId: payment.paymentId,
        holdingWallet: holding.holdingWalletAddress,
        transferSignature: transferSig,
        tier,
      });
    }

    return {
      swarmId,
      totalAmount: BigInt(totalAmount.toString()),
      distributions: results,
      timestamp: Date.now(),
    };
  }

  // Batch distribute via Blindfold batch endpoint
  async distributeBatch(
    swarmId: string,
    totalAmount: BN,
    payer: Keypair,
    tokenMint: PublicKey = NATIVE_SOL_MINT
  ): Promise<SwarmPayoutResult> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const distributions = this.calculateDistribution(swarmId, BigInt(totalAmount.toString()));

    const batchPayments = distributions
      .filter((d) => d.amount > 0n)
      .map((dist) => ({
        amount: Number(dist.amount) / LAMPORTS_PER_SOL,
        currency: 'SOL' as const,
        recipientEmail: dist.member.email,
        agentPk: dist.member.agentPk.toBase58(),
        requestedTier: dist.member.tier || this.getTierForAmount(Number(dist.amount) / LAMPORTS_PER_SOL),
      }));

    const batchResponse = await this.blindfold.createBatchPayment({
      payments: batchPayments,
      swarmId,
    });

    const results: SwarmPayoutResult['distributions'] = [];

    for (const payment of batchResponse.payments) {
      if (payment.status === 'failed') continue;

      const dist = distributions.find(
        (d) => d.member.email === payment.recipientEmail
      );
      if (!dist) continue;

      // Create holding wallet and transfer for each successful payment
      const holding = await this.blindfold.createHoldingWallet(
        payment.paymentId,
        dist.amount.toString(),
        tokenMint.toBase58()
      );

      const holdingWalletPk = new PublicKey(holding.holdingWalletAddress);
      const transferSig = await this.transferSOL(
        payer,
        holdingWalletPk,
        new BN(dist.amount.toString())
      );

      results.push({
        agentPk: dist.member.agentPk.toBase58(),
        email: dist.member.email,
        amount: dist.amount,
        paymentId: payment.paymentId,
        holdingWallet: holding.holdingWalletAddress,
        transferSignature: transferSig,
        tier: dist.member.tier || this.getTierForAmount(Number(dist.amount) / LAMPORTS_PER_SOL),
      });
    }

    return {
      swarmId,
      totalAmount: BigInt(totalAmount.toString()),
      distributions: results,
      timestamp: Date.now(),
    };
  }

  // Get appropriate tier based on amount
  private getTierForAmount(amountUsd: number): CardTier {
    for (let i = CARD_TIERS.length - 1; i >= 0; i--) {
      if (amountUsd <= CARD_TIERS[i].limit) {
        return CARD_TIERS[i].tier;
      }
    }
    return 'elite';
  }

  // Transfer SOL to holding wallet
  private async transferSOL(
    payer: Keypair,
    destination: PublicKey,
    amount: BN
  ): Promise<string> {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: destination,
        lamports: amount.toNumber(),
      })
    );
    return sendAndConfirmTransaction(this.connection, tx, [payer]);
  }

  // Add a member to existing swarm
  addMember(
    swarmId: string,
    member: { agentPk: PublicKey | string; email: string; weight: number; tier?: CardTier }
  ): SwarmConfig {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    swarm.members.push({
      agentPk: typeof member.agentPk === 'string' ? new PublicKey(member.agentPk) : member.agentPk,
      email: member.email,
      weight: member.weight,
      tier: member.tier,
    });

    swarm.updatedAt = Date.now();
    return swarm;
  }

  // Remove a member from swarm
  removeMember(swarmId: string, agentPk: string): SwarmConfig {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    swarm.members = swarm.members.filter((m) => m.agentPk.toBase58() !== agentPk);
    swarm.updatedAt = Date.now();
    return swarm;
  }

  // Validate swarm weights sum to 100
  validateWeights(swarmId: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const total = swarm.members.reduce((sum, m) => sum + m.weight, 0);
    return Math.abs(total - 100) < 0.01;
  }

  // Export swarm config for persistence
  exportSwarm(swarmId: string): string {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    return JSON.stringify({
      ...swarm,
      members: swarm.members.map((m) => ({
        ...m,
        agentPk: m.agentPk.toBase58(),
      })),
    });
  }

  // Import swarm config
  importSwarm(configJson: string): SwarmConfig {
    const parsed = JSON.parse(configJson);
    const config: SwarmConfig = {
      ...parsed,
      members: parsed.members.map((m: { agentPk: string; email: string; weight: number; tier?: CardTier }) => ({
        ...m,
        agentPk: new PublicKey(m.agentPk),
      })),
    };

    this.swarms.set(config.swarmId, config);
    return config;
  }
}

// Helper to create equal-weight swarm
export function createEqualWeightSwarm(
  swarmId: string,
  name: string,
  members: Array<{ agentPk: PublicKey | string; email: string; tier?: CardTier }>
): Array<{ agentPk: PublicKey | string; email: string; weight: number; tier?: CardTier }> {
  const weight = 100 / members.length;
  return members.map((m) => ({ ...m, weight }));
}

// Helper to create performance-weighted distribution
export function createPerformanceWeights(
  contributions: Array<{ agentPk: string; score: number }>
): Array<{ agentPk: string; weight: number }> {
  const totalScore = contributions.reduce((sum, c) => sum + c.score, 0);
  if (totalScore === 0) {
    return contributions.map((c) => ({ agentPk: c.agentPk, weight: 100 / contributions.length }));
  }

  return contributions.map((c) => ({
    agentPk: c.agentPk,
    weight: (c.score / totalScore) * 100,
  }));
}
