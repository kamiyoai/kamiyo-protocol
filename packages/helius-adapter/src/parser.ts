/**
 * KAMIYO Helius Adapter - Transaction Parser
 * Parse escrow transactions from Helius Enhanced API
 */

import { PublicKey } from '@solana/web3.js';
import {
    ParsedTransaction,
    TransactionType,
    HeliusEnhancedTransaction,
    EscrowState,
    EscrowStatus,
    ParseError
} from './types';
import {
    KAMIYO_PROGRAM_ID,
    INSTRUCTION_DISCRIMINATORS,
    STATUS_MAP,
    LOG_PATTERNS
} from './constants';

/**
 * Parse a Helius enhanced transaction into KAMIYO transaction data
 */
export function parseTransaction(tx: HeliusEnhancedTransaction): ParsedTransaction {
    const kamiyoIx = tx.instructions.find(ix => ix.programId === KAMIYO_PROGRAM_ID);

    if (!kamiyoIx) {
        return createUnknownTransaction(tx);
    }

    const type = inferTransactionType(kamiyoIx.data);
    const accounts = kamiyoIx.accounts;

    const parsed: ParsedTransaction = {
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
        success: tx.transactionError === null,
        error: tx.transactionError
    };

    // Extract additional data based on transaction type
    switch (type) {
        case 'initialize_escrow':
            parsed.agent = accounts[1] || null;
            parsed.provider = accounts[2] || null;
            parsed.amount = extractAmount(kamiyoIx.data, 8);
            break;

        case 'fund_escrow':
            const fundTransfer = tx.nativeTransfers.find(
                t => t.toUserAccount === accounts[0]
            );
            parsed.amount = fundTransfer ? BigInt(fundTransfer.amount) : null;
            break;

        case 'resolve_dispute':
            parsed.qualityScore = extractByte(kamiyoIx.data, 8);
            parsed.refundAmount = extractAmount(kamiyoIx.data, 9);
            break;

        case 'release_funds':
            const releaseTransfer = tx.nativeTransfers.find(
                t => t.fromUserAccount === accounts[0]
            );
            parsed.amount = releaseTransfer ? BigInt(releaseTransfer.amount) : null;
            break;
    }

    return parsed;
}

/**
 * Parse multiple transactions
 */
export function parseTransactions(txs: HeliusEnhancedTransaction[]): ParsedTransaction[] {
    return txs.map(parseTransaction);
}

/**
 * Filter transactions by KAMIYO program
 */
export function filterKamiyoTransactions(txs: HeliusEnhancedTransaction[]): HeliusEnhancedTransaction[] {
    return txs.filter(tx =>
        tx.instructions.some(ix => ix.programId === KAMIYO_PROGRAM_ID)
    );
}

/**
 * Infer transaction type from instruction data
 */
function inferTransactionType(data: string): TransactionType {
    if (!data || data.length < 16) return 'unknown';

    // Decode base64 or hex data
    let buffer: Buffer;
    try {
        // Try base64 first (Helius usually returns base64)
        buffer = Buffer.from(data, 'base64');
        if (buffer.length < 8) {
            // Try hex
            buffer = Buffer.from(data, 'hex');
        }
    } catch {
        try {
            buffer = Buffer.from(data, 'hex');
        } catch {
            return 'unknown';
        }
    }

    if (buffer.length < 8) return 'unknown';

    const discriminator = buffer.slice(0, 8);

    for (const [name, expected] of Object.entries(INSTRUCTION_DISCRIMINATORS)) {
        if (discriminator.equals(expected)) {
            return name.toLowerCase().replace(/_/g, '_') as TransactionType;
        }
    }

    return 'unknown';
}

/**
 * Parse escrow account data
 */
export function parseEscrowState(
    accountData: Buffer,
    pda: PublicKey
): EscrowState {
    if (accountData.length < 100) {
        throw new ParseError(`Invalid escrow account data length: ${accountData.length}`);
    }

    try {
        let offset = 8; // Skip discriminator

        const agent = new PublicKey(accountData.slice(offset, offset + 32));
        offset += 32;

        const provider = new PublicKey(accountData.slice(offset, offset + 32));
        offset += 32;

        const amount = accountData.readBigUInt64LE(offset);
        offset += 8;

        const statusByte = accountData.readUInt8(offset);
        offset += 1;

        const qualityScoreByte = accountData.readUInt8(offset);
        offset += 1;

        const refundAmount = accountData.readBigUInt64LE(offset);
        offset += 8;

        const timeLock = accountData.readUInt32LE(offset);
        offset += 4;

        const createdAt = Number(accountData.readBigInt64LE(offset));
        offset += 8;

        const updatedAt = Number(accountData.readBigInt64LE(offset));

        return {
            id: pda.toBase58().slice(0, 8),
            pda,
            agent,
            provider,
            amount,
            status: (STATUS_MAP[statusByte] || 'active') as EscrowStatus,
            qualityScore: qualityScoreByte > 0 ? qualityScoreByte : null,
            refundAmount: refundAmount > 0n ? refundAmount : null,
            timeLock,
            createdAt,
            updatedAt
        };
    } catch (error) {
        throw new ParseError(
            `Failed to parse escrow state: ${error instanceof Error ? error.message : 'Unknown error'}`,
            error instanceof Error ? error : undefined
        );
    }
}

