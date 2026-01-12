/**
 * Core types for agent infrastructure.
 */

export type KamiyoNetwork = 'mainnet' | 'devnet' | 'localnet';

export interface NetworkConfig {
  rpcUrl: string;
  programId: string;
  explorer: string;
}

export const KAMIYO_NETWORKS: Record<KamiyoNetwork, NetworkConfig> = {
  mainnet: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
    explorer: 'https://solscan.io',
  },
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    programId: 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n',
    explorer: 'https://solscan.io?cluster=devnet',
  },
  localnet: {
    rpcUrl: 'http://localhost:8899',
    programId: 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n',
    explorer: 'http://localhost:8899',
  },
};

export type KamiyoErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'QUALITY_BELOW_THRESHOLD'
  | 'ESCROW_CREATION_FAILED'
  | 'DISPUTE_FAILED'
  | 'PAYMENT_FAILED'
  | 'API_UNAVAILABLE'
  | 'INVALID_CONFIG'
  | 'WALLET_NOT_INITIALIZED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'CIRCUIT_OPEN'
  | 'UNAUTHORIZED';

export class KamiyoError extends Error {
  constructor(
    message: string,
    public readonly code: KamiyoErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'KamiyoError';
  }
}

export interface QualityCheckResult {
  score: number;
  completeness: number;
  accuracy: number;
  freshness: number;
  passesThreshold: boolean;
}

export interface QualityEvaluator {
  name: string;
  evaluate(response: unknown, expected: Record<string, unknown>, query: Record<string, unknown>): QualityCheckResult;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number | null;
  state: 'closed' | 'open' | 'half-open';
  halfOpenAttempts: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenRequests: 2,
};

export interface StorageProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export interface AuthProvider {
  validate(token: string): Promise<AuthResult>;
  getPermissions(token: string): Promise<string[]>;
}

export interface AuthResult {
  valid: boolean;
  agentId?: string;
  error?: string;
}
