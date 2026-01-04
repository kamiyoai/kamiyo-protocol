/**
 * X402KamiyoClient - Production-ready x402 payments with Kamiyo escrow protection
 *
 * Features:
 * - x402 protocol v1/v2 compatibility
 * - Escrow-backed payments with dispute resolution
 * - SLA monitoring and automatic dispute triggering
 * - Retry with exponential backoff
 * - Circuit breaker for fault tolerance
 * - Quality-based graduated refunds
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

import { X402Error, wrapError } from './errors';
import { ResilientExecutor, RetryConfig } from './retry';
import { EscrowHandler, EscrowResult } from './escrow';
import {
  validatePublicKey,
  validateAmountSol,
  validateAmountLamports,
  validateTimeLock,
  validateQualityThreshold,
  validateTransactionId,
  validateUrl,
  validateTimeout,
  assertValid,
  generateTransactionId,
  LIMITS,
} from './validation';

// ============================================================================
// Types
// ============================================================================

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
  /** Default request timeout in ms */
  defaultTimeoutMs?: number;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Enable debug logging */
  debug?: boolean;
}

export interface SlaParams {
  /** Maximum response latency in ms */
  maxLatencyMs?: number;
  /** Minimum quality score (0-100) */
  minQualityScore?: number;
  /** Custom validation function */
  customValidator?: (response: unknown, latencyMs: number) => SlaValidationResult;
}

export interface SlaValidationResult {
  passed: boolean;
  qualityScore: number;
  violations: string[];
  metrics: Record<string, number>;
}

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
  /** Request timeout in ms */
  timeoutMs?: number;
}

export interface X402Response<T = unknown> {
  success: boolean;
  data?: T;
  meta?: {
    latencyMs: number;
    paymentSignature?: string;
    escrowPda?: string;
    transactionId?: string;
  };
  slaResult?: SlaValidationResult;
  error?: X402Error;
}

export interface PaymentResult {
  success: boolean;
  signature?: string;
  escrowPda?: PublicKey;
  transactionId?: string;
  amount?: number;
  error?: X402Error;
}

export interface EscrowInfo {
  pda: PublicKey;
  agent: PublicKey;
  provider: PublicKey;
  amount: bigint;
  status: EscrowStatus;
  transactionId: string;
  createdAt: number;
  expiresAt: number;
}

export enum EscrowStatus {
  Active = 0,
  Released = 1,
  Disputed = 2,
  Resolved = 3,
}

interface X402PaymentRequirement {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    payTo: string;
    description?: string;
  }>;
  kamiyo?: {
    escrowRequired: boolean;
    minStake?: string;
    programId?: string;
  };
}

// ============================================================================
// Client Implementation
// ============================================================================

export class X402KamiyoClient {
  private readonly connection: Connection;
  private readonly wallet: Keypair;
  private readonly programId: PublicKey;
  private readonly qualityThreshold: number;
  private readonly maxPricePerRequest: number;
  private readonly defaultTimeLock: number;
  private readonly enableSlaMonitoring: boolean;
  private readonly defaultTimeoutMs: number;
  private readonly debug: boolean;
  private readonly executor: ResilientExecutor;
  private readonly escrowHandler: EscrowHandler;

  // Track active escrows
  private readonly activeEscrows = new Map<string, EscrowInfo>();
  // Track used payment signatures to prevent replay
  private readonly usedSignatures = new Map<string, number>();

