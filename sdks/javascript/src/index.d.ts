/**
 * x402 Infrastructure JavaScript SDK - TypeScript Definitions
 * Official client for x402 payment verification API
 */

export interface X402ClientOptions {
  /** Your x402 API key (x402_live_XXXXX or x402_test_XXXXX) */
  apiKey: string;
  /** Optional custom API base URL (for testing) */
  baseUrl?: string;
}

export interface VerificationParams {
  /** Transaction hash to verify */
  txHash: string;
  /** Blockchain network (solana, base, ethereum, etc.) */
  chain: string;
  /** Optional expected payment amount in USDC */
  expectedAmount?: number;
}

export interface VerificationResult {
  /** Whether verification succeeded */
  success: boolean;
  /** Transaction hash verified */
  txHash: string;
  /** Blockchain network */
  chain: string;
  /** Amount in USDC */
  amountUsdc: number;
  /** Sender address */
  fromAddress: string;
  /** Recipient address */
  toAddress: string;
  /** Number of confirmations */
  confirmations: number;
  /** Risk score (0-1, lower is better) */
  riskScore: number;
  /** Error message if failed */
  error?: string;
  /** Error code if failed */
  errorCode?: string;
}

export interface UsageStats {
  /** Current pricing tier */
  tier: string;
  /** Verifications used this month */
  verifications_used: number;
  /** Monthly verification limit */
  verifications_limit: number;
  /** Remaining verifications */
  verifications_remaining: number;
  /** When quota resets */
  quota_reset_date: string;
}

export interface ChainInfo {
  /** Current pricing tier */
  tier: string;
  /** List of enabled blockchain networks */
  enabled_chains: string[];
  /** All available chains */
  available_chains: string[];
}

/**
 * Base error class for x402 SDK
 */
export class X402Error extends Error {
  /** Error code from API */
  code: string;
  /** HTTP status code */
  statusCode: number;

  constructor(message: string, code: string, statusCode: number);
}

/**
 * Thrown when monthly quota is exceeded
 */
export class X402QuotaExceeded extends X402Error {
  constructor(message?: string);
}

/**
 * Thrown when authentication fails
 */
export class X402AuthError extends X402Error {
  constructor(message?: string);
}

/**
 * X402 Infrastructure Client
 *
 * @example
 * ```typescript
 * import { X402Client } from '@x402/sdk';
 *
 * const client = new X402Client({
 *   apiKey: 'x402_live_XXXXX'
 * });
 *
 * const result = await client.verifyPayment({
 *   txHash: '5KZ7xQjDPh4A7V9X...',
 *   chain: 'solana',
 *   expectedAmount: 1.00
 * });
 *
 * if (result.success) {
 *   console.log(`Verified ${result.amountUsdc} USDC`);
 * }
 * ```
 */
export class X402Client {
  /** API key */
  readonly apiKey: string;
  /** API base URL */
  readonly baseUrl: string;

  /**
   * Create a new X402 client
   * @param options - Client configuration options
   */
  constructor(options: X402ClientOptions);

  /**
   * Verify on-chain USDC payment
   * @param params - Verification parameters
   * @returns Verification result
   * @throws {X402QuotaExceeded} When monthly quota is exceeded
   * @throws {X402AuthError} When API key is invalid
   * @throws {X402Error} For other API errors
   */
  verifyPayment(params: VerificationParams): Promise<VerificationResult>;

  /**
   * Get current usage statistics
   * @returns Usage statistics
   * @throws {X402AuthError} When API key is invalid
   * @throws {X402Error} For other API errors
   */
  getUsage(): Promise<UsageStats>;

  /**
   * Get chains available for your tier
   * @returns Chain information
   * @throws {X402AuthError} When API key is invalid
   * @throws {X402Error} For other API errors
   */
  getSupportedChains(): Promise<ChainInfo>;
}

export default X402Client;
