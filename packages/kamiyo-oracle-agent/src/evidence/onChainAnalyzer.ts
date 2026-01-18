import { Connection, PublicKey } from '@solana/web3.js';
import type {
  TransactionRecord,
  DisputeRecord,
  EscrowRecord,
} from '../deliberation/types';
import { createLogger } from '../lib/logger';
import { withRetry } from '../lib/retry';

const log = createLogger('on-chain-analyzer');

export interface OnChainEvidence {
  agentTransactions: TransactionRecord[];
  providerTransactions: TransactionRecord[];
  previousDisputes: DisputeRecord[];
  escrowHistory: EscrowRecord[];
  accountAges: {
    agent: number;
    provider: number;
  };
  activityPatterns: {
    agentActive: boolean;
    providerActive: boolean;
    suspiciousPatterns: string[];
  };
}

export class OnChainAnalyzer {
  private connection: Connection;
  private heliusApiKey?: string;
  private programId: PublicKey;

  constructor(
    rpcUrl: string,
    programId: string,
    heliusApiKey?: string
  ) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.programId = new PublicKey(programId);
    this.heliusApiKey = heliusApiKey;
  }

  async analyze(
    agentPubkey: string,
    providerPubkey: string,
    escrowPda: string,
    maxTimeMs = 30000
  ): Promise<OnChainEvidence> {
    const startTime = Date.now();

    log.info('Starting on-chain analysis', {
      agent: agentPubkey.slice(0, 8),
      provider: providerPubkey.slice(0, 8),
    });

    const results = await Promise.allSettled([
      this.fetchTransactionHistory(agentPubkey, 'agent'),
      this.fetchTransactionHistory(providerPubkey, 'provider'),
      this.fetchPreviousDisputes(agentPubkey, providerPubkey),
      this.fetchEscrowHistory(agentPubkey),
      this.analyzeAccountAge(agentPubkey, providerPubkey),
    ]);

    const evidence: OnChainEvidence = {
      agentTransactions: results[0].status === 'fulfilled' ? results[0].value : [],
      providerTransactions: results[1].status === 'fulfilled' ? results[1].value : [],
      previousDisputes: results[2].status === 'fulfilled' ? results[2].value : [],
      escrowHistory: results[3].status === 'fulfilled' ? results[3].value : [],
      accountAges: results[4].status === 'fulfilled'
        ? results[4].value
        : { agent: 0, provider: 0 },
      activityPatterns: {
        agentActive: false,
        providerActive: false,
        suspiciousPatterns: [],
      },
    };

    // Analyze activity patterns
    evidence.activityPatterns = this.analyzePatterns(evidence);

    log.info('On-chain analysis complete', {
      transactions: evidence.agentTransactions.length + evidence.providerTransactions.length,
      disputes: evidence.previousDisputes.length,
      timeMs: Date.now() - startTime,
    });

    return evidence;
  }

  private async fetchTransactionHistory(
    pubkey: string,
    role: 'agent' | 'provider'
  ): Promise<TransactionRecord[]> {
    if (this.heliusApiKey) {
      return this.fetchHeliusTransactions(pubkey);
    }

    return this.fetchRpcTransactions(pubkey);
  }

  private async fetchHeliusTransactions(pubkey: string): Promise<TransactionRecord[]> {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${pubkey}/transactions?api-key=${this.heliusApiKey}&limit=50`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        log.warn('Helius API error', { status: response.status });
        return [];
      }

      const txs = (await response.json()) as Array<{
        signature: string;
        timestamp: number;
        type: string;
        nativeTransfers?: Array<{ amount: number }>;
        err: unknown;
      }>;

      return txs.map((tx) => ({
        signature: tx.signature,
        timestamp: tx.timestamp * 1000,
        type: tx.type || 'unknown',
        amount: tx.nativeTransfers?.[0]?.amount
          ? tx.nativeTransfers[0].amount / 1e9
          : undefined,
        success: !tx.err,
      }));
    } catch (err) {
      log.warn('Failed to fetch Helius transactions', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchRpcTransactions(pubkey: string): Promise<TransactionRecord[]> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(pubkey),
        { limit: 50 }
      );

      return signatures.map((sig) => ({
        signature: sig.signature,
        timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
        type: 'unknown',
        success: !sig.err,
      }));
    } catch (err) {
      log.warn('Failed to fetch RPC transactions', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchPreviousDisputes(
    agentPubkey: string,
    providerPubkey: string
  ): Promise<DisputeRecord[]> {
    // Query program accounts for past disputes involving these parties
    try {
      const accounts = await this.connection.getProgramAccounts(this.programId, {
        filters: [
          // Look for resolved escrows (status = 3)
          {
            memcmp: {
              offset: 8 + 32 + 32 + 8, // After discriminator, agent, api, amount
              bytes: Buffer.from([3]).toString('base64'), // Resolved status
            },
          },
        ],
      });

      const disputes: DisputeRecord[] = [];

      for (const { pubkey, account } of accounts) {
        try {
          const data = account.data;
          let offset = 8; // Skip discriminator

          const agent = new PublicKey(data.slice(offset, offset + 32)).toBase58();
          offset += 32;

          const api = new PublicKey(data.slice(offset, offset + 32)).toBase58();
          offset += 32;

          // Check if this dispute involves either party
          if (agent !== agentPubkey && agent !== providerPubkey &&
              api !== agentPubkey && api !== providerPubkey) {
            continue;
          }

          const amount = Number(data.readBigUInt64LE(offset)) / 1e9;
          offset += 8 + 1 + 8 + 8; // Skip status, created_at, expires_at

          // Skip transaction_id
          const txIdLen = data.readUInt32LE(offset);
          offset += 4 + txIdLen + 1; // Skip string + bump

          // Read quality_score if present
          const hasScore = data[offset] === 1;
          offset += 1;
          const score = hasScore ? data[offset] : null;

          // Determine outcome
          let outcome: 'agent_won' | 'provider_won' | 'split' = 'split';
          if (score !== null) {
            if (score < 50) outcome = 'agent_won';
            else if (score >= 80) outcome = 'provider_won';
          }

          disputes.push({
            escrowPda: pubkey.toBase58(),
            outcome,
            score: score ?? undefined,
            timestamp: Date.now(), // Would need proper timestamp parsing
            amount,
          });
        } catch {
          // Skip malformed accounts
        }
      }

      return disputes;
    } catch (err) {
      log.warn('Failed to fetch previous disputes', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchEscrowHistory(agentPubkey: string): Promise<EscrowRecord[]> {
    // Fetch all escrows created by this agent
    try {
      const accounts = await this.connection.getProgramAccounts(this.programId, {
        filters: [
          {
            memcmp: {
              offset: 8, // After discriminator
              bytes: new PublicKey(agentPubkey).toBase58(),
            },
          },
        ],
      });

      const escrows: EscrowRecord[] = [];

      for (const { pubkey, account } of accounts) {
        try {
          const data = account.data;
          const amount = Number(data.readBigUInt64LE(8 + 32 + 32)) / 1e9;
          const status = data[8 + 32 + 32 + 8];
          const createdAt = Number(data.readBigInt64LE(8 + 32 + 32 + 8 + 1)) * 1000;

          const statusNames = ['Active', 'Released', 'Disputed', 'Resolved'];

          escrows.push({
            pda: pubkey.toBase58(),
            status: statusNames[status] || 'Unknown',
            amount,
            createdAt,
          });
        } catch {
          // Skip malformed
        }
      }

      return escrows;
    } catch (err) {
      log.warn('Failed to fetch escrow history', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async analyzeAccountAge(
    agentPubkey: string,
    providerPubkey: string
  ): Promise<{ agent: number; provider: number }> {
    const now = Date.now();

    const getFirstTxTime = async (pubkey: string): Promise<number> => {
      try {
        const signatures = await this.connection.getSignaturesForAddress(
          new PublicKey(pubkey),
          { limit: 1000 }
        );

        if (signatures.length === 0) return now;

        const oldest = signatures[signatures.length - 1];
        return oldest.blockTime ? oldest.blockTime * 1000 : now;
      } catch {
        return now;
      }
    };

    const [agentFirst, providerFirst] = await Promise.all([
      getFirstTxTime(agentPubkey),
      getFirstTxTime(providerPubkey),
    ]);

    return {
      agent: now - agentFirst,
      provider: now - providerFirst,
    };
  }

  private analyzePatterns(evidence: OnChainEvidence): {
    agentActive: boolean;
    providerActive: boolean;
    suspiciousPatterns: string[];
  } {
    const patterns: string[] = [];
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    // Check recent activity
    const recentAgentTxs = evidence.agentTransactions.filter(
      (tx) => now - tx.timestamp < oneWeek
    );
    const recentProviderTxs = evidence.providerTransactions.filter(
      (tx) => now - tx.timestamp < oneWeek
    );

    const agentActive = recentAgentTxs.length > 0;
    const providerActive = recentProviderTxs.length > 0;

    // Check for suspicious patterns

    // New account with large escrow
    if (evidence.accountAges.agent < 7 * 24 * 60 * 60 * 1000) {
      patterns.push('Agent account less than 7 days old');
    }

    if (evidence.accountAges.provider < 30 * 24 * 60 * 60 * 1000) {
      patterns.push('Provider account less than 30 days old');
    }

    // High dispute rate
    const agentDisputes = evidence.previousDisputes.filter(
      (d) => d.outcome === 'agent_won'
    );
    const agentTotalEscrows = evidence.escrowHistory.length;

    if (agentTotalEscrows > 5 && agentDisputes.length / agentTotalEscrows > 0.4) {
      patterns.push('Agent has unusually high dispute win rate');
    }

    // Multiple failed transactions
    const failedAgentTxs = evidence.agentTransactions.filter((tx) => !tx.success);
    if (failedAgentTxs.length > 5) {
      patterns.push('Agent has many failed transactions');
    }

    return { agentActive, providerActive, suspiciousPatterns: patterns };
  }
}
