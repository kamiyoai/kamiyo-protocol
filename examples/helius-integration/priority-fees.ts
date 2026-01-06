/**
 * KAMIYO Priority Fee Utilities
 * Optimal fee estimation for escrow operations using Helius
 */

import { PublicKey, Connection } from '@solana/web3.js';

interface PriorityFeeEstimate {
    min: number;
    low: number;
    medium: number;
    high: number;
    veryHigh: number;
    recommended: number;
}

interface FeeStrategy {
    name: string;
    multiplier: number;
    description: string;
}

const FEE_STRATEGIES: Record<string, FeeStrategy> = {
    // For non-urgent operations like initializing escrow
    STANDARD: {
        name: 'standard',
        multiplier: 1.0,
        description: 'Default fee for non-time-sensitive operations'
    },
    // For funded escrows awaiting resolution
    ELEVATED: {
        name: 'elevated',
        multiplier: 1.5,
        description: 'Higher priority for active escrows'
    },
    // For dispute resolution - time-sensitive
    URGENT: {
        name: 'urgent',
        multiplier: 2.0,
        description: 'High priority for dispute-related transactions'
    },
    // For releasing funds after oracle resolution
    CRITICAL: {
        name: 'critical',
        multiplier: 3.0,
        description: 'Maximum priority for fund releases'
    }
};

/**
 * Get priority fee estimate from Helius
 */
export async function getPriorityFeeEstimate(
    heliusApiKey: string,
    accountKeys: PublicKey[],
    cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<PriorityFeeEstimate> {
    const rpcUrl = cluster === 'mainnet-beta'
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;

    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'priority-fee-estimate',
            method: 'getPriorityFeeEstimate',
            params: [{
                accountKeys: accountKeys.map(k => k.toBase58()),
                options: {
                    includeAllPriorityFeeLevels: true,
                    recommended: true
                }
            }]
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(`Helius API error: ${data.error.message}`);
    }

    const result = data.result;

    return {
        min: result.priorityFeeLevels?.min || 0,
        low: result.priorityFeeLevels?.low || 100,
        medium: result.priorityFeeLevels?.medium || 1000,
        high: result.priorityFeeLevels?.high || 10000,
        veryHigh: result.priorityFeeLevels?.veryHigh || 100000,
        recommended: result.priorityFeeEstimate || 1000
    };
}

/**
 * Calculate fee for specific escrow operation
 */
export async function getEscrowOperationFee(
    heliusApiKey: string,
    operation: 'initialize' | 'fund' | 'dispute' | 'resolve' | 'release',
    escrowPda: PublicKey,
    additionalAccounts: PublicKey[] = []
): Promise<number> {
    const accounts = [escrowPda, ...additionalAccounts];
    const estimate = await getPriorityFeeEstimate(heliusApiKey, accounts);

    // Select strategy based on operation type
    let strategy: FeeStrategy;
    switch (operation) {
        case 'initialize':
        case 'fund':
            strategy = FEE_STRATEGIES.STANDARD;
            break;
        case 'dispute':
            strategy = FEE_STRATEGIES.ELEVATED;
            break;
        case 'resolve':
            strategy = FEE_STRATEGIES.URGENT;
            break;
        case 'release':
            strategy = FEE_STRATEGIES.CRITICAL;
            break;
        default:
            strategy = FEE_STRATEGIES.STANDARD;
    }

    return Math.ceil(estimate.recommended * strategy.multiplier);
}

/**
 * Get recent priority fees for KAMIYO program
 */
export async function getRecentProgramFees(
    connection: Connection,
    programId: PublicKey,
    limit: number = 50
): Promise<{
    average: number;
    median: number;
    min: number;
    max: number;
    samples: number;
}> {
    const signatures = await connection.getSignaturesForAddress(programId, { limit });

    const fees: number[] = [];

    for (const sig of signatures) {
        try {
            const tx = await connection.getTransaction(sig.signature, {
                maxSupportedTransactionVersion: 0
            });

            if (tx?.meta?.computeUnitsConsumed && tx.meta.fee) {
                // Calculate effective priority fee
                const baseFee = 5000; // Base fee in lamports
                const priorityFee = tx.meta.fee - baseFee;
                if (priorityFee > 0) {
                    fees.push(priorityFee);
                }
            }
        } catch {
            continue;
        }
    }

    if (fees.length === 0) {
        return { average: 1000, median: 1000, min: 0, max: 0, samples: 0 };
    }

    const sorted = fees.sort((a, b) => a - b);
    const sum = fees.reduce((a, b) => a + b, 0);

    return {
        average: Math.ceil(sum / fees.length),
        median: sorted[Math.floor(sorted.length / 2)],
        min: sorted[0],
        max: sorted[sorted.length - 1],
        samples: fees.length
    };
}

/**
 * Dynamic fee calculator based on network conditions
 */
export class DynamicFeeCalculator {
    private heliusApiKey: string;
    private cluster: 'mainnet-beta' | 'devnet';
    private cache: Map<string, { estimate: PriorityFeeEstimate; timestamp: number }>;
    private cacheTtlMs: number;

    constructor(options: {
        heliusApiKey: string;
        cluster?: 'mainnet-beta' | 'devnet';
        cacheTtlMs?: number;
    }) {
        this.heliusApiKey = options.heliusApiKey;
        this.cluster = options.cluster || 'mainnet-beta';
        this.cacheTtlMs = options.cacheTtlMs || 10000; // 10 second cache
        this.cache = new Map();
    }

    /**
     * Get fee with caching
     */
    async getFee(
        accounts: PublicKey[],
        strategy: keyof typeof FEE_STRATEGIES = 'STANDARD'
    ): Promise<number> {
        const cacheKey = accounts.map(a => a.toBase58()).sort().join(',');
        const cached = this.cache.get(cacheKey);

        let estimate: PriorityFeeEstimate;

        if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
            estimate = cached.estimate;
        } else {
            estimate = await getPriorityFeeEstimate(
                this.heliusApiKey,
                accounts,
                this.cluster
            );
            this.cache.set(cacheKey, { estimate, timestamp: Date.now() });
        }

        const multiplier = FEE_STRATEGIES[strategy].multiplier;
        return Math.ceil(estimate.recommended * multiplier);
    }

    /**
     * Clear fee cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}

/**
 * Compute unit estimation for KAMIYO operations
 */
export const COMPUTE_UNITS = {
    INITIALIZE_ESCROW: 50000,
    FUND_ESCROW: 30000,
    INITIATE_DISPUTE: 40000,
    RESOLVE_DISPUTE: 80000,  // Higher due to oracle verification
    RELEASE_FUNDS: 60000,
    CLOSE_ESCROW: 25000
} as const;

/**
 * Calculate total transaction cost
 */
export function calculateTransactionCost(
    operation: keyof typeof COMPUTE_UNITS,
    priorityFeePerCU: number
): {
    baseFee: number;
    priorityFee: number;
    totalFee: number;
} {
    const baseFee = 5000; // Base transaction fee
    const computeUnits = COMPUTE_UNITS[operation];
    const priorityFee = Math.ceil((computeUnits * priorityFeePerCU) / 1_000_000);

    return {
        baseFee,
        priorityFee,
        totalFee: baseFee + priorityFee
    };
}

export default {
    getPriorityFeeEstimate,
    getEscrowOperationFee,
    getRecentProgramFees,
    DynamicFeeCalculator,
    COMPUTE_UNITS,
    calculateTransactionCost,
    FEE_STRATEGIES
};
