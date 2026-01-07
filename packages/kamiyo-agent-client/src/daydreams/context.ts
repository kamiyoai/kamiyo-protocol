/**
 * Kamiyo Payment Context for Daydreams
 *
 * Provides a composable context for managing payment state in Daydreams agents.
 * Follows the Daydreams context pattern with persistent memory and actions.
 *
 * Usage:
 * ```typescript
 * import { createDreams, context } from '@daydreamsai/core';
 * import { kamiyoPaymentContext, consumeAPIAction, fileDisputeAction } from '@kamiyo/agent-client';
 *
 * const agent = createDreams({
 *   model: openai('gpt-4o'),
 *   contexts: [kamiyoPaymentContext],
 * });
 *
 * await agent.send({
 *   context: kamiyoPaymentContext,
 *   input: 'Check the latest DeFi exploits',
 * });
 * ```
 *
 * @see https://docs.dreams.fun/docs/core/concepts/contexts
 */

import {
  KamiyoMemory,
  PaymentRecord,
  DisputeRecord,
  QualityStats,
  PaymentContextInput,
  KamiyoNetwork,
  KAMIYO_NETWORKS,
} from './types';

interface ContextDefinition<T, M> {
  type: string;
  schema?: {
    shape: Record<string, unknown>;
    parse: (input: unknown) => T;
  };
  key?: (input: T) => string;
  create: (input: T) => M;
  render?: (opts: { memory: M; input: T }) => string;
}

function createContextSchema<T>(shape: Record<string, unknown>, validator: (input: unknown) => T) {
  return {
    shape,
    parse: validator,
  };
}

function validatePaymentContextInput(input: unknown): PaymentContextInput {
  const i = input as Record<string, unknown>;
  if (!i.agentId || typeof i.agentId !== 'string') {
    throw new Error('agentId is required');
  }
  return {
    agentId: i.agentId,
    network: (i.network as KamiyoNetwork) || 'devnet',
  };
}

export const kamiyoPaymentContext: ContextDefinition<PaymentContextInput, KamiyoMemory> = {
  type: 'kamiyo-payment',
  schema: createContextSchema(
    {
      agentId: { type: 'string', description: 'Unique agent identifier' },
      network: { type: 'string', enum: ['mainnet', 'devnet', 'localnet'], description: 'Solana network' },
    },
    validatePaymentContextInput
  ),
  key: ({ agentId }) => agentId,
  create: (input): KamiyoMemory => ({
    payments: [],
    disputes: [],
    balance: 0,
    totalSpent: 0,
    totalRefunded: 0,
    qualityStats: {
      totalCalls: 0,
      avgQuality: 0,
      disputeRate: 0,
      successRate: 0,
      byEndpoint: {},
    },
  }),
  render: ({ memory, input }) => {
    const { payments, disputes, balance, totalSpent, qualityStats } = memory;
    const network = KAMIYO_NETWORKS[input.network || 'devnet'];

    return `
Kamiyo Payment Context
━━━━━━━━━━━━━━━━━━━━━━
Agent: ${input.agentId}
Network: ${input.network} (${network.rpcUrl})

Balance: ${balance.toFixed(4)} SOL
Total Spent: ${totalSpent.toFixed(4)} SOL
Total Refunded: ${memory.totalRefunded.toFixed(4)} SOL

Quality Stats:
- Total API Calls: ${qualityStats.totalCalls}
- Average Quality: ${qualityStats.avgQuality.toFixed(1)}%
- Success Rate: ${(qualityStats.successRate * 100).toFixed(1)}%
- Dispute Rate: ${(qualityStats.disputeRate * 100).toFixed(1)}%

Recent Payments (last 5):
${payments.slice(-5).map((p) => `  - ${p.endpoint}: ${p.amount} SOL (Q: ${p.quality}%${p.disputed ? ' DISPUTED' : ''})`).join('\n') || '  None'}

Active Disputes: ${disputes.filter((d) => d.status === 'pending').length}
`.trim();
  },
};

export interface ServiceProviderMemory {
  endpoint: string;
  totalEarned: number;
  totalDisputes: number;
  avgQuality: number;
  activeEscrows: Array<{
    id: string;
    amount: number;
    expiresAt: number;
  }>;
}

interface ServiceProviderInput {
  endpoint: string;
}

export const kamiyoServiceContext: ContextDefinition<ServiceProviderInput, ServiceProviderMemory> = {
  type: 'kamiyo-service',
  schema: createContextSchema(
    {
      endpoint: { type: 'string', description: 'Service endpoint URL' },
    },
    (input: unknown) => {
      const i = input as Record<string, unknown>;
      if (!i.endpoint || typeof i.endpoint !== 'string') {
        throw new Error('endpoint is required');
      }
      return { endpoint: i.endpoint };
    }
  ),
  key: ({ endpoint }) => endpoint,
  create: (input): ServiceProviderMemory => ({
    endpoint: input.endpoint,
    totalEarned: 0,
    totalDisputes: 0,
    avgQuality: 0,
    activeEscrows: [],
  }),
  render: ({ memory }) => `
Service Provider Context
━━━━━━━━━━━━━━━━━━━━━━━━
Endpoint: ${memory.endpoint}
Total Earned: ${memory.totalEarned.toFixed(4)} SOL
Disputes: ${memory.totalDisputes}
Average Quality: ${memory.avgQuality.toFixed(1)}%
Active Escrows: ${memory.activeEscrows.length}
`.trim(),
};

export interface DisputeResolutionMemory {
  activeDisputes: DisputeRecord[];
  resolvedDisputes: DisputeRecord[];
  totalRefundsIssued: number;
  avgResolutionTime: number;
}

interface DisputeContextInput {
  agentId: string;
}

export const kamiyoDisputeContext: ContextDefinition<DisputeContextInput, DisputeResolutionMemory> = {
  type: 'kamiyo-dispute',
  schema: createContextSchema(
    {
      agentId: { type: 'string', description: 'Agent identifier' },
    },
    (input: unknown) => {
      const i = input as Record<string, unknown>;
      if (!i.agentId || typeof i.agentId !== 'string') {
        throw new Error('agentId is required');
      }
      return { agentId: i.agentId };
    }
  ),
  key: ({ agentId }) => `dispute_${agentId}`,
  create: (): DisputeResolutionMemory => ({
    activeDisputes: [],
    resolvedDisputes: [],
    totalRefundsIssued: 0,
    avgResolutionTime: 0,
  }),
  render: ({ memory }) => `
Dispute Resolution Context
━━━━━━━━━━━━━━━━━━━━━━━━━━
Active Disputes: ${memory.activeDisputes.length}
Resolved: ${memory.resolvedDisputes.length}
Total Refunds: ${memory.totalRefundsIssued.toFixed(4)} SOL
Avg Resolution: ${(memory.avgResolutionTime / 3600000).toFixed(1)} hours
`.trim(),
};

export function composeKamiyoContexts(agentId: string, network: KamiyoNetwork = 'devnet') {
  return [
    { context: kamiyoPaymentContext, input: { agentId, network } },
    { context: kamiyoDisputeContext, input: { agentId } },
  ];
}

export type { ContextDefinition };
