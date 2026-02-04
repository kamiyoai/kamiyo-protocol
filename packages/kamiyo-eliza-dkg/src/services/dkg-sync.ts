import type { Service, IAgentRuntime } from '../types.js';
import {
  getBridgeContext,
  addBridgeEventListener,
  publishQualityAttestation,
  publishDisputeOutcome,
} from '../bridge.js';

export const dkgSyncService: Service = {
  name: 'dkgSync',
  description: 'Syncs KAMIYO escrow and quality events to OriginTrail DKG',

  start: async (runtime: IAgentRuntime): Promise<void> => {
    const ctx = await getBridgeContext(runtime);

    const unsubscribe = addBridgeEventListener((event) => {
      console.log(`[DKG Sync] Event: ${event.type}`, event.ual ? `UAL: ${event.ual}` : '');
    });
    (runtime as any)._dkgSyncUnsubscribe = unsubscribe;

    try {
      const sdk = await import('@kamiyo/sdk');
      const emitter = (sdk as any).getEscrowEmitter?.();

      if (emitter) {
        emitter.on?.('escrow:released', async (data: any) => {
          if (!ctx.config.autoPublishQuality) return;
          if (!data?.provider || !data?.escrowId) {
            console.warn('[DKG Sync] Invalid escrow release event data');
            return;
          }

          try {
            const qualityScore = typeof data.qualityScore === 'number' && data.qualityScore >= 0 && data.qualityScore <= 100
              ? data.qualityScore
              : 100;
            await publishQualityAttestation(ctx, {
              providerId: String(data.provider),
              qualityScore,
              explanation: `Escrow ${String(data.escrowId).slice(0, 64)} released successfully`,
              escrowId: String(data.escrowId),
              transactionHash: data.transactionHash ? String(data.transactionHash) : undefined,
            }, runtime.agentId);
          } catch (err) {
            console.error('[DKG Sync] Failed to publish escrow release:', err);
          }
        });

        emitter.on?.('dispute:resolved', async (data: any) => {
          if (!ctx.config.autoPublishDisputes) return;
          if (!data?.escrowId || !data?.client || !data?.provider || !data?.outcome) {
            console.warn('[DKG Sync] Invalid dispute resolution event data');
            return;
          }

          try {
            await publishDisputeOutcome(ctx, {
              escrowId: String(data.escrowId),
              clientId: String(data.client),
              providerId: String(data.provider),
              amount: typeof data.amount === 'number' ? data.amount : 0,
              currency: String(data.currency || 'SOL'),
              outcome: data.outcome,
              qualityScore: typeof data.qualityScore === 'number' ? Math.max(0, Math.min(data.qualityScore, 100)) : 0,
              refundPercentage: typeof data.refundPercentage === 'number' ? Math.max(0, Math.min(data.refundPercentage, 100)) : 0,
              oracleVotes: Array.isArray(data.oracleVotes) ? data.oracleVotes : [],
              evidenceHash: data.evidenceHash ? String(data.evidenceHash) : undefined,
              transactionHash: data.transactionHash ? String(data.transactionHash) : undefined,
            });
          } catch (err) {
            console.error('[DKG Sync] Failed to publish dispute outcome:', err);
          }
        });

        console.log('[DKG Sync] Connected to KAMIYO escrow events');
      }
    } catch {
      console.log('[DKG Sync] Running without KAMIYO SDK event integration');
    }
    console.log('[DKG Sync] Service started');
  },

  stop: async (): Promise<void> => {
    console.log('[DKG Sync] Service stopped');
  },
};
