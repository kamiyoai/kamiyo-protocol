/**
 * KAMIYO Transaction Parser
 * Parse escrow transactions from Helius Enhanced API responses
 */

import { PublicKey } from '@solana/web3.js';

const KAMIYO_PROGRAM_ID = 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n';

interface ParsedEscrowTransaction {
    signature: string;
    type: 'initialize' | 'fund' | 'dispute' | 'resolve' | 'release' | 'unknown';
    escrowPda: string | null;
    agent: string | null;
    provider: string | null;
    amount: number | null;
    qualityScore: number | null;
    refundAmount: number | null;
    timestamp: number;
    slot: number;
    success: boolean;
}

interface HeliusEnhancedTransaction {
    signature: string;
    slot: number;
    timestamp: number;
    fee: number;
    feePayer: string;
    instructions: Array<{
        programId: string;
        accounts: string[];
        data: string;
    }>;
    accountData: Array<{
        account: string;
        nativeBalanceChange: number;
    }>;
    nativeTransfers: Array<{
        fromUserAccount: string;
        toUserAccount: string;
        amount: number;
    }>;
    events: {
        nft?: unknown;
        swap?: unknown;
        compressed?: unknown;
    };
    transactionError: string | null;
}

// Log message patterns for identifying transaction types
const LOG_PATTERNS = {
    INITIALIZE: /Escrow created|InitializeEscrow/i,
    FUND: /Escrow funded|FundEscrow/i,
    DISPUTE: /Dispute initiated|InitiateDispute/i,
    RESOLVE: /Dispute resolved|ResolveDispute|Oracle assessment/i,
    RELEASE: /Funds released|ReleaseFunds/i
};

/**
 * Parse a single transaction into escrow data
 */
export function parseKamiyoTransaction(tx: HeliusEnhancedTransaction): ParsedEscrowTransaction {
    const kamiyoIx = tx.instructions.find(ix => ix.programId === KAMIYO_PROGRAM_ID);

    if (!kamiyoIx) {
        return {
            signature: tx.signature,
            type: 'unknown',
            escrowPda: null,
            agent: null,
            provider: null,
            amount: null,
            qualityScore: null,
            refundAmount: null,
            timestamp: tx.timestamp,
            slot: tx.slot,
            success: tx.transactionError === null
        };
    }

    const type = inferTransactionType(kamiyoIx.data);
    const accounts = kamiyoIx.accounts;

    // Account layout varies by instruction type
    const parsed: ParsedEscrowTransaction = {
        signature: tx.signature,
        type,
        escrowPda: accounts[0] || null,
        agent: null,
        provider: null,
        amount: null,
        qualityScore: null,
        refundAmount: null,
        timestamp: tx.timestamp,
        slot: tx.slot,
        success: tx.transactionError === null
    };

    switch (type) {
        case 'initialize':
            parsed.agent = accounts[1] || null;
            parsed.provider = accounts[2] || null;
            break;

        case 'fund':
            const escrowTransfer = tx.nativeTransfers.find(
                t => t.toUserAccount === accounts[0]
            );
            parsed.amount = escrowTransfer?.amount || null;
            break;

        case 'resolve':
            parsed.qualityScore = extractQualityScore(kamiyoIx.data);
            parsed.refundAmount = extractRefundAmount(kamiyoIx.data);
            break;

        case 'release':
            const releaseTransfer = tx.nativeTransfers.find(
                t => t.fromUserAccount === accounts[0]
            );
            parsed.amount = releaseTransfer?.amount || null;
            break;
    }

    return parsed;
}

/**
 * Parse multiple transactions
 */
export function parseKamiyoTransactions(txs: HeliusEnhancedTransaction[]): ParsedEscrowTransaction[] {
    return txs
        .map(parseKamiyoTransaction)
        .filter(tx => tx.type !== 'unknown');
}

/**
 * Infer transaction type from instruction discriminator
 */
function inferTransactionType(data: string): ParsedEscrowTransaction['type'] {
    if (!data || data.length < 16) return 'unknown';

    const discriminator = data.slice(0, 16);

    // These are example discriminators - actual values depend on program implementation
    const DISCRIMINATORS: Record<string, ParsedEscrowTransaction['type']> = {
        'c3e9e1cc9a7e5f47': 'initialize',
        'a1b2c3d4e5f6a7b8': 'fund',
        'b2c3d4e5f6a7b8c9': 'dispute',
        'c3d4e5f6a7b8c9d0': 'resolve',
        'd4e5f6a7b8c9d0e1': 'release'
    };

    return DISCRIMINATORS[discriminator] || 'unknown';
}

/**
 * Extract quality score from instruction data
 */
function extractQualityScore(data: string): number | null {
    if (data.length < 50) return null;
    // Quality score at byte offset 24 (after discriminator + escrow_id)
    const scoreByte = data.slice(48, 50);
    const score = parseInt(scoreByte, 16);
    return isNaN(score) ? null : score;
}

/**
 * Extract refund amount from instruction data
 */
function extractRefundAmount(data: string): number | null {
    if (data.length < 66) return null;
    // Refund amount as u64 at byte offset 25
    const amountHex = data.slice(50, 66);
    const amount = parseInt(amountHex, 16);
    return isNaN(amount) ? null : amount;
}

/**
 * Group transactions by escrow PDA
 */
export function groupByEscrow(txs: ParsedEscrowTransaction[]): Map<string, ParsedEscrowTransaction[]> {
    const grouped = new Map<string, ParsedEscrowTransaction[]>();

    for (const tx of txs) {
        if (!tx.escrowPda) continue;

        const existing = grouped.get(tx.escrowPda) || [];
        existing.push(tx);
        grouped.set(tx.escrowPda, existing);
    }

    // Sort each group by timestamp
    for (const [pda, txList] of grouped) {
        grouped.set(pda, txList.sort((a, b) => a.timestamp - b.timestamp));
    }

    return grouped;
}

/**
 * Calculate escrow lifecycle from grouped transactions
 */
export function calculateEscrowLifecycle(txs: ParsedEscrowTransaction[]): {
    created: number | null;
    funded: number | null;
    disputed: number | null;
    resolved: number | null;
    released: number | null;
    duration: number | null;
    finalQualityScore: number | null;
    totalAmount: number | null;
} {
    const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);

    const created = sorted.find(t => t.type === 'initialize')?.timestamp || null;
    const funded = sorted.find(t => t.type === 'fund')?.timestamp || null;
    const disputed = sorted.find(t => t.type === 'dispute')?.timestamp || null;
    const resolved = sorted.find(t => t.type === 'resolve')?.timestamp || null;
    const released = sorted.find(t => t.type === 'release')?.timestamp || null;

    const resolveTx = sorted.find(t => t.type === 'resolve');
    const fundTx = sorted.find(t => t.type === 'fund');

    const endTime = released || resolved || Date.now() / 1000;
    const duration = created ? endTime - created : null;

    return {
        created,
        funded,
        disputed,
        resolved,
        released,
        duration,
        finalQualityScore: resolveTx?.qualityScore || null,
        totalAmount: fundTx?.amount || null
    };
}

export default {
    parseKamiyoTransaction,
    parseKamiyoTransactions,
    groupByEscrow,
    calculateEscrowLifecycle
};