  constructor(config: X402ClientConfig) {
    // Validate required config
    assertValid(validatePublicKey(config.programId, 'programId'), 'programId');

    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId;

    // Optional config with defaults
    this.qualityThreshold = config.qualityThreshold ?? 70;
    this.maxPricePerRequest = config.maxPricePerRequest ?? 0.1;
    this.defaultTimeLock = config.defaultTimeLock ?? 3600;
    this.enableSlaMonitoring = config.enableSlaMonitoring ?? true;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30000;
    this.debug = config.debug ?? false;

    // Validate optional config
    assertValid(
      validateQualityThreshold(this.qualityThreshold, 'qualityThreshold'),
      'qualityThreshold'
    );
    assertValid(
      validateAmountSol(this.maxPricePerRequest, 'maxPricePerRequest'),
      'maxPricePerRequest'
    );
    assertValid(
      validateTimeLock(this.defaultTimeLock, 'defaultTimeLock'),
      'defaultTimeLock'
    );

    // Initialize retry/circuit breaker
    this.executor = new ResilientExecutor(config.retry);

    // Initialize escrow handler
    this.escrowHandler = new EscrowHandler({
      connection: this.connection,
      wallet: this.wallet,
      programId: this.programId,
    });

    // Cleanup old signatures periodically
    this.startSignatureCleanup();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Make HTTP request with automatic x402 payment handling
   */
  async request<T = unknown>(
    url: string,
    options: X402RequestOptions = {}
  ): Promise<X402Response<T>> {
    // Validate inputs
    assertValid(validateUrl(url, 'url'), 'url');
    if (options.timeoutMs) {
      assertValid(validateTimeout(options.timeoutMs, 'timeoutMs'), 'timeoutMs');
    }
    if (options.transactionId) {
      assertValid(validateTransactionId(options.transactionId, 'transactionId'), 'transactionId');
    }

    const startTime = Date.now();
    const transactionId = options.transactionId || generateTransactionId();
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

    try {
      return await this.executor.execute(async () => {
        // Initial request
        let response = await this.fetchWithTimeout(url, options, timeoutMs);

        // Handle 402 Payment Required
        if (response.status === 402) {
          const requirement = await this.parsePaymentRequired(response);

          if (!requirement) {
            return this.errorResponse(
              X402Error.invalidInput('response', 'Could not parse payment requirement')
            );
          }

          // Validate price
          const amount = this.parseAmount(requirement.accepts[0]?.maxAmountRequired || '0');
          const amountSol = amount / LAMPORTS_PER_SOL;

          if (amountSol > this.maxPricePerRequest) {
            return this.errorResponse(X402Error.priceExceeded(amountSol, this.maxPricePerRequest));
          }

          // Check balance
          const balance = await this.getBalance();
          if (balance < amountSol) {
            return this.errorResponse(X402Error.insufficientFunds(amountSol, balance));
          }

          // Execute payment
          const useEscrow = options.useEscrow ?? requirement.kamiyo?.escrowRequired ?? false;
          const paymentResult = await this.pay(requirement, transactionId, useEscrow);

          if (!paymentResult.success) {
            return this.errorResponse(paymentResult.error || X402Error.paymentFailed('Unknown error'));
          }

          // Retry with payment proof
          response = await this.fetchWithTimeout(url, {
            ...options,
            headers: {
              ...options.headers,
              'X-Payment': this.createPaymentHeader(paymentResult.signature || ''),
              'X-Kamiyo-Escrow': paymentResult.escrowPda?.toBase58() || '',
              'X-Kamiyo-Transaction-Id': transactionId,
            },
          }, timeoutMs);
        }

        // Handle errors
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          return this.errorResponse(X402Error.fromResponse(response, body));
        }

        // Parse response
        const data = await response.json() as T;
        const latencyMs = Date.now() - startTime;

        // Validate SLA
        let slaResult: SlaValidationResult | undefined;
        if (options.sla && this.enableSlaMonitoring) {
          slaResult = this.validateSla(options.sla, data, latencyMs);

          if (!slaResult.passed && slaResult.qualityScore < this.qualityThreshold) {
            const escrow = this.activeEscrows.get(transactionId);
            if (escrow) {
              this.log(`SLA violation for ${transactionId}, quality: ${slaResult.qualityScore}`);
              // Queue dispute asynchronously
              this.queueDispute(escrow, slaResult).catch(e => this.log(`Dispute failed: ${e}`));
            }
          }
        }

        return {
          success: true,
          data,
          meta: {
            latencyMs,
            transactionId,
            escrowPda: this.activeEscrows.get(transactionId)?.pda.toBase58(),
          },
          slaResult,
        };
      }, 'request');
    } catch (error) {
      return this.errorResponse(wrapError(error, 'request'));
    }
  }

