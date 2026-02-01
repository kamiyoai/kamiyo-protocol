import type { AgentInfo } from './types.js';
import {
  calculateReputationPrice,
  getTierForThreshold,
  DEFAULT_TIERS,
  type ReputationTier,
  type X402KamiyoClient,
  CreditTracker,
  DynamicCreditTracker,
} from '@kamiyo/x402-client';

export { DEFAULT_TIERS, getTierForThreshold, calculateReputationPrice };
export type { ReputationTier };

export interface PriceResult {
  price: number;
  discount: number;
  tier: ReputationTier;
}

export interface X402AdapterConfig {
  tiers?: ReputationTier[];
  creditTracker?: CreditTracker | DynamicCreditTracker;
}

export class X402HiveAdapter {
  private client?: X402KamiyoClient;
  private tiers: ReputationTier[];
  private creditTracker?: CreditTracker | DynamicCreditTracker;
  private hireTransactions = new Map<string, {
    agentId: string;
    amount: number;
    escrowPda?: string;
    createdAt: number;
  }>();

  constructor(client?: X402KamiyoClient, config?: X402AdapterConfig) {
    this.client = client;
    this.tiers = config?.tiers ?? DEFAULT_TIERS;
    this.creditTracker = config?.creditTracker;
  }

  calculateAgentPrice(basePrice: number, reputation: number): PriceResult {
    return calculateReputationPrice(basePrice, reputation, this.tiers);
  }

  async payForHire(
    agent: AgentInfo,
    amount: number,
    hireId: string
  ): Promise<{
    success: boolean;
    transactionId?: string;
    escrowPda?: string;
    error?: string;
  }> {
    if (!this.client) {
      return { success: false, error: 'X402 client not configured' };
    }

    if (this.hireTransactions.has(hireId)) {
      return { success: false, error: 'Hire ID already exists' };
    }

    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    try {
      const { PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      const providerPk = new PublicKey(agent.address);
      const amountLamports = Math.ceil(amount * LAMPORTS_PER_SOL);

      const result = await this.client.createEscrow(
        providerPk,
        amountLamports,
        hireId
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error?.message ?? 'Escrow creation failed',
        };
      }

      this.hireTransactions.set(hireId, {
        agentId: agent.id,
        amount,
        escrowPda: result.escrowPda?.toBase58(),
        createdAt: Date.now(),
      });

      return {
        success: true,
        transactionId: result.transactionId,
        escrowPda: result.escrowPda?.toBase58(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Payment failed',
      };
    }
  }

  async recordOutcome(
    hireId: string,
    outcome: 'released' | 'disputed',
    quality: number
  ): Promise<{ success: boolean; error?: string }> {
    const hire = this.hireTransactions.get(hireId);
    if (!hire) {
      return { success: false, error: 'Hire not found' };
    }

    if (quality < 0 || quality > 100) {
      return { success: false, error: 'Quality must be 0-100' };
    }

    if (this.client) {
      try {
        if (outcome === 'released') {
          await this.client.releaseEscrow(hireId);
        } else {
          await this.client.disputeEscrow(hireId);
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Escrow update failed',
        };
      }
    }

    if (this.creditTracker) {
      try {
        if (this.creditTracker instanceof DynamicCreditTracker) {
          const escrowOutcome = outcome === 'released' ? 'released' : 'dispute_lost';
          await this.creditTracker.recordEscrowOutcome(
            hire.agentId,
            escrowOutcome,
            quality
          );
        } else {
          if (outcome === 'released' && quality >= 70) {
            await this.creditTracker.repayCredit(hire.agentId, hire.amount);
          }
        }
      } catch {
        // Credit tracking is best-effort
      }
    }

    this.hireTransactions.delete(hireId);

    return { success: true };
  }

  getHireTransaction(hireId: string) {
    return this.hireTransactions.get(hireId);
  }

  getActiveHires(): string[] {
    return Array.from(this.hireTransactions.keys());
  }

  setClient(client: X402KamiyoClient): void {
    this.client = client;
  }

  setCreditTracker(tracker: CreditTracker | DynamicCreditTracker): void {
    this.creditTracker = tracker;
  }
}

export function createX402Adapter(
  client?: X402KamiyoClient,
  config?: X402AdapterConfig
): X402HiveAdapter {
  return new X402HiveAdapter(client, config);
}
