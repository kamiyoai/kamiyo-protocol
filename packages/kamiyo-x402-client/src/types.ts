/**
 * Types for @kamiyo/x402-client
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';

// Configuration

export interface X402ClientConfig {
  /** Solana RPC connection */
  connection: Connection;
  /** Agent keypair for signing */
  wallet: Keypair;
  /** Kamiyo program ID */
  programId: PublicKey;
  /** Auto-dispute if quality falls below threshold (0-100) */
  qualityThreshold?: number;
  /** Maximum SOL willing to pay per request */
  maxPricePerRequest?: number;
  /** Default time lock for escrows in seconds */
  defaultTimeLock?: number;
  /** Enable automatic SLA monitoring */
  enableSlaMonitoring?: boolean;
  /** Retry configuration */
  retry?: RetryConfig;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// x402 Protocol Types (per spec)

/**
 * x402 payment requirement from 402 response
 * @see https://www.x402.org/
 */
export interface X402PaymentRequirement {
  /** x402 spec version */
  x402Version: number;
  /** Accepted payment schemes */
  accepts: X402PaymentScheme[];
  /** Human-readable error */
  error?: string;
}

export interface X402PaymentScheme {
  /** Payment scheme identifier */
  scheme: string;
  /** Network identifier (CAIP-2 format) */
  network: string;
  /** Maximum amount in base units */
  maxAmountRequired: string;
  /** Resource being paid for */
  resource: string;
  /** Payment description */
  description?: string;
  /** MIME types accepted */
  mimeTypes?: string[];
  /** Recipient address */
  payTo: string;
  /** Required confirmations */
  requiredConfirmations?: number;
  /** Payment TTL in seconds */
  ttlSeconds?: number;
  /** Extra data */
  extra?: Record<string, unknown>;
}

/**
 * x402 payment header format
 */
export interface X402PaymentHeader {
  /** Payment scheme used */
  scheme: string;
  /** Network identifier */
  network: string;
  /** Payment payload (base64 encoded) */
  payload: string;
}

// Kamiyo Extension Types

/**
 * Extended payment requirement with Kamiyo escrow support
 */
export interface KamiyoPaymentRequirement extends X402PaymentRequirement {
  /** Kamiyo-specific extensions */
  kamiyo?: {
    /** Whether escrow is required */
    escrowRequired: boolean;
    /** Minimum stake required */
    minStake?: string;
    /** SLA template identifier */
    slaTemplate?: string;
    /** Minimum oracle threshold */
    oracleThreshold?: number;
    /** Program ID for escrow */
    programId?: string;
  };
}

/**
 * Service Level Agreement parameters
 */
export interface SlaParams {
  /** Maximum response latency in ms */
  maxLatencyMs?: number;
  /** Minimum uptime percentage (0-100) */
  minUptime?: number;
  /** Minimum quality score (0-100) */
  minQualityScore?: number;
  /** Custom validation function */
  customValidator?: (response: unknown) => SlaValidationResult;
}

export interface SlaValidationResult {
  passed: boolean;
  qualityScore: number;
  violations: string[];
  metrics: Record<string, number>;
}

// Payment and Escrow Types

export interface PaymentResult {
  success: boolean;
  /** Transaction signature */
  signature?: string;
  /** Escrow PDA if created */
  escrowPda?: PublicKey;
  /** Transaction ID for tracking */
  transactionId?: string;
  /** Payment amount */
  amount?: number;
  /** Error message if failed */
  error?: string;
}

export interface EscrowInfo {
  /** Escrow PDA */
  pda: PublicKey;
  /** Agent public key */
  agent: PublicKey;
  /** Provider public key */
  provider: PublicKey;
  /** Escrowed amount in lamports */
  amount: bigint;
  /** Escrow status */
  status: EscrowStatus;
  /** Transaction ID */
  transactionId: string;
  /** Creation timestamp */
  createdAt: number;
  /** Expiry timestamp */
  expiresAt: number;
}

export enum EscrowStatus {
  Active = 0,
  Released = 1,
  Disputed = 2,
  Resolved = 3,
}

// Request/Response Types

export interface X402RequestOptions {
  /** HTTP method */
  method?: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: string;
  /** Use Kamiyo escrow for payment */
  useEscrow?: boolean;
  /** Custom transaction ID */
  transactionId?: string;
  /** SLA parameters to enforce */
  sla?: SlaParams;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

export interface X402Response<T = unknown> {
  success: boolean;
  data?: T;
  /** Response metadata */
  meta?: {
    latencyMs: number;
    paymentSignature?: string;
    escrowPda?: string;
    transactionId?: string;
  };
  /** SLA validation result if SLA was specified */
  slaResult?: SlaValidationResult;
  /** Error details if failed */
  error?: X402Error;
}

export interface X402Error {
  code: X402ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type X402ErrorCode =
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_FAILED'
  | 'ESCROW_CREATION_FAILED'
  | 'SLA_VIOLATION'
  | 'DISPUTE_FAILED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'INSUFFICIENT_FUNDS'
  | 'PRICE_EXCEEDED';

// Dispute Types

export interface DisputeParams {
  /** Escrow PDA to dispute */
  escrowPda: PublicKey;
  /** Reason for dispute */
  reason: string;
  /** Evidence of SLA violation */
  evidence: {
    expectedSla: SlaParams;
    actualMetrics: Record<string, number>;
    violations: string[];
  };
}

export interface DisputeResult {
  success: boolean;
  /** Dispute ID */
  disputeId?: string;
  /** Quality score from oracle */
  qualityScore?: number;
  /** Refund percentage (0-100) */
  refundPercentage?: number;
  /** Error if failed */
  error?: string;
}

// Constants

export const SOLANA_NETWORK_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'; // mainnet
export const SOLANA_DEVNET_ID = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

export const MIN_ESCROW_AMOUNT_LAMPORTS = 5_000_000; // 0.005 SOL
export const MAX_ESCROW_AMOUNT_LAMPORTS = 1_000_000_000_000; // 1000 SOL
export const MIN_TIME_LOCK_SECONDS = 3600; // 1 hour
export const MAX_TIME_LOCK_SECONDS = 2_592_000; // 30 days

export const QUALITY_REFUND_SCALE = {
  POOR: { minQuality: 0, maxQuality: 49, refundPercent: 100 },
  BELOW_AVERAGE: { minQuality: 50, maxQuality: 64, refundPercent: 75 },
  AVERAGE: { minQuality: 65, maxQuality: 79, refundPercent: 35 },
  GOOD: { minQuality: 80, maxQuality: 100, refundPercent: 0 },
} as const;
