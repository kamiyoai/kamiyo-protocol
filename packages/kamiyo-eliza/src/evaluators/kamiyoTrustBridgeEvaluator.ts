import type { Evaluator, IAgentRuntime, Memory, State } from '../types';
import type { TrustEvidenceType, TrustInteraction } from '../trust/pluginTrust';
import { getTrustEngine } from '../trust/pluginTrust';

/**
 * Maps KAMIYO on-chain events to plugin-trust TrustEvidence types.
 * Duplicated subset from @kamiyo/eliza-trust-provider to avoid hard dep.
 */
const EVIDENCE_MAP: Record<string, { type: TrustEvidenceType; impact: number; description: string }> = {
  escrow_released: { type: 'PROMISE_KEPT',        impact: 15,  description: 'Escrow released — delivery honored' },
  dispute_won:     { type: 'CONSISTENT_BEHAVIOR', impact: 10,  description: 'Dispute resolved in favor' },
  dispute_lost:    { type: 'INCONSISTENT_BEHAVIOR', impact: -15, description: 'Dispute lost — invalid claim' },
  agent_slashed:   { type: 'HARMFUL_ACTION',      impact: -20, description: 'Agent slashed for violation' },
};

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
    const counterparty = (content.provider as string | undefined) || (message.userId as string);
    const sourceEntityId = counterparty;
    const targetEntityId = runtime.agentId;

    switch (action) {
      case 'RELEASE_KAMIYO_ESCROW':
        eventType = 'escrow_released';
        break;
      case 'FILE_KAMIYO_DISPUTE':
        // Dispute filing isn't an outcome; don't penalize until the result is known.
        await storeDisputeTracking(runtime, content);
        return { evidenceRecorded: false };
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
    const transactionId = content.transactionId as string | undefined;
    const evidence: TrustInteraction = {
      sourceEntityId,
      targetEntityId,
      type: mapping.type,
      timestamp: Date.now(),
      impact: Math.round(clampImpact(mapping.impact * weight)),
      details: {
        description: mapping.description,
        metadata: {
          source: 'kamiyo-on-chain',
          action,
          transactionId,
          amount: content.amount,
        },
      },
      context: {
        evaluatorId: runtime.agentId,
        source: 'kamiyo-on-chain',
        action,
        roomId: message.roomId,
      },
    };

    // Try to push to plugin-trust's TrustEngine
    let pushed = false;
    const engine = getTrustEngine(runtime);
    if (engine?.recordInteraction) {
      await engine.recordInteraction(evidence);
      pushed = true;
    }

    // Always store in runtime state for other consumers
    await appendStateItem(runtime, 'kamiyoTrustEvidence', {
      ...evidence,
      pushedToTrustEngine: pushed,
    }, 200, item => {
      const meta = (item as any)?.details?.metadata;
      const tx = typeof meta?.transactionId === 'string' ? meta.transactionId : undefined;
      const type = (item as any)?.type;
      return tx && transactionId && typeof type === 'string' ? `${type}:${tx}` : null;
    });

    return { evidenceRecorded: true, event: eventType, impact: evidence.impact };
  },
};

async function storeEscrowTracking(runtime: IAgentRuntime, content: Record<string, unknown>) {
  await appendStateItem(runtime, 'kamiyoPendingEscrows', {
    transactionId: content.transactionId,
    provider: content.provider,
    amount: content.amount,
    createdAt: Date.now(),
  }, 200, item => {
    const tx = (item as any)?.transactionId;
    return typeof tx === 'string' ? tx : null;
  });
}

async function storeDisputeTracking(runtime: IAgentRuntime, content: Record<string, unknown>) {
  await appendStateItem(runtime, 'kamiyoPendingDisputes', {
    transactionId: content.transactionId,
    provider: content.provider,
    createdAt: Date.now(),
  }, 200, item => {
    const tx = (item as any)?.transactionId;
    return typeof tx === 'string' ? tx : null;
  });
}

function clampImpact(value: number): number {
  if (value > 100) return 100;
  if (value < -100) return -100;
  return value;
}

async function appendStateItem(
  runtime: IAgentRuntime,
  key: string,
  item: unknown,
  max: number,
  dedupeKey?: (item: unknown) => string | null
): Promise<void> {
  const existing = ((await runtime.getState?.(key)) as unknown[] | undefined) || [];
  const next = [...existing];

  if (dedupeKey) {
    const id = dedupeKey(item);
    if (id) {
      for (let i = next.length - 1; i >= Math.max(0, next.length - 50); i--) {
        const otherId = dedupeKey(next[i]);
        if (otherId === id) return;
      }
    }
  }

  next.push(item);
  await runtime.setState?.(key, next.slice(Math.max(0, next.length - max)));
}
