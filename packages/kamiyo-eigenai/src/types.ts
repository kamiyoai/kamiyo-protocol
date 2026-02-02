import { Connection, Keypair, PublicKey } from '@solana/web3.js';

export type EigenAIModel = 'qwen3-32b' | 'gpt-oss-120b';

export interface KamiyoEigenAIConfig {
  eigenAiApiKey: string;
  eigenAiBaseUrl?: string;
  connection: Connection;
  wallet: Keypair;
  programId: PublicKey;
  defaultEscrowAmount?: number;
  defaultQualityThreshold?: number;
  defaultTimeLockSeconds?: number;
  defaultTimeoutMs?: number;
  debug?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceParams {
  model: EigenAIModel;
  messages: ChatMessage[];
  escrowAmount: number;
  provider?: PublicKey;
  qualityThreshold?: number;
  timeLockSeconds?: number;
  transactionId?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface EigenAIAttestation {
  model: string;
  modelHash: string;
  inputHash: string;
  outputHash: string;
  timestamp: number;
  signature: string;
  teeQuote?: string;
}

export interface InferenceResult {
  success: boolean;
  response?: string;
  attestation?: EigenAIAttestation;
  escrowId?: string;
  escrowPda?: PublicKey;
  autoReleased?: boolean;
  qualityScore?: number;
  latencyMs?: number;
  error?: EigenAIError;
}

export interface EscrowParams {
  provider: PublicKey;
  amount: number;
  timeLockSeconds: number;
  transactionId: string;
}

export interface EscrowResult {
  success: boolean;
  signature?: string;
  escrowPda?: PublicKey;
  transactionId?: string;
  error?: EigenAIError;
}

export interface DisputeEvidence {
  attestation: EigenAIAttestation;
  prompt: string;
  output: string;
  expectedCriteria?: string[];
  actualIssues?: string[];
}

export type EigenAIErrorCode =
  | 'API_ERROR'
  | 'ATTESTATION_INVALID'
  | 'ESCROW_FAILED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_INPUT'
  | 'INSUFFICIENT_FUNDS'
  | 'DISPUTE_FAILED';

export class EigenAIError extends Error {
  constructor(
    public readonly code: EigenAIErrorCode,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EigenAIError';
  }

  static apiError(message: string, cause?: Error): EigenAIError {
    return new EigenAIError('API_ERROR', message, cause);
  }

  static attestationInvalid(reason: string): EigenAIError {
    return new EigenAIError('ATTESTATION_INVALID', `Invalid attestation: ${reason}`);
  }

  static escrowFailed(message: string, cause?: Error): EigenAIError {
    return new EigenAIError('ESCROW_FAILED', message, cause);
  }

  static timeout(operation: string, ms: number): EigenAIError {
    return new EigenAIError('TIMEOUT', `${operation} timed out after ${ms}ms`);
  }

  static networkError(message: string, cause?: Error): EigenAIError {
    return new EigenAIError('NETWORK_ERROR', message, cause);
  }

  static invalidInput(field: string, reason: string): EigenAIError {
    return new EigenAIError('INVALID_INPUT', `Invalid ${field}: ${reason}`);
  }

  static insufficientFunds(required: number, available: number): EigenAIError {
    return new EigenAIError(
      'INSUFFICIENT_FUNDS',
      `Insufficient funds: need ${required} SOL, have ${available} SOL`
    );
  }

  static disputeFailed(message: string, cause?: Error): EigenAIError {
    return new EigenAIError('DISPUTE_FAILED', message, cause);
  }
}

export const EIGENAI_DEFAULTS = {
  BASE_URL: 'https://api.eigencloud.xyz/v1',
  ESCROW_AMOUNT_SOL: 0.01,
  QUALITY_THRESHOLD: 70,
  TIME_LOCK_SECONDS: 3600,
  TIMEOUT_MS: 60000,
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.7,
} as const;

export const LIMITS = {
  MIN_ESCROW_SOL: 0.001,
  MAX_ESCROW_SOL: 100,
  MIN_TIME_LOCK_SECONDS: 300,
  MAX_TIME_LOCK_SECONDS: 2_592_000,
  MIN_TIMEOUT_MS: 5000,
  MAX_TIMEOUT_MS: 300_000,
  MAX_MESSAGES: 100,
  MAX_MESSAGE_LENGTH: 100_000,
  MAX_TRANSACTION_ID_LENGTH: 64,
} as const;

export const QUALITY_TIERS = {
  EXCELLENT: { min: 80, max: 100, refundPercent: 0 },
  GOOD: { min: 65, max: 79, refundPercent: 35 },
  POOR: { min: 50, max: 64, refundPercent: 75 },
  FAILED: { min: 0, max: 49, refundPercent: 100 },
} as const;
