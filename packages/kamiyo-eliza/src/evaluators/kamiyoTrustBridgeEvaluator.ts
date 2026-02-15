import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Evaluator, IAgentRuntime, Memory, State } from '../types';
import { getNetworkConfig, getKeypair, createConnection } from '../utils';

/**
 * Maps KAMIYO on-chain events to plugin-trust TrustEvidence types.
 * Duplicated subset from @kamiyo/eliza-trust-provider to avoid hard dep.
 */
const EVIDENCE_MAP: Record<string, { type: string; impact: number; description: string }> = {
  escrow_released: { type: 'promise_kept',        impact: 15,  description: 'Escrow released — delivery honored' },
  escrow_disputed: { type: 'promise_broken',      impact: -10, description: 'Escrow disputed — delivery contested' },
  dispute_won:     { type: 'consistent_behavior', impact: 10,  description: 'Dispute resolved in favor' },
  dispute_lost:    { type: 'inconsistency',       impact: -15, description: 'Dispute lost — invalid claim' },
  agent_slashed:   { type: 'harmful_action',      impact: -20, description: 'Agent slashed for violation' },
};

/** Minimal TrustEngine interface we call */
interface TrustEngineService {
  recordInteraction(evidence: {
    sourceEntityId: string;
    targetEntityId: string;
    type: string;
    impact: number;
    weight?: number;
    description?: string;
    verified?: boolean;
    context?: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Evaluator that auto-records KAMIYO on-chain outcomes as TrustEvidence
 * when escrow/dispute messages are detected.
 *
 * Triggers after escrow releases, disputes, and resolutions.
 * Pushes evidence to plugin-trust's TrustEngine if available,
 * otherwise stores in runtime state for other consumers.
 */
export const kamiyoTrustBridgeEvaluator: Evaluator = {
  name: 'KAMIYO_TRUST_BRIDGE',
  description: 'Auto-records KAMIYO escrow/dispute outcomes as plugin-trust TrustEvidence.',
  similes: ['trust bridge', 'escrow outcome', 'trust sync'],
  examples: [
    {
      context: 'Escrow just released successfully',
      messages: [{ user: 'agent', content: { text: 'Escrow created: 0.5 SOL locked for provider', action: 'CREATE_KAMIYO_ESCROW' } }],
      outcome: 'EVIDENCE_RECORDED',
    },
    {
      context: 'Dispute filed after quality failure',
      messages: [{ user: 'agent', content: { text: 'Dispute filed for escrow tx_abc123', action: 'FILE_KAMIYO_DISPUTE' } }],
      outcome: 'NEGATIVE_EVIDENCE_RECORDED',
    },
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const action = message.content.action as string | undefined;
    if (!action) return false;

    // Trigger on KAMIYO escrow/dispute action completions
    return [
      'CREATE_KAMIYO_ESCROW',
      'RELEASE_KAMIYO_ESCROW',
      'FILE_KAMIYO_DISPUTE',
      'CREATE_TRUSTED_ESCROW',
    ].includes(action);
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<{ evidenceRecorded: boolean; event?: string; impact?: number }> {
    const action = message.content.action as string;
    const content = message.content;

    // Determine event type from action
    let eventType: string | null = null;
    let targetEntityId = (content.provider as string) || message.userId;

    switch (action) {
      case 'RELEASE_KAMIYO_ESCROW':
        eventType = 'escrow_released';
        break;
      case 'FILE_KAMIYO_DISPUTE':
        eventType = 'escrow_disputed';
        break;
      case 'CREATE_KAMIYO_ESCROW':
      case 'CREATE_TRUSTED_ESCROW':
        // Escrow creation isn't an outcome yet — skip evidence
        // but store the pending escrow for future tracking
        await storeEscrowTracking(runtime, content);
        return { evidenceRecorded: false };
      default:
        return { evidenceRecorded: false };
    }

    const mapping = EVIDENCE_MAP[eventType];
    if (!mapping) return { evidenceRecorded: false };

    const weight = parseFloat(runtime.getSetting('KAMIYO_TRUST_EVIDENCE_WEIGHT') || '1.0');
    const evidence = {
      sourceEntityId: runtime.agentId,
      targetEntityId,
      type: mapping.type,
      impact: Math.round(mapping.impact * weight),
      weight: 1,
      description: mapping.description,
      verified: true,
      context: {
        source: 'kamiyo-on-chain',
        action,
        transactionId: content.transactionId as string,
        amount: content.amount,
      },
    };

    // Try to push to plugin-trust's TrustEngine
    let pushed = false;
    try {
      const engine = (runtime as any).getService?.('trust-engine') as TrustEngineService | undefined;
      if (engine && typeof engine.recordInteraction === 'function') {
        await engine.recordInteraction(evidence);
        pushed = true;
      }
    } catch {
      // plugin-trust not available
    }

    // Always store in runtime state for other consumers
    const events = ((await runtime.getState?.('kamiyoTrustEvidence')) as unknown[] | undefined) || [];
    await runtime.setState?.('kamiyoTrustEvidence', [...events, { ...evidence, pushedToTrustEngine: pushed, timestamp: Date.now() }]);

    return { evidenceRecorded: true, event: eventType, impact: evidence.impact };
  },
};

async function storeEscrowTracking(runtime: IAgentRuntime, content: Record<string, unknown>) {
  const pending = ((await runtime.getState?.('kamiyoPendingEscrows')) as unknown[] | undefined) || [];
  await runtime.setState?.('kamiyoPendingEscrows', [
    ...pending,
    {
      transactionId: content.transactionId,
      provider: content.provider,
      amount: content.amount,
      createdAt: Date.now(),
    },
  ]);
}
