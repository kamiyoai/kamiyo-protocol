import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection } from '../utils';
import type { TrustEvidenceType, TrustInteraction } from '../trust/pluginTrust';
import { getTrustEngine } from '../trust/pluginTrust';

const SOLSCAN_TX_RE = /solscan\.io\/tx\/([1-9A-HJ-NP-Za-km-z]{43,88})/i;
const BASE58_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{43,88}$/;

function extractTxSignature(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = trimmed.match(SOLSCAN_TX_RE);
  if (match?.[1] && BASE58_SIG_RE.test(match[1])) return match[1];

  if (BASE58_SIG_RE.test(trimmed)) return trimmed;

  return null;
}

export const recordKamiyoTrustEventAction: Action = {
  name: 'RECORD_KAMIYO_TRUST_EVENT',
  description: 'Sync KAMIYO on-chain events into ElizaOS trust system. Records escrow outcomes, disputes, and reputation changes as TrustEvidence.',
  similes: ['record trust event', 'sync trust data', 'log kamiyo event', 'update trust history'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Sync my KAMIYO trust events' } },
      { user: '{{agent}}', content: { text: 'Synced 4 events: 12 escrows released, 1 disputed. Trust evidence recorded.', action: 'RECORD_KAMIYO_TRUST_EVENT' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Record my on-chain trust data' } },
      { user: '{{agent}}', content: { text: 'Recorded 3 trust events from KAMIYO. Reputation: 85/100.', action: 'RECORD_KAMIYO_TRUST_EVENT' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Record trust evidence from https://solscan.io/tx/<signature>' } },
      { user: '{{agent}}', content: { text: 'Recorded 1 trust interaction from that transaction.', action: 'RECORD_KAMIYO_TRUST_EVENT' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text || '';
    if (extractTxSignature(text)) return true;
    const lower = text.toLowerCase();
    return (
      (lower.includes('sync') && lower.includes('trust')) ||
      (lower.includes('record') && lower.includes('trust')) ||
      (lower.includes('log') && lower.includes('kamiyo')) ||
      lower.includes('trust event')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; eventsRecorded: number; pushedToTrustEngine: boolean; error?: string }> {
    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, eventsRecorded: 0, pushedToTrustEngine: false, error: 'Wallet not configured' };
    }

    const sourceEntityId = keypair.publicKey.toBase58();
    const txSignature = extractTxSignature(message.content.text || '');

    // Try to use evidence bridge service first (from @kamiyo/eliza-trust-provider)
    try {
      const bridge = (runtime as any).getService?.('kamiyo-trust-evidence-bridge');
      if (txSignature && bridge && typeof bridge.recordFromTransaction === 'function') {
        const records = await bridge.recordFromTransaction(txSignature, sourceEntityId);
        if (records.length > 0) {
          callback?.({
            text: `Recorded ${records.length} trust interaction${records.length === 1 ? '' : 's'} from that transaction.`,
            content: { eventsRecorded: records.length, records },
          });
          return { success: true, eventsRecorded: records.length, pushedToTrustEngine: bridge.hasTrustEngine || false };
        }

        callback?.({ text: 'No relevant KAMIYO instructions found in that transaction.' });
        return { success: true, eventsRecorded: 0, pushedToTrustEngine: bridge.hasTrustEngine || false };
      }

      if (bridge && typeof bridge.syncOnChainEvidence === 'function') {
        const records = await bridge.syncOnChainEvidence();
        callback?.({
          text: `Synced ${records.length} KAMIYO trust events via evidence bridge.`,
          content: { eventsRecorded: records.length, records },
        });
        return { success: true, eventsRecorded: records.length, pushedToTrustEngine: bridge.hasTrustEngine || false };
      }
    } catch {
      // Bridge not available, fall through to manual sync
    }

    // Manual sync: fetch on-chain state and record evidence directly
    try {
      const { rpcUrl, programId } = getNetworkConfig(runtime);
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const client = new KamiyoClient({
        connection,
        wallet: new Wallet(keypair),
        programId: new PublicKey(programId),
      });

      const [agentPda] = client.getAgentPDA(keypair.publicKey);
      const agent = await client.getAgent(agentPda);
      if (!agent) {
        callback?.({ text: 'No KAMIYO agent profile found.' });
        return { success: false, eventsRecorded: 0, pushedToTrustEngine: false, error: 'No agent profile' };
      }

      // Build evidence from aggregate on-chain stats
      const total = agent.totalEscrows?.toNumber() || 0;
      const successful = agent.successfulEscrows?.toNumber() || 0;
      const disputed = agent.disputedEscrows?.toNumber() || 0;
      const reputation = agent.reputation?.toNumber() || 0;
      const weight = parseFloat(runtime.getSetting('KAMIYO_TRUST_EVIDENCE_WEIGHT') || '1.0');

      const [repPda] = client.getReputationPDA(keypair.publicKey);
      const rep = await client.getReputation(repPda).catch(() => null);
      const disputesWon = rep?.disputesWon?.toNumber() || 0;
      const disputesLost = rep?.disputesLost?.toNumber() || 0;

      const evidenceRecords: TrustInteraction[] = [];
      const targetEntityId = runtime.agentId;

      // Registration evidence
      evidenceRecords.push(makeInteraction({
        sourceEntityId,
        targetEntityId,
        type: 'VERIFIED_IDENTITY',
        impact: clampImpact(8 * weight),
        description: 'Agent registered on KAMIYO with on-chain identity',
        metadata: { source: 'kamiyo-on-chain', reputation },
        context: { evaluatorId: runtime.agentId, source: 'kamiyo-on-chain', action: recordKamiyoTrustEventAction.name, roomId: message.roomId },
      }));

      // Escrow success evidence
      if (successful > 0) {
        const scaled = clampImpact(15 * weight * Math.min(successful, 10));
        evidenceRecords.push(makeInteraction({
          sourceEntityId,
          targetEntityId,
          type: 'PROMISE_KEPT',
          impact: scaled,
          description: `${successful} escrows released successfully`,
          metadata: { source: 'kamiyo-on-chain', count: successful, total },
          context: { evaluatorId: runtime.agentId, source: 'kamiyo-on-chain', action: recordKamiyoTrustEventAction.name, roomId: message.roomId },
        }));
      }

      // Dispute evidence
      if (disputed > 0) {
        const scaled = clampImpact(-10 * weight * Math.min(disputed, 5));
        evidenceRecords.push(makeInteraction({
          sourceEntityId,
          targetEntityId,
          type: 'PROMISE_BROKEN',
          impact: scaled,
          description: `${disputed} escrows disputed`,
          metadata: { source: 'kamiyo-on-chain', count: disputed, total },
          context: { evaluatorId: runtime.agentId, source: 'kamiyo-on-chain', action: recordKamiyoTrustEventAction.name, roomId: message.roomId },
        }));
      }

      if (disputesWon > 0) {
        const scaled = clampImpact(10 * weight * Math.min(disputesWon, 5));
        evidenceRecords.push(makeInteraction({
          sourceEntityId,
          targetEntityId,
          type: 'CONSISTENT_BEHAVIOR',
          impact: scaled,
          description: `${disputesWon} disputes resolved in favor`,
          metadata: { source: 'kamiyo-on-chain', count: disputesWon },
          context: { evaluatorId: runtime.agentId, source: 'kamiyo-on-chain', action: recordKamiyoTrustEventAction.name, roomId: message.roomId },
        }));
      }

      if (disputesLost > 0) {
        const scaled = clampImpact(-15 * weight * Math.min(disputesLost, 5));
        evidenceRecords.push(makeInteraction({
          sourceEntityId,
          targetEntityId,
          type: 'INCONSISTENT_BEHAVIOR',
          impact: scaled,
          description: `${disputesLost} disputes lost`,
          metadata: { source: 'kamiyo-on-chain', count: disputesLost },
          context: { evaluatorId: runtime.agentId, source: 'kamiyo-on-chain', action: recordKamiyoTrustEventAction.name, roomId: message.roomId },
        }));
      }

      // Push to TrustEngine if available
      let pushedToTrustEngine = false;
      const engine = getTrustEngine(runtime);
      if (engine?.recordInteraction) {
        for (const record of evidenceRecords) {
          await engine.recordInteraction(record);
        }
        pushedToTrustEngine = true;
      }

      // Store in runtime state
      await appendStateItems(runtime, 'kamiyoTrustEvidence', evidenceRecords, 200);

      callback?.({
        text: `Synced ${evidenceRecords.length} KAMIYO trust events. Escrows: ${total} total, ${successful} released, ${disputed} disputed. Reputation: ${reputation}/100.${pushedToTrustEngine ? ' Pushed to TrustEngine.' : ''}`,
        content: { eventsRecorded: evidenceRecords.length, pushedToTrustEngine, reputation },
      });

      return { success: true, eventsRecorded: evidenceRecords.length, pushedToTrustEngine };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Trust sync failed: ${error}` });
      return { success: false, eventsRecorded: 0, pushedToTrustEngine: false, error };
    }
  },
};

function makeInteraction(args: {
  sourceEntityId: string;
  targetEntityId: string;
  type: TrustEvidenceType;
  impact: number;
  description: string;
  metadata?: Record<string, unknown>;
  context: { evaluatorId: string; roomId?: string; [key: string]: unknown };
}): TrustInteraction {
  return {
    sourceEntityId: args.sourceEntityId,
    targetEntityId: args.targetEntityId,
    type: args.type,
    timestamp: Date.now(),
    impact: Math.round(args.impact),
    details: { description: args.description, metadata: args.metadata },
    context: args.context,
  };
}

function clampImpact(value: number): number {
  if (value > 100) return 100;
  if (value < -100) return -100;
  return value;
}

async function appendStateItems(runtime: IAgentRuntime, key: string, items: unknown[], max: number): Promise<void> {
  const existing = ((await runtime.getState?.(key)) as unknown[] | undefined) || [];
  const combined = [...existing, ...items];
  await runtime.setState?.(key, combined.slice(Math.max(0, combined.length - max)));
}
