/**
 * KAMIYO Helius Adapter - Constants
 */

import { FeeStrategy, FeeStrategyConfig } from './types';

// Default program ID for the deployed Kamiyo escrow program.
// Source: `programs/kamiyo-escrow/src/lib.rs`
// Override via `HeliusConfig.programId` if you're targeting a different deployment.
export const KAMIYO_PROGRAM_ID = 'FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u';

// Helius RPC endpoints
export const HELIUS_ENDPOINTS = {
    'mainnet-beta': 'https://mainnet.helius-rpc.com',
    'devnet': 'https://devnet.helius-rpc.com'
} as const;

// Helius API endpoints
export const HELIUS_API_ENDPOINTS = {
    'mainnet-beta': 'https://api.helius.xyz/v0',
    'devnet': 'https://api-devnet.helius.xyz/v0'
} as const;

// Instruction discriminators (Anchor).
// Source: `target/idl/kamiyo_escrow.json`
export const INSTRUCTION_DISCRIMINATORS = {
    CREATE_ESCROW: Buffer.from([253, 215, 165, 116, 36, 108, 68, 80]),
    RATE_AND_RELEASE: Buffer.from([14, 35, 187, 205, 46, 136, 5, 37]),
    MARK_DISPUTED: Buffer.from([136, 86, 152, 120, 3, 21, 223, 251]),
    COMMIT_VOTE: Buffer.from([134, 97, 90, 126, 91, 66, 16, 26]),
    REVEAL_VOTE: Buffer.from([100, 157, 139, 17, 186, 75, 185, 149]),
    FINALIZE_DISPUTE: Buffer.from([190, 211, 17, 122, 247, 157, 27, 223]),
    TIMEOUT_RELEASE: Buffer.from([98, 176, 26, 12, 83, 105, 154, 68]),
    DISPUTED_TIMEOUT_RELEASE: Buffer.from([206, 126, 27, 38, 125, 136, 211, 10]),
} as const;

// PDA seeds
export const PDA_SEEDS = {
    ESCROW: 'escrow',
} as const;

// Fee strategies with multipliers and caps
export const FEE_STRATEGIES: Record<FeeStrategy, FeeStrategyConfig> = {
    economy: {
        name: 'economy',
        multiplier: 0.5,
        maxFee: 10_000 // 0.00001 SOL
    },
    standard: {
        name: 'standard',
        multiplier: 1.0,
        maxFee: 50_000 // 0.00005 SOL
    },
    fast: {
        name: 'fast',
        multiplier: 1.5,
        maxFee: 100_000 // 0.0001 SOL
    },
    urgent: {
        name: 'urgent',
        multiplier: 2.5,
        maxFee: 500_000 // 0.0005 SOL
    },
    critical: {
        name: 'critical',
        multiplier: 5.0,
        maxFee: 1_000_000 // 0.001 SOL
    }
} as const;

// Compute units for different operations
export const COMPUTE_UNITS = {
    CREATE_ESCROW: 100_000,
    RATE_AND_RELEASE: 60_000,
    MARK_DISPUTED: 35_000,
    COMMIT_VOTE: 80_000,
    REVEAL_VOTE: 80_000,
    FINALIZE_DISPUTE: 150_000,
    TIMEOUT_RELEASE: 60_000,
    DISPUTED_TIMEOUT_RELEASE: 80_000,
} as const;

// Default configuration values
export const DEFAULTS = {
    COMMITMENT: 'confirmed' as const,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
    RATE_LIMIT_RPS: 25,
    CONNECTION_TIMEOUT_MS: 30_000,
    HEALTH_CHECK_INTERVAL_MS: 30_000,
    MAX_CONNECTIONS: 3,
    FEE_CACHE_TTL_MS: 10_000,
    WEBHOOK_SIGNATURE_HEADER: 'x-helius-signature'
} as const;

// Input validation limits
export const LIMITS = {
    MAX_API_KEY_LENGTH: 256,
    MAX_TRANSACTION_ID_LENGTH: 256,
    MAX_SIGNATURES_BATCH: 100,
    MAX_ACCOUNTS_BATCH: 100,
    MAX_ESCROW_PDAS_BATCH: 100,
    MIN_TIMEOUT_MS: 1000,
    MAX_TIMEOUT_MS: 120_000,
    MIN_RETRIES: 1,
    MAX_RETRIES: 10,
    MIN_RATE_LIMIT: 1,
    MAX_RATE_LIMIT: 100
} as const;

// Escrow status byte mapping
export const STATUS_MAP: Record<number, string> = {
    0: 'active',
    1: 'disputed',
    2: 'resolved',
    3: 'released',
    4: 'refunded',
} as const;

// Log patterns for transaction type detection
export const LOG_PATTERNS = {
    CREATE: /Instruction:\s*CreateEscrow|Escrow\s+created/i,
    DISPUTE: /Instruction:\s*MarkDisputed|Dispute\s+marked/i,
    RESOLVE: /Instruction:\s*FinalizeDispute|Dispute\s+resolved/i,
    RELEASE: /Instruction:\s*RateAndRelease|Escrow\s+released/i,
} as const;
