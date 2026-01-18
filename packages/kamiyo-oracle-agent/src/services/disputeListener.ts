import { Connection, PublicKey } from '@solana/web3.js';
import type { Service, IAgentRuntime, PendingDispute } from '../types';
import { getNetworkConfig, PROGRAM_IDS } from '../config';

export const disputeListenerService: Service = {
  name: 'kamiyo-dispute-listener',
  description: 'Monitors the blockchain for new disputed escrows',

  async start(runtime: IAgentRuntime): Promise<void> {
    const { rpcUrl, network } = getNetworkConfig(runtime);
    const connection = new Connection(rpcUrl, 'confirmed');
    const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

    const pollInterval = parseInt(runtime.getSetting('POLL_INTERVAL_MS') || '30000');
    const heliusKey = runtime.getSetting('HELIUS_API_KEY');

    console.log(`[dispute-listener] Starting on ${network}...`);
    console.log(`[dispute-listener] Program: ${programId.toBase58()}`);
    console.log(`[dispute-listener] Poll interval: ${pollInterval}ms`);

    // If Helius is available, use webhooks for real-time updates
    if (heliusKey) {
      await setupHeliusWebhook(runtime, heliusKey, programId);
    }

    // Also run polling as a fallback/backup
    const poll = async () => {
      try {
        await pollForDisputes(runtime, connection, programId);
      } catch (err) {
        console.error('[dispute-listener] Poll error:', err);
      }
    };

    const timer = setInterval(poll, pollInterval);
    (this as any)._timer = timer;
    (this as any)._connection = connection;

    // Initial poll
    await poll();

    console.log('[dispute-listener] Service started');
  },

  async stop(): Promise<void> {
    if ((this as any)._timer) {
      clearInterval((this as any)._timer);
      console.log('[dispute-listener] Service stopped');
    }
  },
};

async function setupHeliusWebhook(
  runtime: IAgentRuntime,
  apiKey: string,
  programId: PublicKey
): Promise<void> {
  // In production, this would register a webhook with Helius
  // For now, we rely on polling

  console.log('[dispute-listener] Helius webhook setup (placeholder)');

  // The webhook would call this function when disputes are detected:
  // onDisputeDetected(runtime, disputeEvent);
}

async function pollForDisputes(
  runtime: IAgentRuntime,
  connection: Connection,
  programId: PublicKey
): Promise<void> {
  // Get all program accounts that are disputed escrows
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { dataSize: 500 }, // Approximate escrow account size
      // Filter for disputed status (status byte = 1)
      {
        memcmp: {
          offset: 80, // Status field offset (approximate)
          bytes: Buffer.from([1]).toString('base64'), // Disputed = 1
        },
      },
    ],
  });

  console.log(`[dispute-listener] Found ${accounts.length} disputed escrows`);

  // Get current state
  const state = await runtime.getState?.('oracle_state') as {
    pendingDisputes?: PendingDispute[];
    votedDisputes?: string[];
  } | undefined;

  const currentPending = state?.pendingDisputes || [];
  const votedDisputes = state?.votedDisputes || [];
  const currentPendingSet = new Set(currentPending.map(d => d.escrowPda));
  const votedSet = new Set(votedDisputes);

  const newDisputes: PendingDispute[] = [];

  for (const { pubkey, account } of accounts) {
    const escrowPda = pubkey.toBase58();

    // Skip if already pending or voted
    if (currentPendingSet.has(escrowPda) || votedSet.has(escrowPda)) {
      continue;
    }

    // Parse escrow data (simplified)
    const dispute = parseEscrowAccount(escrowPda, account.data);
    if (dispute) {
      newDisputes.push(dispute);
      console.log(`[dispute-listener] New dispute: ${escrowPda.slice(0, 8)}... (${dispute.amount} SOL)`);
    }
  }

  if (newDisputes.length > 0) {
    // Add new disputes to pending list
    const updatedPending = [...currentPending, ...newDisputes];

    await runtime.setState?.('oracle_state', {
      ...state,
      pendingDisputes: updatedPending,
    });

    console.log(`[dispute-listener] Added ${newDisputes.length} new disputes, total pending: ${updatedPending.length}`);
  }
}

function parseEscrowAccount(escrowPda: string, data: Buffer): PendingDispute | null {
  try {
    // Simplified parsing - in production use Anchor's account decoder
    const agent = new PublicKey(data.slice(8, 40)).toBase58();
    const provider = new PublicKey(data.slice(40, 72)).toBase58();
    const amount = Number(data.readBigUInt64LE(72)) / 1e9;
    const createdAt = Number(data.readBigInt64LE(81));
    const expiresAt = Number(data.readBigInt64LE(89));

    // Extract transaction ID (string with length prefix)
    const txIdLength = data.readUInt32LE(97);
    const transactionId = data.slice(101, 101 + txIdLength).toString('utf8');

    return {
      escrowPda,
      agent,
      provider,
      amount,
      transactionId,
      disputedAt: Date.now(),
      expiresAt: expiresAt * 1000,
      addedAt: Date.now(),
      evaluationAttempts: 0,
    };
  } catch {
    return null;
  }
}