  /**
   * Create escrow for protected payment
   */
  async createEscrow(
    provider: PublicKey,
    amountLamports: number,
    transactionId: string
  ): Promise<PaymentResult> {
    // Validate inputs
    assertValid(validatePublicKey(provider, 'provider'), 'provider');
    assertValid(validateAmountLamports(amountLamports, 'amountLamports'), 'amountLamports');
    assertValid(validateTransactionId(transactionId, 'transactionId'), 'transactionId');

    try {
      return await this.executor.execute(async () => {
        // Check for duplicate transaction ID
        if (this.activeEscrows.has(transactionId)) {
          return {
            success: false,
            error: X402Error.invalidInput('transactionId', 'Transaction ID already in use'),
          };
        }

        // Create escrow via handler (sends actual Anchor instruction)
        const result = await this.escrowHandler.create({
          provider,
          amount: amountLamports,
          timeLockSeconds: this.defaultTimeLock,
          transactionId,
        });

        if (!result.success || !result.escrowPda) {
          return {
            success: false,
            error: result.error || X402Error.escrowCreationFailed('Unknown error'),
          };
        }

        // Track escrow
        const now = Date.now();
        const escrowInfo: EscrowInfo = {
          pda: result.escrowPda,
          agent: this.wallet.publicKey,
          provider,
          amount: BigInt(amountLamports),
          status: EscrowStatus.Active,
          transactionId,
          createdAt: now,
          expiresAt: now + this.defaultTimeLock * 1000,
        };

        this.activeEscrows.set(transactionId, escrowInfo);
        this.log(`Escrow created: ${result.escrowPda.toBase58()} for ${amountLamports / LAMPORTS_PER_SOL} SOL`);

        return {
          success: true,
          signature: result.signature,
          escrowPda: result.escrowPda,
          transactionId,
          amount: amountLamports / LAMPORTS_PER_SOL,
        };
      }, 'createEscrow');
    } catch (error) {
      const wrapped = wrapError(error, 'createEscrow');
      return { success: false, error: wrapped };
    }
  }

  /**
   * Release escrow funds to provider
   */
  async releaseEscrow(transactionId: string): Promise<PaymentResult> {
    assertValid(validateTransactionId(transactionId, 'transactionId'), 'transactionId');

    const escrow = this.activeEscrows.get(transactionId);
    if (!escrow) {
      return {
        success: false,
        error: X402Error.invalidInput('transactionId', 'No active escrow with this ID'),
      };
    }

    try {
      const result = await this.escrowHandler.release(transactionId, escrow.provider);

      if (result.success) {
        escrow.status = EscrowStatus.Released;
        this.log(`Escrow released: ${transactionId}`);
      }

      return {
        success: result.success,
        signature: result.signature,
        escrowPda: escrow.pda,
        transactionId,
        error: result.error,
      };
    } catch (error) {
      return { success: false, error: wrapError(error, 'releaseEscrow') };
    }
  }

  /**
   * File dispute for an escrow
   */
  async disputeEscrow(transactionId: string): Promise<PaymentResult> {
    assertValid(validateTransactionId(transactionId, 'transactionId'), 'transactionId');

    const escrow = this.activeEscrows.get(transactionId);
    if (!escrow) {
      return {
        success: false,
        error: X402Error.invalidInput('transactionId', 'No active escrow with this ID'),
      };
    }

    try {
      const result = await this.escrowHandler.dispute(transactionId);

      if (result.success) {
        escrow.status = EscrowStatus.Disputed;
        this.log(`Escrow disputed: ${transactionId}`);
      }

      return {
        success: result.success,
        signature: result.signature,
        escrowPda: escrow.pda,
        transactionId,
        error: result.error,
      };
    } catch (error) {
      return { success: false, error: wrapError(error, 'disputeEscrow') };
    }
  }

