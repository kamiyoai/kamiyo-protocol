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

    // Set up event listener for bridge events
    const unsubscribe = addBridgeEventListener((event) => {
      console.log(`[DKG Sync] Event: ${event.type}`, event.ual ? `UAL: ${event.ual}` : '');
    });

    // Store unsubscribe function for cleanup
    (runtime as any)._dkgSyncUnsubscribe = unsubscribe;

    // Integrate with KAMIYO escrow events if available
    try {
      const sdk = await import('@kamiyo/sdk');
      const emitter = (sdk as any).getEscrowEmitter?.();

      if (emitter) {
        emitter.on?.('escrow:released', async (data: any) => {
          if (!ctx.config.autoPublishQuality) return;

          try {
            await publishQualityAttestation(ctx, {
              providerId: data.provider,
              qualityScore: data.qualityScore || 100,
              explanation: `Escrow ${data.escrowId} released successfully`,
              escrowId: data.escrowId,
              transactionHash: data.transactionHash,
            }, runtime.agentId);
          } catch (err) {
            console.error('[DKG Sync] Failed to publish escrow release:', err);
          }
        });

        emitter.on?.('dispute:resolved', async (data: any) => {
          if (!ctx.config.autoPublishDisputes) return;

          try {
            await publishDisputeOutcome(ctx, {
              escrowId: data.escrowId,
              clientId: data.client,
              providerId: data.provider,
              amount: data.amount,
              currency: data.currency || 'SOL',
              outcome: data.outcome,
              qualityScore: data.qualityScore,
              refundPercentage: data.refundPercentage,
              oracleVotes: data.oracleVotes || [],
              evidenceHash: data.evidenceHash,
              transactionHash: data.transactionHash,
            });
          } catch (err) {
            console.error('[DKG Sync] Failed to publish dispute outcome:', err);
          }
        });

        console.log('[DKG Sync] Connected to KAMIYO escrow events');
      }
    } catch {
      // KAMIYO SDK not available or no emitter
      console.log('[DKG Sync] Running without KAMIYO SDK event integration');
    }

    console.log('[DKG Sync] Service started');
  },

  stop: async (): Promise<void> => {
    // Cleanup is handled by the runtime
    console.log('[DKG Sync] Service stopped');
  },
};