/**
 * Group transactions by escrow PDA
 */
export function groupByEscrow(txs: ParsedTransaction[]): Map<string, ParsedTransaction[]> {
    const grouped = new Map<string, ParsedTransaction[]>();

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
 * Calculate escrow lifecycle from transaction history
 */
export function calculateEscrowLifecycle(txs: ParsedTransaction[]): {
    initialized: number | null;
    funded: number | null;
    disputed: number | null;
    resolved: number | null;
    released: number | null;
    closed: number | null;
    duration: number | null;
    finalQualityScore: number | null;
    totalAmount: bigint | null;
    wasDisputed: boolean;
} {
    const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);

    const findTimestamp = (type: TransactionType) =>
        sorted.find(t => t.type === type)?.timestamp ?? null;

    const initialized = findTimestamp('initialize_escrow');
    const funded = findTimestamp('fund_escrow');
    const disputed = findTimestamp('initiate_dispute');
    const resolved = findTimestamp('resolve_dispute');
    const released = findTimestamp('release_funds');
    const closed = findTimestamp('close_escrow');

    const endTime = closed || released || resolved || Date.now() / 1000;
    const duration = initialized ? Math.floor(endTime - initialized) : null;

    const resolveTx = sorted.find(t => t.type === 'resolve_dispute');
    const fundTx = sorted.find(t => t.type === 'fund_escrow');
    const initTx = sorted.find(t => t.type === 'initialize_escrow');

    return {
        initialized,
        funded,
        disputed,
        resolved,
        released,
        closed,
        duration,
        finalQualityScore: resolveTx?.qualityScore ?? null,
        totalAmount: fundTx?.amount ?? initTx?.amount ?? null,
        wasDisputed: disputed !== null
    };
}

/**
 * Detect transaction type from log messages
 */
export function detectTypeFromLogs(logs: string[]): TransactionType {
    const combinedLogs = logs.join('\n');

    if (LOG_PATTERNS.INITIALIZE.test(combinedLogs)) return 'initialize_escrow';
    if (LOG_PATTERNS.FUND.test(combinedLogs)) return 'fund_escrow';
    if (LOG_PATTERNS.DISPUTE.test(combinedLogs)) return 'initiate_dispute';
    if (LOG_PATTERNS.RESOLVE.test(combinedLogs)) return 'resolve_dispute';
    if (LOG_PATTERNS.RELEASE.test(combinedLogs)) return 'release_funds';
    if (LOG_PATTERNS.CLOSE.test(combinedLogs)) return 'close_escrow';

    return 'unknown';
}

/**
 * Extract quality score from log messages
 */
export function extractQualityScoreFromLogs(logs: string[]): number | null {
    for (const log of logs) {
        const match = log.match(/Quality\s*Score:\s*(\d+)/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    return null;
}

/**
 * Extract refund amount from log messages
 */
export function extractRefundFromLogs(logs: string[]): number | null {
    for (const log of logs) {
        const match = log.match(/Refund\s*(?:to\s*Agent)?:\s*([\d.]+)/i);
        if (match) {
            return parseFloat(match[1]);
        }
    }
    return null;
}

// Helper functions

function createUnknownTransaction(tx: HeliusEnhancedTransaction): ParsedTransaction {
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
        success: tx.transactionError === null,
        error: tx.transactionError
    };
}

function extractAmount(data: string, byteOffset: number): bigint | null {
    try {
        const buffer = Buffer.from(data, 'base64');
        if (buffer.length < byteOffset + 8) return null;
        return buffer.readBigUInt64LE(byteOffset);
    } catch {
        return null;
    }
}

function extractByte(data: string, byteOffset: number): number | null {
    try {
        const buffer = Buffer.from(data, 'base64');
        if (buffer.length <= byteOffset) return null;
        return buffer.readUInt8(byteOffset);
    } catch {
        return null;
    }
}
