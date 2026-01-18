import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import type { Service, IAgentRuntime, PendingDispute } from '../types';
import { getNetworkConfig, PROGRAM_IDS } from '../config';
import { createLogger } from '../lib/logger';
import { withRetry, withCircuitBreaker } from '../lib/retry';
import { BlockchainError } from '../lib/errors';

const log = createLogger('dispute-listener');

// Escrow status enum matching on-chain
const ESCROW_STATUS = {
  Active: 0,
  Released: 1,
  Disputed: 2,
  Resolved: 3,
} as const;

interface ServiceState {
  timer: ReturnType<typeof setInterval> | null;
  connection: Connection | null;
  isShuttingDown: boolean;
}

const state: ServiceState = {
  timer: null,
  connection: null,
  isShuttingDown: false,
};

export const disputeListenerService: Service = {
  name: 'kamiyo-dispute-listener',
  description: 'Monitors the blockchain for new disputed escrows',

  async start(runtime: IAgentRuntime): Promise<void> {
    const { rpcUrl, network } = getNetworkConfig(runtime);
    const connection = new Connection(rpcUrl, 'confirmed');
    const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

    const pollInterval = parseInt(runtime.getSetting('POLL_INTERVAL_MS') || '30000');
    const heliusKey = runtime.getSetting('HELIUS_API_KEY');

    log.info('Starting dispute listener', {
      network,
      program: programId.toBase58().slice(0, 8),
      pollInterval,
    });

    state.connection = connection;
    state.isShuttingDown = false;

    if (heliusKey) {
      await setupHeliusWebhook(runtime, heliusKey, programId);
    }

    const poll = async () => {
      if (state.isShuttingDown) return;

      try {
        await withCircuitBreaker(
          () => pollForDisputes(runtime, connection, programId),
          'dispute-polling'
        );
      } catch (err) {
        log.error('Poll failed', err instanceof Error ? err : new Error(String(err)));
      }
    };

    state.timer = setInterval(poll, pollInterval);

    // Initial poll with small delay
    setTimeout(poll, 1000);

    log.info('Dispute listener started');
  },

  async stop(): Promise<void> {
    state.isShuttingDown = true;

    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }

    log.info('Dispute listener stopped');
  },
};

async function setupHeliusWebhook(
  runtime: IAgentRuntime,
  apiKey: string,
  programId: PublicKey
): Promise<void> {
  // Helius webhook registration for production
  // In real implementation, would set up authenticated webhook endpoint
  log.info('Helius webhook setup placeholder', {
    program: programId.toBase58().slice(0, 8),
  });
}

async function pollForDisputes(
  runtime: IAgentRuntime,
  connection: Connection,
  programId: PublicKey
): Promise<void> {
  // Fetch disputed escrows with retry
  const accounts = await withRetry(
    async () => {
      return connection.getProgramAccounts(programId, {
        filters: [
          // Filter for Escrow accounts by discriminator
          // Escrow discriminator would be sha256("account:Escrow")[0..8]
          // Using memcmp for status = Disputed (2)
          {
            memcmp: {
              offset: 8 + 32 + 32 + 8, // After discriminator, agent, api, amount
              bytes: Buffer.from([ESCROW_STATUS.Disputed]).toString('base64'),
            },
          },
        ],
      });
    },
    'getProgramAccounts',
    { maxAttempts: 2 }
  );

  log.debug('Poll complete', { found: accounts.length });

  const oracleState = (await runtime.getState?.('oracle_state')) as {
    pendingDisputes?: PendingDispute[];
    votedDisputes?: string[];
  } | undefined;

  const currentPending = oracleState?.pendingDisputes || [];
  const votedDisputes = oracleState?.votedDisputes || [];
  const currentPendingSet = new Set(currentPending.map((d) => d.escrowPda));
  const votedSet = new Set(votedDisputes);

  const newDisputes: PendingDispute[] = [];

  for (const { pubkey, account } of accounts) {
    const escrowPda = pubkey.toBase58();

    if (currentPendingSet.has(escrowPda) || votedSet.has(escrowPda)) {
      continue;
    }

    const dispute = parseEscrowAccount(escrowPda, account.data);
    if (dispute) {
      newDisputes.push(dispute);
      log.info('New dispute detected', {
        escrow: escrowPda.slice(0, 8),
        amount: dispute.amount,
      });
    }
  }

  if (newDisputes.length > 0) {
    const updatedPending = [...currentPending, ...newDisputes];

    await runtime.setState?.('oracle_state', {
      ...oracleState,
      pendingDisputes: updatedPending,
    });

    log.info('Disputes added', {
      new: newDisputes.length,
      total: updatedPending.length,
    });
  }
}

function parseEscrowAccount(escrowPda: string, data: Buffer): PendingDispute | null {
  try {
    let offset = 8; // Skip discriminator

    const agent = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;

    const provider = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;

    const amount = new BN(data.slice(offset, offset + 8), 'le').toNumber() / 1e9;
    offset += 8;

    const status = data[offset];
    offset += 1;

    // Only process disputed escrows
    if (status !== ESCROW_STATUS.Disputed) {
      return null;
    }

    const createdAt = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;

    const expiresAt = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;

    // Read transaction_id (4-byte length prefix + string)
    const txIdLen = data.readUInt32LE(offset);
    offset += 4;

    if (txIdLen > 64) {
      return null;
    }

    const transactionId = data.slice(offset, offset + txIdLen).toString('utf8');

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
  } catch (err) {
    log.warn('Failed to parse escrow', {
      escrow: escrowPda.slice(0, 8),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
