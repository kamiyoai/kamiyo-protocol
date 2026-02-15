import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection } from '../utils';

/** Minimal TrustEngine interface */
interface TrustEngineService {
  recordInteraction(evidence: Record<string, unknown>): Promise<void>;
}

const EVIDENCE_MAP: Record<string, { type: string; impact: number; description: string }> = {
  escrow_released: { type: 'promise_kept',        impact: 15,  description: 'Escrow released — delivery honored' },
  escrow_disputed: { type: 'promise_broken',      impact: -10, description: 'Escrow disputed' },
  dispute_won:     { type: 'consistent_behavior', impact: 10,  description: 'Dispute won — legitimate claim' },
  dispute_lost:    { type: 'inconsistency',       impact: -15, description: 'Dispute lost — invalid claim' },
  agent_registered:{ type: 'verified_identity',    impact: 8,   description: 'Agent registered on-chain' },
};

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
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('sync') && text.includes('trust')) ||
      (text.includes('record') && text.includes('trust')) ||
      (text.includes('log') && text.includes('kamiyo')) ||
      text.includes('trust event')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; eventsRecorded: number; pushedToTrustEngine: boolean; error?: string }> {
    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, eventsRecorded: 0, pushedToTrustEngine: false, error: 'Wallet not configured' };
    }

    // Try to use evidence bridge service first (from @kamiyo/eliza-trust-provider)
    try {
      const bridge = (runtime as any).getService?.('kamiyo-trust-evidence-bridge');
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

      const evidenceRecords: Record<string, unknown>[] = [];

      // Registration evidence
      evidenceRecords.push({
        sourceEntityId: runtime.agentId,
        targetEntityId: keypair.publicKey.toBase58(),
        type: 'verified_identity',
        impact: Math.round(8 * weight),
        verified: true,
        description: 'Agent registered on KAMIYO with on-chain identity',
        context: { source: 'kamiyo-on-chain', reputation },
      });

      // Escrow success evidence
      if (successful > 0) {
        evidenceRecords.push({
          sourceEntityId: runtime.agentId,
          targetEntityId: keypair.publicKey.toBase58(),
          type: 'promise_kept',
          impact: Math.round(15 * weight),
          weight: Math.min(successful, 10),
          verified: true,
          description: `${successful} escrows released successfully`,
          context: { source: 'kamiyo-on-chain', count: successful, total },
        });
      }

      // Dispute evidence
      if (disputed > 0) {
        evidenceRecords.push({
          sourceEntityId: runtime.agentId,
          targetEntityId: keypair.publicKey.toBase58(),
          type: 'promise_broken',
          impact: Math.round(-10 * weight),
          weight: Math.min(disputed, 5),
          verified: true,
          description: `${disputed} escrows disputed`,
          context: { source: 'kamiyo-on-chain', count: disputed, total },
        });
      }

      // Push to TrustEngine if available
      let pushedToTrustEngine = false;
      try {
        const engine = (runtime as any).getService?.('trust-engine') as TrustEngineService | undefined;
        if (engine && typeof engine.recordInteraction === 'function') {
          for (const record of evidenceRecords) {
            await engine.recordInteraction(record);
          }
          pushedToTrustEngine = true;
        }
      } catch {
        // plugin-trust not available
      }

      // Store in runtime state
      await runtime.setState?.('kamiyoTrustEvidence', evidenceRecords);

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
