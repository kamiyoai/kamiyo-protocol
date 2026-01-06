/**
 * KAMIYO Helius Adapter - Main Client
 * Helius RPC client for escrow operations
 */

import { PublicKey, Connection } from '@solana/web3.js';
import {
    HeliusConfig,
    ConnectionPoolConfig,
    EscrowState,
    ParsedTransaction,
    TransactionFilter,
    PriorityFeeEstimate,
    FeeStrategy,
    Subscription,
    SubscriptionOptions,
    HeliusEnhancedTransaction,
    HeliusAdapterError,
    ConnectionError
} from './types';
import { ConnectionPool } from './connection-pool';
import { RateLimiter } from './rate-limiter';
import { PriorityFeeCalculator } from './priority-fees';
import {
    parseTransaction,
    parseEscrowState,
    groupByEscrow,
    calculateEscrowLifecycle
} from './parser';
import {
    KAMIYO_PROGRAM_ID,
    DEFAULTS,
    HELIUS_API_ENDPOINTS,
    PDA_SEEDS,
    COMPUTE_UNITS,
    LIMITS
} from './constants';
import {
    validateConfig,
    validateTransactionId,
    validateSignature,
    validateSignatures,
    validatePublicKey,
    validatePublicKeys,
    validatePositiveInteger
} from './validation';
import { Logger, nullLogger, createScopedLogger } from './logger';

export interface ClientOptions {
    logger?: Logger;
}

export class KamiyoHeliusClient {
    private readonly config: Required<HeliusConfig>;
    private readonly pool: ConnectionPool;
    private readonly rateLimiter: RateLimiter;
    private readonly feeCalculator: PriorityFeeCalculator;
    private readonly programId: PublicKey;
    private readonly logger: Logger;
    private subscriptions: Map<number, Subscription> = new Map();
    private initialized = false;

    constructor(config: HeliusConfig, poolConfig?: ConnectionPoolConfig, options?: ClientOptions) {
        // Validate configuration
        validateConfig(config);

        this.logger = options?.logger
            ? createScopedLogger(options.logger, 'KamiyoHeliusClient')
            : nullLogger;

        this.config = {
            apiKey: config.apiKey,
            cluster: config.cluster ?? 'mainnet-beta',
            commitment: config.commitment ?? DEFAULTS.COMMITMENT,
            maxRetries: config.maxRetries ?? DEFAULTS.MAX_RETRIES,
            retryDelayMs: config.retryDelayMs ?? DEFAULTS.RETRY_DELAY_MS,
            rateLimitRps: config.rateLimitRps ?? DEFAULTS.RATE_LIMIT_RPS,
            enableWebsocket: config.enableWebsocket ?? true
        };

        this.logger.debug('Creating client', {
            cluster: this.config.cluster,
            commitment: this.config.commitment,
            rateLimitRps: this.config.rateLimitRps
        });

        this.pool = new ConnectionPool(
            this.config.apiKey,
            this.config.cluster,
            this.config.commitment,
            poolConfig
        );

        this.rateLimiter = new RateLimiter({
            maxTokens: this.config.rateLimitRps,
            refillRate: this.config.rateLimitRps
        });

        this.feeCalculator = new PriorityFeeCalculator(
            this.config.apiKey,
            this.config.cluster
        );

        this.programId = new PublicKey(KAMIYO_PROGRAM_ID);
    }

    /**
     * Initialize the client
     */
    async init(): Promise<void> {
        if (this.initialized) {
            this.logger.debug('Client already initialized');
            return;
        }

        this.logger.info('Initializing client');
        await this.pool.init();
        this.initialized = true;
        this.logger.info('Client initialized successfully', {
            poolStats: this.pool.getStats()
        });
    }

    /**
     * Get current connection
     */
    getConnection(): Connection {
        this.ensureInitialized();
        return this.pool.getConnection();
    }

    /**
     * Derive escrow PDA
     */
    deriveEscrowPDA(transactionId: string): { pda: PublicKey; bump: number } {
        validateTransactionId(transactionId);

        const [pda, bump] = PublicKey.findProgramAddressSync(
            [Buffer.from(PDA_SEEDS.ESCROW), Buffer.from(transactionId)],
            this.programId
        );
        return { pda, bump };
    }

    /**
     * Derive reputation PDA
     */
    deriveReputationPDA(entity: PublicKey): { pda: PublicKey; bump: number } {
        const [pda, bump] = PublicKey.findProgramAddressSync(
            [Buffer.from(PDA_SEEDS.REPUTATION), entity.toBuffer()],
            this.programId
        );
        return { pda, bump };
    }

