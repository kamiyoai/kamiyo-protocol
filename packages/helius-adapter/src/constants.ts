/**
 * KAMIYO Helius Adapter - Constants
 */

import { FeeStrategy, FeeStrategyConfig } from './types';

// KAMIYO Program ID (mainnet)
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

// Instruction discriminators (Anchor-style, first 8 bytes of sha256 hash)
export const INSTRUCTION_DISCRIMINATORS = {
    INITIALIZE_ESCROW: Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]),
    FUND_ESCROW: Buffer.from([161, 178, 195, 212, 229, 246, 7, 24]),
    INITIATE_DISPUTE: Buffer.from([178, 195, 212, 229, 246, 7, 24, 41]),
    RESOLVE_DISPUTE: Buffer.from([195, 212, 229, 246, 7, 24, 41, 58]),
    RELEASE_FUNDS: Buffer.from([212, 229, 246, 7, 24, 41, 58, 75]),
    CLOSE_ESCROW: Buffer.from([229, 246, 7, 24, 41, 58, 75, 92])
} as const;

// PDA seeds
export const PDA_SEEDS = {
    ESCROW: 'escrow',
    REPUTATION: 'reputation',
    ORACLE_REGISTRY: 'oracle_registry',
    DISPUTE: 'dispute'
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
    FUND_ESCROW: 30_000,
    INITIATE_DISPUTE: 45_000,
    RESOLVE_DISPUTE: 100_000, // Higher due to oracle verification
    RELEASE_FUNDS: 60_000,
    CLOSE_ESCROW: 25_000
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

// Escrow status byte mapping
export const STATUS_MAP: Record<number, string> = {
    0: 'active',
    1: 'funded',
    2: 'disputed',
    3: 'resolved',
    4: 'released',
    5: 'expired'
} as const;

// Log patterns for transaction type detection
export const LOG_PATTERNS = {
    INITIALIZE: /Instruction:\s*InitializeEscrow|Escrow\s+created/i,
    FUND: /Instruction:\s*FundEscrow|Escrow\s+funded/i,
    DISPUTE: /Instruction:\s*InitiateDispute|Dispute\s+initiated/i,
    RESOLVE: /Instruction:\s*ResolveDispute|Quality\s+Score:/i,
    RELEASE: /Instruction:\s*ReleaseFunds|Funds\s+released/i,
    CLOSE: /Instruction:\s*CloseEscrow|Escrow\s+closed/i
} as const;
