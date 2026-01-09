import { PublicKey, Connection } from '@solana/web3.js';
import {
  HeliusConfig, ConnectionPoolConfig, EscrowState, ParsedTransaction,
  TransactionFilter, PriorityFeeEstimate, FeeStrategy, Subscription,
  SubscriptionOptions, HeliusEnhancedTransaction, HeliusAdapterError, ConnectionError
} from './types';
import { ConnectionPool } from './connection-pool';
import { RateLimiter } from './rate-limiter';
import { PriorityFeeCalculator } from './priority-fees';
import { parseTransaction, parseEscrowState, groupByEscrow, calculateEscrowLifecycle } from './parser';
import { KAMIYO_PROGRAM_ID, DEFAULTS, HELIUS_API_ENDPOINTS, PDA_SEEDS, COMPUTE_UNITS, LIMITS } from './constants';
import {
  validateConfig, validateTransactionId, validateSignature, validateSignatures,
  validatePublicKey, validatePublicKeys, validatePositiveInteger
} from './validation';
import { Logger, nullLogger, createScopedLogger } from './logger';

export interface ClientOptions {
  logger?: Logger;
}

export class KamiyoHeliusClient {
  private readonly config: Required<HeliusConfig>;
  private readonly pool: ConnectionPool;
  private readonly limiter: RateLimiter;
  private readonly fees: PriorityFeeCalculator;
  private readonly programId: PublicKey;
  private readonly log: Logger;
  private subs: Map<number, Subscription> = new Map();
  private ready = false;

  constructor(config: HeliusConfig, poolConfig?: ConnectionPoolConfig, opts?: ClientOptions) {
    validateConfig(config);

    this.log = opts?.logger ? createScopedLogger(opts.logger, 'HeliusClient') : nullLogger;
    this.config = {
      apiKey: config.apiKey,
      cluster: config.cluster ?? 'mainnet-beta',
      commitment: config.commitment ?? DEFAULTS.COMMITMENT,
      maxRetries: config.maxRetries ?? DEFAULTS.MAX_RETRIES,
      retryDelayMs: config.retryDelayMs ?? DEFAULTS.RETRY_DELAY_MS,
      rateLimitRps: config.rateLimitRps ?? DEFAULTS.RATE_LIMIT_RPS,
      enableWebsocket: config.enableWebsocket ?? true
    };

    this.pool = new ConnectionPool(this.config.apiKey, this.config.cluster, this.config.commitment, poolConfig);
    this.limiter = new RateLimiter({ maxTokens: this.config.rateLimitRps, refillRate: this.config.rateLimitRps });
    this.fees = new PriorityFeeCalculator(this.config.apiKey, this.config.cluster);
    this.programId = new PublicKey(KAMIYO_PROGRAM_ID);
  }

  async init(): Promise<void> {
    if (this.ready) return;
    this.log.info('Initializing');
    await this.pool.init();
    this.ready = true;
    this.log.info('Ready', { poolStats: this.pool.getStats() });
  }

  getConnection(): Connection {
    this.checkReady();
    return this.pool.getConnection();
  }

