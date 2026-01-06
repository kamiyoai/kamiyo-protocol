/**
 * KAMIYO Helius Adapter - Type Definitions
 */

import { PublicKey, Commitment } from '@solana/web3.js';

// Configuration
export interface HeliusConfig {
    apiKey: string;
    cluster?: 'mainnet-beta' | 'devnet';
    commitment?: Commitment;
    maxRetries?: number;
    retryDelayMs?: number;
    rateLimitRps?: number;
    enableWebsocket?: boolean;
}

export interface ConnectionPoolConfig {
    maxConnections?: number;
    healthCheckIntervalMs?: number;
    connectionTimeoutMs?: number;
}

// Escrow Types
export type EscrowStatus = 'active' | 'funded' | 'disputed' | 'resolved' | 'released' | 'expired';

export interface EscrowState {
    id: string;
    pda: PublicKey;
    agent: PublicKey;
    provider: PublicKey;
    amount: bigint;
    status: EscrowStatus;
    qualityScore: number | null;
    refundAmount: bigint | null;
    timeLock: number;
    createdAt: number;
    updatedAt: number;
}

export interface EscrowParams {
    transactionId: string;
    provider: PublicKey;
    amount: number;
    timeLockSeconds?: number;
}

export interface CreateEscrowResult {
    escrowPda: PublicKey;
    bump: number;
    transaction: Uint8Array;
}

// Transaction Types
export type TransactionType =
    | 'initialize_escrow'
    | 'fund_escrow'
    | 'initiate_dispute'
    | 'resolve_dispute'
    | 'release_funds'
    | 'close_escrow'
    | 'unknown';

export interface ParsedTransaction {
    signature: string;
    type: TransactionType;
    escrowPda: string | null;
    agent: string | null;
    provider: string | null;
    amount: bigint | null;
    qualityScore: number | null;
    refundAmount: bigint | null;
    timestamp: number;
    slot: number;
    success: boolean;
    error: string | null;
}

export interface TransactionFilter {
    type?: TransactionType[];
    escrowPda?: string;
    minTimestamp?: number;
    maxTimestamp?: number;
    limit?: number;
}

// Priority Fee Types
export interface PriorityFeeLevels {
    min: number;
    low: number;
    medium: number;
    high: number;
    veryHigh: number;
    unsafeMax: number;
}

export interface PriorityFeeEstimate {
    levels: PriorityFeeLevels;
    recommended: number;
    percentiles: Record<number, number>;
    timestamp: number;
}

export type FeeStrategy = 'economy' | 'standard' | 'fast' | 'urgent' | 'critical';

export interface FeeStrategyConfig {
    name: FeeStrategy;
    multiplier: number;
    maxFee: number;
}

// Webhook Types
export interface HeliusWebhookPayload {
    webhookURL: string;
    accountData: AccountData[];
    description: string;
    events: WebhookEvents;
    fee: number;
    feePayer: string;
    instructions: InstructionData[];
    nativeTransfers: NativeTransfer[];
    signature: string;
    slot: number;
    source: string;
    timestamp: number;
    tokenTransfers: TokenTransfer[];
    type: string;
    transactionError: string | null;
}

export interface AccountData {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: TokenBalanceChange[];
}

export interface TokenBalanceChange {
    mint: string;
    rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
    };
    userAccount: string;
}

export interface WebhookEvents {
    nft?: unknown;
    swap?: unknown;
    compressed?: unknown;
}

export interface InstructionData {
    programId: string;
    accounts: string[];
    data: string;
    innerInstructions: InnerInstruction[];
}

export interface InnerInstruction {
    programId: string;
    accounts: string[];
    data: string;
}

export interface NativeTransfer {
    amount: number;
    fromUserAccount: string;
    toUserAccount: string;
}

export interface TokenTransfer {
    fromTokenAccount: string;
    fromUserAccount: string;
    mint: string;
    toTokenAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    tokenStandard: string;
}

export interface KamiyoEvent {
    type: 'escrow_created' | 'escrow_funded' | 'dispute_initiated' | 'dispute_resolved' | 'funds_released' | 'escrow_closed';
    escrowId: string;
    escrowPda: string;
    agent: string | null;
    provider: string | null;
    amount: bigint | null;
    qualityScore: number | null;
    refundAmount: bigint | null;
    signature: string;
    timestamp: number;
    slot: number;
}

export interface WebhookHandlerOptions {
    onEscrowCreated?: (event: KamiyoEvent) => Promise<void>;
    onEscrowFunded?: (event: KamiyoEvent) => Promise<void>;
    onDisputeInitiated?: (event: KamiyoEvent) => Promise<void>;
    onDisputeResolved?: (event: KamiyoEvent) => Promise<void>;
    onFundsReleased?: (event: KamiyoEvent) => Promise<void>;
    onEscrowClosed?: (event: KamiyoEvent) => Promise<void>;
    onError?: (error: Error, payload: HeliusWebhookPayload) => void;
}

// Subscription Types
export interface SubscriptionOptions {
    commitment?: Commitment;
    onStateChange: (state: EscrowState) => void;
    onError?: (error: Error) => void;
}

export interface Subscription {
    id: number;
    escrowPda: PublicKey;
    unsubscribe: () => Promise<void>;
}

// Error Types
export class HeliusAdapterError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'HeliusAdapterError';
    }
}

export class RateLimitError extends HeliusAdapterError {
    constructor(retryAfterMs: number) {
        super(`Rate limit exceeded. Retry after ${retryAfterMs}ms`, 'RATE_LIMIT');
        this.name = 'RateLimitError';
    }
}

export class ConnectionError extends HeliusAdapterError {
    constructor(message: string, cause?: Error) {
        super(message, 'CONNECTION_ERROR', cause);
        this.name = 'ConnectionError';
    }
}

export class ParseError extends HeliusAdapterError {
    constructor(message: string, cause?: Error) {
        super(message, 'PARSE_ERROR', cause);
        this.name = 'ParseError';
    }
}

// API Response Types
export interface HeliusPriorityFeeResponse {
    jsonrpc: string;
    id: string;
    result: {
        priorityFeeEstimate: number;
        priorityFeeLevels?: {
            min: number;
            low: number;
            medium: number;
            high: number;
            veryHigh: number;
            unsafeMax: number;
        };
        percentiles?: Record<number, number>;
    };
    error?: {
        code: number;
        message: string;
    };
}

export interface HeliusEnhancedTransaction {
    signature: string;
    slot: number;
    timestamp: number;
    fee: number;
    feePayer: string;
    instructions: InstructionData[];
    accountData: AccountData[];
    nativeTransfers: NativeTransfer[];
    tokenTransfers: TokenTransfer[];
    events: WebhookEvents;
    transactionError: string | null;
}