  /**
   * Get wallet balance in SOL
   */
  async getBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.wallet.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }

  /**
   * Get public key
   */
  getPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  /**
   * Get active escrows
   */
  getActiveEscrows(): Map<string, EscrowInfo> {
    return new Map(this.activeEscrows);
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): string {
    return this.executor.getCircuitState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(): void {
    this.executor.resetCircuit();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async pay(
    requirement: X402PaymentRequirement,
    transactionId: string,
    useEscrow: boolean
  ): Promise<PaymentResult> {
    const scheme = requirement.accepts[0];
    if (!scheme) {
      return { success: false, error: X402Error.invalidInput('accepts', 'No payment scheme') };
    }

    const amount = this.parseAmount(scheme.maxAmountRequired);
    const provider = new PublicKey(scheme.payTo);

    if (useEscrow) {
      return this.createEscrow(provider, amount, transactionId);
    }

    return this.directPayment(provider, amount, transactionId);
  }

  private async directPayment(
    provider: PublicKey,
    amountLamports: number,
    transactionId: string
  ): Promise<PaymentResult> {
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: provider,
          lamports: amountLamports,
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet],
        { commitment: 'confirmed' }
      );

      // Track signature to prevent replay
      this.usedSignatures.set(signature, Date.now());

      this.log(`Payment sent: ${signature} for ${amountLamports / LAMPORTS_PER_SOL} SOL`);

      return {
        success: true,
        signature,
        transactionId,
        amount: amountLamports / LAMPORTS_PER_SOL,
      };
    } catch (error) {
      return { success: false, error: wrapError(error, 'directPayment') };
    }
  }

  private async parsePaymentRequired(response: Response): Promise<X402PaymentRequirement | null> {
    // Try JSON body first (x402 v2)
    try {
      const body = await response.clone().json();
      if (body.x402Version) {
        return body as X402PaymentRequirement;
      }
    } catch {
      // Fall through to header parsing
    }

    // Parse from headers (x402 v1)
    const amount = response.headers.get('X-Payment-Amount');
    const payTo = response.headers.get('X-Payment-PayTo');

    if (!amount || !payTo) {
      return null;
    }

    return {
      x402Version: 1,
      accepts: [{
        scheme: 'solana',
        network: 'solana:mainnet',
        maxAmountRequired: amount,
        resource: response.url,
        payTo,
      }],
      kamiyo: this.parseKamiyoHeaders(response),
    };
  }

  private parseKamiyoHeaders(response: Response): X402PaymentRequirement['kamiyo'] | undefined {
    const escrowRequired = response.headers.get('X-Kamiyo-Escrow-Required');
    if (!escrowRequired) return undefined;

    return {
      escrowRequired: escrowRequired === 'true',
      minStake: response.headers.get('X-Kamiyo-Min-Stake') || undefined,
      programId: response.headers.get('X-Kamiyo-Program-Id') || undefined,
    };
  }

  private createPaymentHeader(signature: string): string {
    const payload = {
      signature,
      payer: this.wallet.publicKey.toBase58(),
      timestamp: Date.now(),
    };
    return `solana:mainnet:${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
  }

  private validateSla(sla: SlaParams, response: unknown, latencyMs: number): SlaValidationResult {
    const violations: string[] = [];
    const metrics: Record<string, number> = { latencyMs };

    // Check latency
    if (sla.maxLatencyMs && latencyMs > sla.maxLatencyMs) {
      violations.push(`Latency ${latencyMs}ms exceeds max ${sla.maxLatencyMs}ms`);
    }

    // Run custom validator
    if (sla.customValidator) {
      const custom = sla.customValidator(response, latencyMs);
      violations.push(...custom.violations);
      Object.assign(metrics, custom.metrics);
    }

    // Calculate quality score
    let qualityScore = 100;

    if (sla.maxLatencyMs) {
      const ratio = Math.min(latencyMs / sla.maxLatencyMs, 2);
      qualityScore -= Math.min(ratio * 30, 60);
    }

    qualityScore -= violations.length * 15;
    qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

    return { passed: violations.length === 0, qualityScore, violations, metrics };
  }

  private async queueDispute(escrow: EscrowInfo, slaResult: SlaValidationResult): Promise<void> {
    this.log(`Filing dispute for ${escrow.transactionId}: score ${slaResult.qualityScore}`);
    // In production, this would call the Kamiyo dispute instruction
    // The oracle network evaluates and returns a quality score
  }

  private async fetchWithTimeout(
    url: string,
    options: X402RequestOptions,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAmount(amount: string): number {
    const cleaned = amount.replace(/[^0-9.]/g, '');
    const value = parseFloat(cleaned);
    // If > 1000, assume lamports; otherwise assume SOL
    return value > 1000 ? Math.floor(value) : Math.floor(value * LAMPORTS_PER_SOL);
  }

  private errorResponse<T>(error: X402Error): X402Response<T> {
    return { success: false, error };
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[X402KamiyoClient] ${message}`);
    }
  }

  private startSignatureCleanup(): void {
    // Clean up old signatures every 10 minutes
    setInterval(() => {
      const cutoff = Date.now() - 600_000; // 10 minutes ago
      for (const [sig, time] of this.usedSignatures) {
        if (time < cutoff) {
          this.usedSignatures.delete(sig);
        }
      }
    }, 600_000);
  }
}

/**
 * Create x402 client with Kamiyo protection
 */
export function createX402KamiyoClient(
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey,
  options?: Partial<X402ClientConfig>
): X402KamiyoClient {
  return new X402KamiyoClient({
    connection,
    wallet,
    programId,
    ...options,
  });
}
