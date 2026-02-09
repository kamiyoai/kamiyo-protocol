/**
 * KAMIYO Helius Adapter - Constants
 */

import { FeeStrategy, FeeStrategyConfig } from './types';

// Default program ID for the deployed Kamiyo escrow program (x402-style escrow).
// Override via `HeliusConfig.programId` if you're targeting a different deployment.
export const KAMIYO_PROGRAM_ID = 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n';

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

// Instruction discriminators (Anchor, first 8 bytes of sha256("global:<name>")).
// Source: `services/api/src/mcp/idl/x402_escrow.json`
export const INSTRUCTION_DISCRIMINATORS = {
    INITIALIZE_ESCROW: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]),
    RELEASE_FUNDS: Buffer.from([223, 28, 84, 101, 126, 198, 138, 136]),
    RESOLVE_DISPUTE: Buffer.from([162, 159, 101, 217, 224, 78, 50, 19]),
    RESOLVE_DISPUTE_SWITCHBOARD: Buffer.from([89, 137, 212, 95, 224, 104, 238, 213]),
    MARK_DISPUTED: Buffer.from([119, 145, 102, 68, 238, 151, 127, 218]),
    INIT_REPUTATION: Buffer.from([62, 192, 209, 217, 158, 238, 164, 122]),
    UPDATE_REPUTATION: Buffer.from([142, 85, 191, 50, 128, 52, 173, 38]),
    CHECK_RATE_LIMIT: Buffer.from([234, 37, 165, 12, 15, 241, 220, 151]),
} as const;

// PDA seeds
export const PDA_SEEDS = {
    ESCROW: 'escrow',
    REPUTATION: 'reputation',
    ORACLE_REGISTRY: 'oracle_registry',
    DISPUTE: 'dispute',
    RATE_LIMIT: 'rate_limit',
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
    INITIALIZE_ESCROW: 50_000,
    MARK_DISPUTED: 35_000,
    RESOLVE_DISPUTE: 120_000,
    RELEASE_FUNDS: 60_000,
    INIT_REPUTATION: 30_000,
    UPDATE_REPUTATION: 35_000,
    CHECK_RATE_LIMIT: 25_000,
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
    1: 'released',
    2: 'disputed',
    3: 'resolved',
} as const;

// Log patterns for transaction type detection
export const LOG_PATTERNS = {
    INITIALIZE: /Instruction:\s*InitializeEscrow|Escrow\s+initialized/i,
    DISPUTE: /Instruction:\s*MarkDisputed|Dispute\s+marked/i,
    RESOLVE: /Instruction:\s*ResolveDispute|Quality\s*Score:/i,
    RELEASE: /Instruction:\s*ReleaseFunds|Funds\s+released/i,
} as const;
