/**
 * KAMIYO Helius Adapter - Priority Fee Calculator
 * Optimal fee estimation for escrow operations
 */

import { PublicKey, Connection } from '@solana/web3.js';
import {
    PriorityFeeEstimate,
    PriorityFeeLevels,
    FeeStrategy,
    HeliusPriorityFeeResponse,
    HeliusAdapterError
} from './types';
import { FEE_STRATEGIES, COMPUTE_UNITS, DEFAULTS, HELIUS_ENDPOINTS } from './constants';

interface FeeCache {
    estimate: PriorityFeeEstimate;
    timestamp: number;
}

const MAX_CACHE_SIZE = 1000;

export class PriorityFeeCalculator {
    private readonly apiKey: string;
    private readonly cluster: 'mainnet-beta' | 'devnet';
    private cache: Map<string, FeeCache> = new Map();
    private readonly cacheTtlMs: number;
    private readonly timeoutMs: number;

    constructor(
        apiKey: string,
        cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta',
        cacheTtlMs: number = DEFAULTS.FEE_CACHE_TTL_MS,
        timeoutMs: number = DEFAULTS.CONNECTION_TIMEOUT_MS
    ) {
        this.apiKey = apiKey;
        this.cluster = cluster;
        this.cacheTtlMs = cacheTtlMs;
        this.timeoutMs = timeoutMs;
    }

    /**
     * Get priority fee estimate from Helius
     */
    async getEstimate(accounts: PublicKey[]): Promise<PriorityFeeEstimate> {
        const cacheKey = accounts.map(a => a.toBase58()).sort().join(',');
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
            return cached.estimate;
        }

        const endpoint = `${HELIUS_ENDPOINTS[this.cluster]}/?api-key=${this.apiKey}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    method: 'getPriorityFeeEstimate',
                    params: [{
                        accountKeys: accounts.map(a => a.toBase58()),
                        options: {
                            includeAllPriorityFeeLevels: true,
                            recommended: true,
                            evaluateEmptySlotAsZero: true
                        }
                    }]
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new HeliusAdapterError(
                    `Helius API error: ${response.status} ${response.statusText}`,
                    'API_ERROR'
                );
            }

            const data = await response.json() as HeliusPriorityFeeResponse;

            if (data.error) {
                throw new HeliusAdapterError(
                    `Helius API error: ${data.error.message}`,
                    'API_ERROR'
                );
            }

            const result = data.result;
            const levels: PriorityFeeLevels = result.priorityFeeLevels ?? {
                min: 0,
                low: Math.floor(result.priorityFeeEstimate * 0.5),
                medium: result.priorityFeeEstimate,
                high: Math.floor(result.priorityFeeEstimate * 1.5),
                veryHigh: Math.floor(result.priorityFeeEstimate * 2.5),
                unsafeMax: Math.floor(result.priorityFeeEstimate * 5)
            };

            const estimate: PriorityFeeEstimate = {
                levels,
                recommended: result.priorityFeeEstimate,
                percentiles: result.percentiles ?? {},
                timestamp: Date.now()
            };

            // Evict oldest entries if cache is full
            if (this.cache.size >= MAX_CACHE_SIZE) {
                const oldestKey = this.cache.keys().next().value;
                if (oldestKey) this.cache.delete(oldestKey);
            }

            this.cache.set(cacheKey, { estimate, timestamp: Date.now() });

            return estimate;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new HeliusAdapterError(
                    `Request timeout after ${this.timeoutMs}ms`,
                    'TIMEOUT'
                );
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Calculate fee for a specific operation and strategy
     */
    async calculateFee(
        accounts: PublicKey[],
        strategy: FeeStrategy = 'standard'
    ): Promise<number> {
        const estimate = await this.getEstimate(accounts);
        const config = FEE_STRATEGIES[strategy];

        const baseFee = estimate.recommended * config.multiplier;
        return Math.min(Math.ceil(baseFee), config.maxFee);
    }

    /**
     * Get fee for specific escrow operation
     */
    async getOperationFee(
        operation: keyof typeof COMPUTE_UNITS,
        escrowPda: PublicKey,
        additionalAccounts: PublicKey[] = [],
        strategy: FeeStrategy = 'standard'
    ): Promise<{
        priorityFee: number;
        computeUnits: number;
        totalFee: number;
    }> {
        const accounts = [escrowPda, ...additionalAccounts];
        const priorityFee = await this.calculateFee(accounts, strategy);
        const computeUnits = COMPUTE_UNITS[operation];

        // Calculate micro-lamports per compute unit
        const microLamportsPerCU = Math.ceil((priorityFee * 1_000_000) / computeUnits);

        // Total priority fee in lamports
        const totalPriorityFee = Math.ceil((microLamportsPerCU * computeUnits) / 1_000_000);

        // Base transaction fee (5000 lamports)
        const baseFee = 5000;

        return {
            priorityFee: microLamportsPerCU,
            computeUnits,
            totalFee: baseFee + totalPriorityFee
        };
    }

    /**
     * Get fees for all strategies
     */
    async getAllStrategyFees(
        accounts: PublicKey[]
    ): Promise<Record<FeeStrategy, number>> {
        const estimate = await this.getEstimate(accounts);

        const result: Record<FeeStrategy, number> = {
            economy: 0,
            standard: 0,
            fast: 0,
            urgent: 0,
            critical: 0
        };

        for (const [name, config] of Object.entries(FEE_STRATEGIES)) {
            const baseFee = estimate.recommended * config.multiplier;
            result[name as FeeStrategy] = Math.min(Math.ceil(baseFee), config.maxFee);
        }

        return result;
    }

    /**
     * Get historical fee data from recent transactions
     */
    async getHistoricalFees(
        connection: Connection,
        programId: PublicKey,
        sampleSize: number = 50
    ): Promise<{
        average: number;
        median: number;
        min: number;
        max: number;
        samples: number;
        errors: number;
    }> {
        const signatures = await connection.getSignaturesForAddress(programId, {
            limit: sampleSize
        });

        const fees: number[] = [];
        let errorCount = 0;

        for (const sig of signatures) {
            try {
                const tx = await connection.getTransaction(sig.signature, {
                    maxSupportedTransactionVersion: 0
                });

                if (tx?.meta?.fee) {
                    // Extract priority fee (total fee - base fee)
                    const baseFee = 5000;
                    const priorityFee = tx.meta.fee - baseFee;
                    if (priorityFee > 0) {
                        fees.push(priorityFee);
                    }
                }
            } catch {
                errorCount++;
                continue;
            }
        }

        if (fees.length === 0) {
            return { average: 1000, median: 1000, min: 0, max: 0, samples: 0, errors: errorCount };
        }

        const sorted = fees.sort((a, b) => a - b);
        const sum = fees.reduce((a, b) => a + b, 0);

        return {
            average: Math.ceil(sum / fees.length),
            median: sorted[Math.floor(sorted.length / 2)],
            min: sorted[0],
            max: sorted[sorted.length - 1],
            samples: fees.length,
            errors: errorCount
        };
    }

    /**
     * Clear the fee cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        entries: Array<{ key: string; age: number }>;
    } {
        const now = Date.now();
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.entries()).map(([key, value]) => ({
                key: key.slice(0, 20) + '...',
                age: now - value.timestamp
            }))
        };
    }
}