    /**
     * Get escrow state
     */
    async getEscrowState(escrowPda: PublicKey): Promise<EscrowState | null> {
        validatePublicKey(escrowPda, 'escrowPda');
        this.ensureInitialized();
        await this.rateLimiter.acquire();

        return this.pool.execute(async (connection) => {
            const accountInfo = await connection.getAccountInfo(escrowPda);
            if (!accountInfo) return null;

            return parseEscrowState(accountInfo.data, escrowPda);
        });
    }

    /**
     * Get multiple escrow states
     */
    async getEscrowStates(escrowPdas: PublicKey[]): Promise<Map<string, EscrowState | null>> {
        if (escrowPdas.length > LIMITS.MAX_ESCROW_PDAS_BATCH) {
            throw new Error(`Batch size exceeds maximum of ${LIMITS.MAX_ESCROW_PDAS_BATCH}`);
        }
        validatePublicKeys(escrowPdas, 'escrowPdas');
        this.ensureInitialized();

        const results = new Map<string, EscrowState | null>();

        // Batch requests for efficiency
        const batchSize = 100;
        for (let i = 0; i < escrowPdas.length; i += batchSize) {
            const batch = escrowPdas.slice(i, i + batchSize);

            await this.rateLimiter.acquire();

            const accounts = await this.pool.execute(async (connection) => {
                return connection.getMultipleAccountsInfo(batch);
            });

            batch.forEach((pda, index) => {
                const accountInfo = accounts[index];
                if (accountInfo) {
                    try {
                        results.set(pda.toBase58(), parseEscrowState(accountInfo.data, pda));
                    } catch (error) {
                        this.logger.warn('Failed to parse escrow state', {
                            pda: pda.toBase58(),
                            error: error instanceof Error ? error.message : String(error)
                        });
                        results.set(pda.toBase58(), null);
                    }
                } else {
                    results.set(pda.toBase58(), null);
                }
            });
        }

        return results;
    }

    /**
     * Get recent escrow transactions
     */
    async getRecentTransactions(filter?: TransactionFilter): Promise<ParsedTransaction[]> {
        this.ensureInitialized();
        await this.rateLimiter.acquire();

        const limit = filter?.limit ?? 50;

        return this.pool.execute(async (connection) => {
            const signatures = await connection.getSignaturesForAddress(
                this.programId,
                { limit }
            );

            const transactions: ParsedTransaction[] = [];

            for (const sig of signatures) {
                await this.rateLimiter.acquire();

                try {
                    const tx = await connection.getParsedTransaction(sig.signature, {
                        maxSupportedTransactionVersion: 0
                    });

                    if (!tx) continue;

                    // Convert to enhanced format
                    const sigWithTime = {
                        signature: sig.signature,
                        slot: sig.slot,
                        blockTime: sig.blockTime ?? null
                    };
                    const enhanced = this.convertToEnhancedFormat(tx, sigWithTime);
                    const parsed = parseTransaction(enhanced);

                    // Apply filters
                    if (this.matchesFilter(parsed, filter)) {
                        transactions.push(parsed);
                    }
                } catch (error) {
                    this.logger.warn('Failed to fetch/parse transaction', {
                        signature: sig.signature,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    continue;
                }
            }

            return transactions;
        });
    }

    /**
     * Get transaction by signature
     */
    async getTransaction(signature: string): Promise<ParsedTransaction | null> {
        validateSignature(signature);
        this.ensureInitialized();
        await this.rateLimiter.acquire();

        return this.pool.execute(async (connection) => {
            const tx = await connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0
            });

            if (!tx) return null;

            const sigInfo = { signature, slot: tx.slot, blockTime: tx.blockTime ?? null };
            const enhanced = this.convertToEnhancedFormat(tx, sigInfo);
            return parseTransaction(enhanced);
        });
    }

    /**
     * Get escrow transaction history
     */
    async getEscrowHistory(transactionId: string): Promise<{
        transactions: ParsedTransaction[];
        lifecycle: ReturnType<typeof calculateEscrowLifecycle>;
    }> {
        validateTransactionId(transactionId);
        const { pda } = this.deriveEscrowPDA(transactionId);

        // Get all transactions involving this escrow
        const allTxs = await this.getRecentTransactions({ limit: 100 });
        const escrowTxs = allTxs.filter(tx => tx.escrowPda === pda.toBase58());

        return {
            transactions: escrowTxs,
            lifecycle: calculateEscrowLifecycle(escrowTxs)
        };
    }

