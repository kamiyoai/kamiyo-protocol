import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import { KamiyoClient } from '@kamiyo/sdk';
import { Agent, Escrow, SLAParams, DeliveryResult, QualityAssessment, EscrowStatus } from './types';
import { PROGRAM_ID, DEFAULTS } from './config';
import { log } from './logger';

type Scenario = 'good' | 'degraded' | 'poor';

const DELIVERY_PROFILES: Record<Scenario, { quality: number; latency: number; availability: number }> = {
  good: { quality: 92, latency: 150, availability: 99 },
  degraded: { quality: 65, latency: 450, availability: 91 },
  poor: { quality: 40, latency: 800, availability: 75 },
};

export class EscrowManager {
  private escrows: Map<string, Escrow> = new Map();
  private client: KamiyoClient | null = null;

  constructor(connection?: Connection, wallet?: Wallet) {
    if (connection && wallet) {
      this.client = new KamiyoClient({ connection, wallet, programId: PROGRAM_ID });
    }
  }

  async createEscrow(consumer: Agent, provider: Agent, amount: number, sla: SLAParams): Promise<Escrow> {
    const id = `esc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    const escrow: Escrow = {
      id,
      consumer,
      provider,
      amount,
      sla,
      status: 'active',
      createdAt: now,
      expiresAt: now + DEFAULTS.escrow.timeLockSeconds * 1000,
    };

    if (this.client) {
      try {
        await this.client.createAgreement({
          provider: provider.keypair.publicKey,
          amount: new BN(Math.floor(amount * LAMPORTS_PER_SOL)),
          timeLockSeconds: new BN(DEFAULTS.escrow.timeLockSeconds),
          transactionId: id,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await log.warn(`on-chain escrow creation failed: ${msg.slice(0, 50)}`);
      }
    }

    this.escrows.set(id, escrow);

    await log.ok(`${id.slice(0, 16)}... | ${amount.toFixed(4)} SOL | ${provider.name}`);
    await log.dim(`  SLA: quality >= ${sla.quality}% | latency <= ${sla.latency}ms | uptime >= ${sla.availability}%`);

    return escrow;
  }

  simulateDelivery(escrow: Escrow, scenario: Scenario): DeliveryResult {
    const base = DELIVERY_PROFILES[scenario];
    const jitter = () => (Math.random() - 0.5) * 10;

    return {
      quality: Math.floor(base.quality + jitter()),
      latency: Math.floor(base.latency + jitter() * 20),
      availability: Math.floor(base.availability + jitter() / 2),
      timestamp: Date.now(),
    };
  }

  assessQuality(escrow: Escrow, delivery: DeliveryResult): QualityAssessment {
    const violations: string[] = [];
    let score = delivery.quality;

    if (delivery.latency > escrow.sla.latency) {
      const excess = delivery.latency - escrow.sla.latency;
      const penalty = Math.min(20, Math.floor(excess / 50));
      score -= penalty;
      violations.push(`latency ${delivery.latency}ms > ${escrow.sla.latency}ms (-${penalty})`);
    }

    if (delivery.availability < escrow.sla.availability) {
      const deficit = escrow.sla.availability - delivery.availability;
      const penalty = Math.floor(deficit / 2);
      score -= penalty;
      violations.push(`uptime ${delivery.availability}% < ${escrow.sla.availability}% (-${penalty})`);
    }

    const adjustedScore = Math.max(0, Math.min(100, score));
    const passed = adjustedScore >= escrow.sla.quality;

    return {
      rawScore: delivery.quality,
      adjustedScore,
      violations,
      passed,
    };
  }

  async processDelivery(escrow: Escrow, scenario: Scenario): Promise<QualityAssessment> {
    await log.step(`${escrow.provider.name} delivering work`);

    const delivery = this.simulateDelivery(escrow, scenario);
    escrow.delivery = delivery;

    await log.ok(`quality: ${delivery.quality}% | latency: ${delivery.latency}ms | uptime: ${delivery.availability}%`);

    const assessment = this.assessQuality(escrow, delivery);
    escrow.assessment = assessment;

    if (assessment.violations.length > 0) {
      for (const v of assessment.violations) {
        await log.warn(`penalty: ${v}`);
      }
    }

    await log.dim(`adjusted score: ${assessment.adjustedScore}% (threshold: ${escrow.sla.quality}%)`);

    if (assessment.passed) {
      escrow.status = 'released';
      await log.ok(`\x1b[32mPASS\x1b[0m - releasing funds`);
    } else {
      escrow.status = 'disputed';
      await log.warn(`\x1b[33mSLA BREACH\x1b[0m - initiating dispute`);
    }

    return assessment;
  }

  async releaseEscrow(escrow: Escrow): Promise<void> {
    if (this.client) {
      try {
        await this.client.releaseFunds(escrow.id, escrow.provider.keypair.publicKey);
      } catch {}
    }
    escrow.status = 'released';
  }

  async disputeEscrow(escrow: Escrow): Promise<void> {
    if (this.client) {
      try {
        await this.client.markDisputed(escrow.id);
      } catch {}
    }
    escrow.status = 'disputed';
  }

  resolveEscrow(escrow: Escrow): void {
    escrow.status = 'resolved';
  }

  updateStatus(escrow: Escrow, status: EscrowStatus): void {
    escrow.status = status;
  }

  getEscrow(id: string): Escrow | undefined {
    return this.escrows.get(id);
  }

  getAllEscrows(): Escrow[] {
    return Array.from(this.escrows.values());
  }

  getByStatus(status: EscrowStatus): Escrow[] {
    return this.getAllEscrows().filter(e => e.status === status);
  }

  getDisputedEscrows(): Escrow[] {
    return this.getByStatus('disputed');
  }
}
