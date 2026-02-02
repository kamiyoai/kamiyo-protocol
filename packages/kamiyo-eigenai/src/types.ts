import { Connection, Keypair, PublicKey } from '@solana/web3.js';

export type EigenAIModel = 'gpt-oss-120b-f16' | 'qwen3-32b-128k-bf16';

export type EigenAIAuthConfig =
  | { type: 'apiKey'; apiKey: string }
  | { type: 'grant'; privateKey: Uint8Array; walletAddress: string };

export interface KamiyoEigenAIConfig {
  connection: Connection;
  wallet: Keypair;
  programId: PublicKey;
  eigenAiAuth: EigenAIAuthConfig;
  eigenAiBaseUrl?: string;
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
  sessionId?: Uint8Array;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  seed?: number;
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
  sessionId: Uint8Array;
  amount: number;
  treasury: PublicKey;
  userTokenAccount: PublicKey;
}

export interface EscrowResult {
  success: boolean;
  signature?: string;
  escrowPda?: PublicKey;
  sessionId?: Uint8Array;
  error?: EigenAIError;
}

export interface ReleaseParams {
  sessionId: Uint8Array;
  rating: number;
  treasury: PublicKey;
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
  | 'DISPUTE_FAILED'
  | 'AUTH_FAILED';

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

  static authFailed(message: string, cause?: Error): EigenAIError {
    return new EigenAIError('AUTH_FAILED', message, cause);
  }
}

export const PROGRAM_IDS = {
  MAINNET: new PublicKey('FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u'),
  DEVNET: new PublicKey('EqScj2SUahLLUuP56s77yK6bPr3VEPoTyDecjvyoBtxT'),
} as const;

export const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

export const FEE_CREATE_ESCROW = 50_000_000;
export const BURN_RATE_BPS = 100;

export const EIGENAI_DEFAULTS = {
  BASE_URL: 'https://eigenai.eigencloud.xyz',
  BASE_URL_TESTNET: 'https://eigenai-sepolia.eigencloud.xyz',
  GRANT_API_URL: 'https://determinal-api.eigenarcade.com',
  ESCROW_AMOUNT_SOL: 0.01,
  QUALITY_THRESHOLD: 70,
  TIME_LOCK_SECONDS: 3600,
  TIMEOUT_MS: 60000,
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.7,
  MODEL: 'gpt-oss-120b-f16' as EigenAIModel,
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
  SESSION_ID_LENGTH: 32,
} as const;

export const QUALITY_TIERS = {
  EXCELLENT: { min: 80, max: 100, refundPercent: 0 },
  GOOD: { min: 65, max: 79, refundPercent: 35 },
  POOR: { min: 50, max: 64, refundPercent: 75 },
  FAILED: { min: 0, max: 49, refundPercent: 100 },
} as const;

export const DISCRIMINATORS = {
  CREATE_ESCROW: Buffer.from([253, 215, 165, 116, 36, 108, 68, 80]),
  RATE_AND_RELEASE: Buffer.from([14, 35, 187, 205, 46, 136, 5, 37]),
  MARK_DISPUTED: Buffer.from([136, 86, 152, 120, 3, 21, 223, 251]),
  FINALIZE_DISPUTE: Buffer.from([190, 211, 17, 122, 247, 157, 27, 223]),
} as const;

export enum EscrowStatus {
  Active = 0,
  Disputed = 1,
  Resolved = 2,
  Released = 3,
  Refunded = 4,
}