    /**
     * Get priority fee estimate
     */
    async getPriorityFee(accounts: PublicKey[]): Promise<PriorityFeeEstimate> {
        validatePublicKeys(accounts, 'accounts');
        return this.feeCalculator.getEstimate(accounts);
    }

    /**
     * Calculate fee for operation
     */
    async getOperationFee(
        operation: keyof typeof COMPUTE_UNITS,
        escrowPda: PublicKey,
        strategy: FeeStrategy = 'standard'
    ): Promise<{
        priorityFee: number;
        computeUnits: number;
        totalFee: number;
    }> {
        validatePublicKey(escrowPda, 'escrowPda');
        return this.feeCalculator.getOperationFee(operation, escrowPda, [], strategy);
    }

    /**
     * Subscribe to escrow state changes
     */
    async subscribeToEscrow(
        escrowPda: PublicKey,
        options: SubscriptionOptions
    ): Promise<Subscription> {
        validatePublicKey(escrowPda, 'escrowPda');
        this.ensureInitialized();

        const connection = this.pool.getConnection();

        this.logger.debug('Subscribing to escrow', {
            escrowPda: escrowPda.toBase58()
        });

        const subscriptionId = connection.onAccountChange(
            escrowPda,
            async (accountInfo) => {
                try {
                    const state = parseEscrowState(accountInfo.data, escrowPda);
                    this.logger.debug('Escrow state changed', {
                        escrowPda: escrowPda.toBase58(),
                        status: state.status
                    });
                    options.onStateChange(state);
                } catch (error) {
                    this.logger.error('Error parsing escrow state', {
                        escrowPda: escrowPda.toBase58(),
                        error: error instanceof Error ? error.message : String(error)
                    });
                    if (options.onError) {
                        options.onError(error instanceof Error ? error : new Error(String(error)));
                    }
                }
            },
            options.commitment ?? this.config.commitment
        );

        const subscription: Subscription = {
            id: subscriptionId,
            escrowPda,
            unsubscribe: async () => {
                this.logger.debug('Unsubscribing from escrow', {
                    escrowPda: escrowPda.toBase58(),
                    subscriptionId
                });
                await connection.removeAccountChangeListener(subscriptionId);
                this.subscriptions.delete(subscriptionId);
            }
        };

        this.subscriptions.set(subscriptionId, subscription);
        this.logger.info('Subscribed to escrow', {
            escrowPda: escrowPda.toBase58(),
            subscriptionId
        });
        return subscription;
    }

    /**
     * Unsubscribe from all escrow subscriptions
     */
    async unsubscribeAll(): Promise<void> {
        const unsubscribePromises = Array.from(this.subscriptions.values()).map(
            sub => sub.unsubscribe()
        );
        await Promise.all(unsubscribePromises);
        this.subscriptions.clear();
    }

    /**
     * Fetch using Helius Enhanced API
     */
    async fetchEnhancedTransactions(signatures: string[]): Promise<HeliusEnhancedTransaction[]> {
        validateSignatures(signatures);
        await this.rateLimiter.acquire();

        const endpoint = `${HELIUS_API_ENDPOINTS[this.config.cluster]}/transactions`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULTS.CONNECTION_TIMEOUT_MS);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({ transactions: signatures }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new HeliusAdapterError(
                    `Helius API error: ${response.status} ${response.statusText}`,
                    'API_ERROR'
                );
            }