  deriveEscrowPDA(txId: string): { pda: PublicKey; bump: number } {
    validateTransactionId(txId);
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(PDA_SEEDS.ESCROW), Buffer.from(txId)],
      this.programId
    );
    return { pda, bump };
  }

  deriveReputationPDA(entity: PublicKey): { pda: PublicKey; bump: number } {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(PDA_SEEDS.REPUTATION), entity.toBuffer()],
      this.programId
    );
    return { pda, bump };
  }

  async getEscrowState(pda: PublicKey): Promise<EscrowState | null> {
    validatePublicKey(pda, 'pda');
    this.checkReady();
    await this.limiter.acquire();

    return this.pool.execute(async (conn) => {
      const info = await conn.getAccountInfo(pda);
      return info ? parseEscrowState(info.data, pda) : null;
    });
  }

  async getEscrowStates(pdas: PublicKey[]): Promise<Map<string, EscrowState | null>> {
    if (pdas.length > LIMITS.MAX_ESCROW_PDAS_BATCH) {
      throw new Error(`Batch size exceeds ${LIMITS.MAX_ESCROW_PDAS_BATCH}`);
    }
    validatePublicKeys(pdas, 'pdas');
    this.checkReady();

    const results = new Map<string, EscrowState | null>();
    const batch = 100;

    for (let i = 0; i < pdas.length; i += batch) {
      const chunk = pdas.slice(i, i + batch);
      await this.limiter.acquire();

      const accounts = await this.pool.execute((conn) => conn.getMultipleAccountsInfo(chunk));

      chunk.forEach((pda, j) => {
        const info = accounts[j];
        if (info) {
          try {
            results.set(pda.toBase58(), parseEscrowState(info.data, pda));
          } catch {
            results.set(pda.toBase58(), null);
          }
        } else {
          results.set(pda.toBase58(), null);
        }
      });
    }
    return results;
  }

  async getRecentTransactions(filter?: TransactionFilter): Promise<ParsedTransaction[]> {
    this.checkReady();
    await this.limiter.acquire();

    const limit = filter?.limit ?? 50;

    return this.pool.execute(async (conn) => {
      const sigs = await conn.getSignaturesForAddress(this.programId, { limit });
      const txs: ParsedTransaction[] = [];

      for (const sig of sigs) {
        await this.limiter.acquire();
        try {
          const tx = await conn.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
          if (!tx) continue;

          const enhanced = this.toEnhanced(tx, { signature: sig.signature, slot: sig.slot, blockTime: sig.blockTime ?? null });
          const parsed = parseTransaction(enhanced);

          if (this.matchesFilter(parsed, filter)) txs.push(parsed);
        } catch {
          continue;
        }
      }
      return txs;
    });
  }

  async getTransaction(sig: string): Promise<ParsedTransaction | null> {
    validateSignature(sig);
    this.checkReady();
    await this.limiter.acquire();

    return this.pool.execute(async (conn) => {
      const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
      if (!tx) return null;
      return parseTransaction(this.toEnhanced(tx, { signature: sig, slot: tx.slot, blockTime: tx.blockTime ?? null }));
    });
  }

  async getEscrowHistory(txId: string): Promise<{
    transactions: ParsedTransaction[];
    lifecycle: ReturnType<typeof calculateEscrowLifecycle>;
  }> {
    validateTransactionId(txId);
    const { pda } = this.deriveEscrowPDA(txId);
    const all = await this.getRecentTransactions({ limit: 100 });
    const escrowTxs = all.filter((tx) => tx.escrowPda === pda.toBase58());
    return { transactions: escrowTxs, lifecycle: calculateEscrowLifecycle(escrowTxs) };
  }

  async getPriorityFee(accounts: PublicKey[]): Promise<PriorityFeeEstimate> {
    validatePublicKeys(accounts, 'accounts');
    return this.fees.getEstimate(accounts);
  }

  async getOperationFee(
    op: keyof typeof COMPUTE_UNITS,
    pda: PublicKey,
    strategy: FeeStrategy = 'standard'
  ): Promise<{ priorityFee: number; computeUnits: number; totalFee: number }> {
    validatePublicKey(pda, 'pda');
    return this.fees.getOperationFee(op, pda, [], strategy);
  }

  async subscribeToEscrow(pda: PublicKey, opts: SubscriptionOptions): Promise<Subscription> {
    validatePublicKey(pda, 'pda');
    this.checkReady();

    const conn = this.pool.getConnection();
    const subId = conn.onAccountChange(
      pda,
      async (info) => {
        try {
          opts.onStateChange(parseEscrowState(info.data, pda));
        } catch (e) {
          opts.onError?.(e instanceof Error ? e : new Error(String(e)));
        }
      },
      opts.commitment ?? this.config.commitment
    );

    const sub: Subscription = {
      id: subId,
      escrowPda: pda,
      unsubscribe: async () => {
        await conn.removeAccountChangeListener(subId);
        this.subs.delete(subId);
      }
    };

    this.subs.set(subId, sub);
    return sub;
  }

  async unsubscribeAll(): Promise<void> {
    await Promise.all(Array.from(this.subs.values()).map((s) => s.unsubscribe()));
    this.subs.clear();
  }

  async fetchEnhancedTransactions(sigs: string[]): Promise<HeliusEnhancedTransaction[]> {
    validateSignatures(sigs);
    await this.limiter.acquire();

    const url = `${HELIUS_API_ENDPOINTS[this.config.cluster]}/transactions`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), DEFAULTS.CONNECTION_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ transactions: sigs }),
        signal: ctrl.signal
      });

      if (!res.ok) throw new HeliusAdapterError(`API error: ${res.status}`, 'API_ERROR');
      return (await res.json()) as HeliusEnhancedTransaction[];
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new HeliusAdapterError(`Timeout after ${DEFAULTS.CONNECTION_TIMEOUT_MS}ms`, 'TIMEOUT');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getProtocolStats(sample = 50): Promise<{
    totalEscrows: number;
    activeEscrows: number;
    disputedEscrows: number;
    resolvedEscrows: number;
    averageQualityScore: number | null;
    totalVolume: bigint;
  }> {
    validatePositiveInteger(sample, 'sample');
    const txs = await this.getRecentTransactions({ limit: Math.min(sample, 100) });
    const grouped = groupByEscrow(txs);

    let active = 0, disputed = 0, resolved = 0, volume = 0n;
    const scores: number[] = [];

    for (const [, list] of grouped) {
      const lc = calculateEscrowLifecycle(list);
      if (lc.released || lc.closed) resolved++;
      else if (lc.disputed) disputed++;
      else if (lc.funded) active++;
      if (lc.totalAmount) volume += lc.totalAmount;
      if (lc.finalQualityScore !== null) scores.push(lc.finalQualityScore);
    }

    return {
      totalEscrows: grouped.size,
      activeEscrows: active,
      disputedEscrows: disputed,
      resolvedEscrows: resolved,
      averageQualityScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      totalVolume: volume
    };
  }

  getPoolStats() { return this.pool.getStats(); }
  getRateLimiterStats() { return this.limiter.getStats(); }

  async shutdown(): Promise<void> {
    this.log.info('Shutting down');
    await this.unsubscribeAll();
    this.pool.shutdown();
    this.limiter.clear();
    this.fees.clearCache();
    this.ready = false;
  }

  private checkReady(): void {
    if (!this.ready) throw new ConnectionError('Not initialized. Call init() first.');
  }

  private matchesFilter(tx: ParsedTransaction, f?: TransactionFilter): boolean {
    if (!f) return true;
    if (f.type && !f.type.includes(tx.type)) return false;
    if (f.escrowPda && tx.escrowPda !== f.escrowPda) return false;
    if (f.minTimestamp && tx.timestamp < f.minTimestamp) return false;
    if (f.maxTimestamp && tx.timestamp > f.maxTimestamp) return false;
    return true;
  }

  private toEnhanced(
    tx: Awaited<ReturnType<Connection['getParsedTransaction']>>,
    sig: { signature: string; slot: number; blockTime: number | null }
  ): HeliusEnhancedTransaction {
    const instructions = tx?.transaction.message.instructions.map((ix) => {
      if ('programId' in ix && 'accounts' in ix && 'data' in ix) {
        return {
          programId: ix.programId.toBase58(),
          accounts: ix.accounts?.map((a) => a.toBase58()) ?? [],
          data: ix.data ?? '',
          innerInstructions: []
        };
      }
      return { programId: (ix as { programId: PublicKey }).programId?.toBase58() ?? '', accounts: [], data: '', innerInstructions: [] };
    }) ?? [];

    const transfers: HeliusEnhancedTransaction['nativeTransfers'] = [];
    const pre = tx?.meta?.preBalances ?? [];
    const post = tx?.meta?.postBalances ?? [];
    const keys = tx?.transaction.message.accountKeys ?? [];

    for (let i = 0; i < keys.length; i++) {
      const diff = (post[i] ?? 0) - (pre[i] ?? 0);
      if (diff !== 0) {
        for (let j = 0; j < keys.length; j++) {
          if (i === j) continue;
          if ((post[j] ?? 0) - (pre[j] ?? 0) === -diff && diff > 0) {
            transfers.push({ fromUserAccount: keys[j].pubkey.toBase58(), toUserAccount: keys[i].pubkey.toBase58(), amount: diff });
            break;
          }
        }
      }
    }

    return {
      signature: sig.signature,
      slot: sig.slot,
      timestamp: sig.blockTime ?? Math.floor(Date.now() / 1000),
      fee: tx?.meta?.fee ?? 0,
      feePayer: keys[0]?.pubkey.toBase58() ?? '',
      instructions,
      accountData: [],
      nativeTransfers: transfers,
      tokenTransfers: [],
      events: {},
      transactionError: tx?.meta?.err ? JSON.stringify(tx.meta.err) : null
    };
  }
}