            const data = await response.json();
            return data as HeliusEnhancedTransaction[];
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                this.logger.warn('Helius API request timeout', {
                    timeout: DEFAULTS.CONNECTION_TIMEOUT_MS,
                    signatureCount: signatures.length
                });
                throw new HeliusAdapterError(
                    `Request timeout after ${DEFAULTS.CONNECTION_TIMEOUT_MS}ms`,
                    'TIMEOUT'
                );
            }
            this.logger.error('Helius API request failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Get protocol statistics
     */
    async getProtocolStats(sampleSize: number = 50): Promise<{
        totalEscrows: number;
        activeEscrows: number;
        disputedEscrows: number;
        resolvedEscrows: number;
        averageQualityScore: number | null;
        totalVolume: bigint;
    }> {
        validatePositiveInteger(sampleSize, 'sampleSize');
        const transactions = await this.getRecentTransactions({ limit: Math.min(sampleSize, 100) });
        const grouped = groupByEscrow(transactions);

        let activeCount = 0;
        let disputedCount = 0;
        let resolvedCount = 0;
        let totalVolume = 0n;
        const qualityScores: number[] = [];

        for (const [_, txs] of grouped) {
            const lifecycle = calculateEscrowLifecycle(txs);

            if (lifecycle.released || lifecycle.closed) {
                resolvedCount++;
            } else if (lifecycle.disputed) {
                disputedCount++;
            } else if (lifecycle.funded) {
                activeCount++;
            }

            if (lifecycle.totalAmount) {
                totalVolume += lifecycle.totalAmount;
            }

            if (lifecycle.finalQualityScore !== null) {
                qualityScores.push(lifecycle.finalQualityScore);
            }
        }

        const averageQualityScore = qualityScores.length > 0
            ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
            : null;

        return {
            totalEscrows: grouped.size,
            activeEscrows: activeCount,
            disputedEscrows: disputedCount,
            resolvedEscrows: resolvedCount,
            averageQualityScore,
            totalVolume
        };
    }

    /**
     * Get connection pool statistics
     */
    getPoolStats() {
        return this.pool.getStats();
    }

    /**
     * Get rate limiter statistics
     */
    getRateLimiterStats() {
        return this.rateLimiter.getStats();
    }

    /**
     * Shutdown the client
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down client');
        await this.unsubscribeAll();
        this.pool.shutdown();
        this.rateLimiter.clear();
        this.feeCalculator.clearCache();
        this.initialized = false;
        this.logger.info('Client shutdown complete');
    }

    // Private methods

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new ConnectionError('Client not initialized. Call init() first.');
        }
    }

    private matchesFilter(tx: ParsedTransaction, filter?: TransactionFilter): boolean {
        if (!filter) return true;

        if (filter.type && !filter.type.includes(tx.type)) {
            return false;
        }

        if (filter.escrowPda && tx.escrowPda !== filter.escrowPda) {
            return false;
        }

        if (filter.minTimestamp && tx.timestamp < filter.minTimestamp) {
            return false;
        }

        if (filter.maxTimestamp && tx.timestamp > filter.maxTimestamp) {
            return false;
        }

        return true;
    }

    private convertToEnhancedFormat(
        tx: Awaited<ReturnType<Connection['getParsedTransaction']>>,
        sigInfo: { signature: string; slot: number; blockTime: number | null }
    ): HeliusEnhancedTransaction {
        // Extract basic data from parsed transaction
        const instructions = tx?.transaction.message.instructions.map(ix => {
            if ('programId' in ix && 'accounts' in ix && 'data' in ix) {
                return {
                    programId: ix.programId.toBase58(),
                    accounts: ix.accounts?.map(a => a.toBase58()) ?? [],
                    data: ix.data ?? '',
                    innerInstructions: []
                };
            }
            return {
                programId: (ix as { programId: PublicKey }).programId?.toBase58() ?? '',
                accounts: [],
                data: '',
                innerInstructions: []
            };
        }) ?? [];

        const nativeTransfers: HeliusEnhancedTransaction['nativeTransfers'] = [];

        // Extract native transfers from pre/post balances
        const preBalances = tx?.meta?.preBalances ?? [];
        const postBalances = tx?.meta?.postBalances ?? [];
        const accountKeys = tx?.transaction.message.accountKeys ?? [];

        for (let i = 0; i < accountKeys.length; i++) {
            const diff = (postBalances[i] ?? 0) - (preBalances[i] ?? 0);
            if (diff !== 0) {
                // Find the source/dest of transfer
                for (let j = 0; j < accountKeys.length; j++) {
                    if (i === j) continue;
                    const otherDiff = (postBalances[j] ?? 0) - (preBalances[j] ?? 0);
                    if (otherDiff === -diff && diff > 0) {
                        nativeTransfers.push({
                            fromUserAccount: accountKeys[j].pubkey.toBase58(),
                            toUserAccount: accountKeys[i].pubkey.toBase58(),
                            amount: diff
                        });
                        break;
                    }
                }
            }
        }

        return {
            signature: sigInfo.signature,
            slot: sigInfo.slot,
            timestamp: sigInfo.blockTime ?? Math.floor(Date.now() / 1000),
            fee: tx?.meta?.fee ?? 0,
            feePayer: accountKeys[0]?.pubkey.toBase58() ?? '',
            instructions,
            accountData: [],
            nativeTransfers,
            tokenTransfers: [],
            events: {},
            transactionError: tx?.meta?.err ? JSON.stringify(tx.meta.err) : null
        };
    }
}
