/**
 * x402 Escrow Extension for PayAI
 *
 * Extends x402 protocol with escrow protection. Payments are locked in
 * Kamiyo escrow until service is verified, enabling dispute resolution
 * for agent-to-agent transactions.
 *
 * Headers:
 *   X-402-Escrow-Required: true|false
 *   X-402-Escrow-Timelock: seconds before auto-release
 *   X-402-Escrow-Quality-Threshold: min quality score (0-100) for full release
 *   X-402-Escrow-PDA: escrow account address (set by client after creation)
 *   X-402-Escrow-Transaction-Id: unique transaction identifier
 *
 * Flow:
 *   1. Server returns 402 with X-402-Escrow-Required: true
 *   2. Client creates Kamiyo escrow (funds locked)
 *   3. Client retries with X-402-Escrow-PDA header
 *   4. Server verifies escrow exists and is funded
 *   5. Server delivers service
 *   6. On success: client releases funds
 *   7. On failure: client disputes, oracles arbitrate
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { EscrowHandler, EscrowResult } from './escrow';
import { PayAIFacilitator, PaymentRequirement, PayAINetwork } from './payai';
import { X402Error } from './errors';
import { generateTransactionId } from './validation';

// Header names
export const X402_ESCROW_REQUIRED = 'x-402-escrow-required';
export const X402_ESCROW_TIMELOCK = 'x-402-escrow-timelock';
export const X402_ESCROW_QUALITY_THRESHOLD = 'x-402-escrow-quality-threshold';
export const X402_ESCROW_PDA = 'x-402-escrow-pda';
export const X402_ESCROW_TRANSACTION_ID = 'x-402-escrow-transaction-id';
export const X402_ESCROW_STATUS = 'x-402-escrow-status';

// Defaults
const DEFAULT_TIMELOCK_SECONDS = 3600; // 1 hour
const DEFAULT_QUALITY_THRESHOLD = 70;
const ESCROW_VERIFY_TIMEOUT_MS = 10_000;

export type EscrowStatus = 'none' | 'pending' | 'active' | 'released' | 'disputed' | 'resolved';

export interface EscrowRequirement {
  required: boolean;
  timelockSeconds: number;
  qualityThreshold: number;
}

export interface EscrowHeaders {
  required: boolean;
  timelockSeconds: number;
  qualityThreshold: number;
  pda?: string;
  transactionId?: string;
  status?: EscrowStatus;
}

export interface EscrowPaymentResult {
  success: boolean;
  escrowPda?: PublicKey;
  transactionId?: string;
  signature?: string;
  error?: string;
}

export interface EscrowVerifyResult {
  valid: boolean;
  escrowPda?: PublicKey;
  balance?: number;
  status?: EscrowStatus;
  error?: string;
}

export interface EscrowMiddlewareOptions {
  connection: Connection;
  programId: PublicKey;
  facilitator: PayAIFacilitator;
  priceUsd: number;
  description: string;
  timelockSeconds?: number;
  qualityThreshold?: number;
  networks?: PayAINetwork[];
  onEscrowCreated?: (pda: PublicKey, transactionId: string) => void;
  onEscrowReleased?: (pda: PublicKey, signature: string) => void;
  onEscrowDisputed?: (pda: PublicKey, signature: string) => void;
}

/**
 * Encode escrow requirement headers for 402 response
 */
export function escrowRequirementHeaders(
  timelockSeconds: number = DEFAULT_TIMELOCK_SECONDS,
  qualityThreshold: number = DEFAULT_QUALITY_THRESHOLD
): Record<string, string> {
  return {
    [X402_ESCROW_REQUIRED]: 'true',
    [X402_ESCROW_TIMELOCK]: String(timelockSeconds),
    [X402_ESCROW_QUALITY_THRESHOLD]: String(qualityThreshold),
  };
}

/**
 * Parse escrow headers from request
 */
export function parseEscrowHeaders(
  headers: Record<string, string | string[] | undefined>
): EscrowHeaders {
  const get = (key: string): string | undefined => {
    const v = headers[key] || headers[key.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };

  return {
    required: get(X402_ESCROW_REQUIRED) === 'true',
    timelockSeconds: parseInt(get(X402_ESCROW_TIMELOCK) || String(DEFAULT_TIMELOCK_SECONDS), 10),
    qualityThreshold: parseInt(get(X402_ESCROW_QUALITY_THRESHOLD) || String(DEFAULT_QUALITY_THRESHOLD), 10),
    pda: get(X402_ESCROW_PDA),
    transactionId: get(X402_ESCROW_TRANSACTION_ID),
    status: get(X402_ESCROW_STATUS) as EscrowStatus | undefined,
  };
}

/**
 * Check if request has valid escrow proof
 */
export function hasEscrowProof(
  headers: Record<string, string | string[] | undefined>
): boolean {
  const parsed = parseEscrowHeaders(headers);
  return !!parsed.pda && !!parsed.transactionId;
}

/**
 * Escrow-protected x402 client for agents
 */
export class EscrowX402Client {
  private readonly escrowHandler: EscrowHandler;
  private readonly facilitator: PayAIFacilitator;
  private readonly wallet: Keypair;

  constructor(
    private readonly connection: Connection,
    wallet: Keypair,
    private readonly programId: PublicKey,
    facilitator: PayAIFacilitator
  ) {
    this.wallet = wallet;
    this.escrowHandler = new EscrowHandler({
      connection,
      wallet,
      programId,
    });
    this.facilitator = facilitator;
  }

  /**
   * Make a request with escrow protection
   */
  async request(
    url: string,
    options?: RequestInit & {
      provider?: PublicKey;
      maxRetries?: number;
    }
  ): Promise<Response> {
    const maxRetries = options?.maxRetries ?? 3;

    // First request to get 402 response
    let response = await fetch(url, options);

    if (response.status !== 402) {
      return response;
    }

    // Parse 402 response
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    const escrowHeaders = parseEscrowHeaders(headersObj);

    if (!escrowHeaders.required) {
      // Regular x402 payment (no escrow)
      return response;
    }

    // Get payment requirements from body
    const body = await response.json();
    const requirements = body.accepts as PaymentRequirement[] | undefined;

    if (!requirements?.length) {
      throw new X402Error('INVALID_PAYMENT_REQUIREMENT', 'No payment requirements in 402 response');
    }

    // Find Solana requirement (we only support Solana escrow for now)
    const solanaReq = requirements.find(r => r.network === 'solana' || r.network === 'solana-devnet');
    if (!solanaReq) {
      throw new X402Error('INVALID_PAYMENT_REQUIREMENT', 'Escrow requires Solana network');
    }

    // Determine provider from payTo
    const provider = options?.provider || new PublicKey(solanaReq.payTo);

    // Convert USDC micro-units to lamports
    // PayAI uses USDC with 6 decimals, we need SOL lamports
    // For now, assume 1:1 for simplicity - in production would use Jupiter
    const amountMicro = parseInt(solanaReq.maxAmountRequired, 10);
    const amountLamports = Math.ceil(amountMicro * 1000); // rough conversion

    // Generate transaction ID
    const transactionId = generateTransactionId();

    // Create escrow
    const escrowResult = await this.escrowHandler.create({
      provider,
      amount: amountLamports,
      timeLockSeconds: escrowHeaders.timelockSeconds,
      transactionId,
    });

    if (!escrowResult.success || !escrowResult.escrowPda) {
      throw escrowResult.error || new X402Error('ESCROW_CREATION_FAILED', 'Failed to create escrow');
    }

    // Retry with escrow proof
    const escrowProofHeaders = {
      [X402_ESCROW_PDA]: escrowResult.escrowPda.toBase58(),
      [X402_ESCROW_TRANSACTION_ID]: transactionId,
    };

    for (let retry = 0; retry < maxRetries; retry++) {
      response = await fetch(url, {
        ...options,
        headers: {
          ...options?.headers,
          ...escrowProofHeaders,
        },
      });

      if (response.ok) {
        return response;
      }

      if (response.status !== 402) {
        // Something else went wrong, dispute with recovery
        const disputeResult = await this.escrowHandler.disputeWithRecovery(transactionId);
        const stateInfo = disputeResult.success ? ` (dispute state: ${disputeResult.state})` : '';
        throw new X402Error('PAYMENT_FAILED', `Request failed with status ${response.status}${stateInfo}`);
      }
    }

    // All retries failed, dispute with recovery
    const disputeResult = await this.escrowHandler.disputeWithRecovery(transactionId);
    const stateInfo = disputeResult.success ? ` (dispute state: ${disputeResult.state})` : '';
    throw new X402Error('NETWORK_ERROR', `Max retries exceeded${stateInfo}`);
  }

  /**
   * Release funds after successful service
   */
  async release(transactionId: string, provider: PublicKey): Promise<EscrowResult> {
    return this.escrowHandler.release(transactionId, provider);
  }

  /**
   * Dispute a transaction with automatic recovery
   */
  async dispute(transactionId: string): Promise<EscrowResult> {
    return this.escrowHandler.disputeWithRecovery(transactionId);
  }

  /**
   * Get escrow status including state
   */
  async getStatus(transactionId: string) {
    return this.escrowHandler.getStatus(transactionId);
  }

  /**
   * Wait for escrow to reach a specific state
   */
  async waitForState(
    transactionId: string,
    targetState: 'active' | 'released' | 'disputed' | 'resolved',
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ) {
    return this.escrowHandler.waitForState(transactionId, targetState, options);
  }

  /**
   * Check escrow status
   */
  async getEscrowBalance(transactionId: string): Promise<number> {
    return this.escrowHandler.getBalance(transactionId);
  }

  /**
   * Check if escrow exists
   */
  async escrowExists(transactionId: string): Promise<boolean> {
    return this.escrowHandler.exists(transactionId);
  }
}

/**
 * Verify escrow on-chain
 */
export async function verifyEscrow(
  connection: Connection,
  programId: PublicKey,
  escrowPda: PublicKey,
  minBalance?: number
): Promise<EscrowVerifyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ESCROW_VERIFY_TIMEOUT_MS);

  try {
    const info = await connection.getAccountInfo(escrowPda);

    if (!info) {
      return { valid: false, error: 'Escrow account not found' };
    }

    if (!info.owner.equals(programId)) {
      return { valid: false, error: 'Invalid escrow owner' };
    }

    const balance = info.lamports / LAMPORTS_PER_SOL;

    if (minBalance !== undefined && balance < minBalance) {
      return { valid: false, error: `Insufficient balance: ${balance} < ${minBalance}` };
    }

    // Parse escrow data to get status
    // First 8 bytes are discriminator, then data follows
    // Status is at offset 8 + 32 (agent) + 32 (provider) + 8 (amount) + 8 (timelock) + 8 (created) = 96
    let status: EscrowStatus = 'active';
    if (info.data.length >= 97) {
      const statusByte = info.data[96];
      switch (statusByte) {
        case 0: status = 'active'; break;
        case 1: status = 'released'; break;
        case 2: status = 'disputed'; break;
        case 3: status = 'resolved'; break;
        default: status = 'active';
      }
    }

    return {
      valid: true,
      escrowPda,
      balance,
      status,
    };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : 'Verification failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Express middleware for escrow-protected endpoints
 */
export function escrowMiddleware(opts: EscrowMiddlewareOptions) {
  return async (
    req: { headers: Record<string, string | string[] | undefined>; url?: string; path?: string },
    res: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (k: string, v: string) => void },
    next: (err?: unknown) => void
  ): Promise<void> => {
    const resource = req.path || req.url || '/';
    const escrowHeaders = parseEscrowHeaders(req.headers);

    // Check if request has escrow proof
    if (!escrowHeaders.pda || !escrowHeaders.transactionId) {
      // Return 402 with escrow requirements
      const payaiBody = opts.facilitator.response402(
        resource,
        opts.priceUsd,
        opts.description,
        opts.networks
      );

      const payaiHeaders = opts.facilitator.headers402(
        resource,
        opts.priceUsd,
        opts.description,
        opts.networks?.[0]
      );

      const escrowReqHeaders = escrowRequirementHeaders(
        opts.timelockSeconds,
        opts.qualityThreshold
      );

      // Set all headers
      Object.entries({ ...payaiHeaders, ...escrowReqHeaders }).forEach(([k, v]) => {
        res.setHeader(k, v);
      });

      res.status(402).json({
        ...payaiBody,
        escrow: {
          required: true,
          timelockSeconds: opts.timelockSeconds || DEFAULT_TIMELOCK_SECONDS,
          qualityThreshold: opts.qualityThreshold || DEFAULT_QUALITY_THRESHOLD,
        },
      });
      return;
    }

    // Verify escrow
    let escrowPda: PublicKey;
    try {
      escrowPda = new PublicKey(escrowHeaders.pda);
    } catch {
      res.status(400).json({ error: 'Invalid escrow PDA' });
      return;
    }

    const verification = await verifyEscrow(
      opts.connection,
      opts.programId,
      escrowPda
    );

    if (!verification.valid) {
      res.status(402).json({
        error: 'Escrow verification failed',
        reason: verification.error,
        escrow: {
          required: true,
          timelockSeconds: opts.timelockSeconds || DEFAULT_TIMELOCK_SECONDS,
          qualityThreshold: opts.qualityThreshold || DEFAULT_QUALITY_THRESHOLD,
        },
      });
      return;
    }

    if (verification.status !== 'active') {
      res.status(402).json({
        error: 'Escrow not active',
        status: verification.status,
      });
      return;
    }

    // Escrow verified, proceed
    opts.onEscrowCreated?.(escrowPda, escrowHeaders.transactionId);
    next();
  };
}

/**
 * Combined PayAI + Escrow middleware
 */
export function payaiEscrowMiddleware(opts: EscrowMiddlewareOptions) {
  return async (
    req: { headers: Record<string, string | string[] | undefined>; url?: string; path?: string },
    res: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (k: string, v: string) => void },
    next: (err?: unknown) => void
  ): Promise<void> => {
    const escrowHeaders = parseEscrowHeaders(req.headers);

    // If escrow proof provided, verify it
    if (escrowHeaders.pda && escrowHeaders.transactionId) {
      return escrowMiddleware(opts)(req, res, next);
    }

    // Check for regular x402 payment header
    const paymentHeader = req.headers['x-payment'];
    if (paymentHeader && !Array.isArray(paymentHeader)) {
      // Has x402 payment but no escrow - allow but log
      // In strict mode, could require escrow
      next();
      return;
    }

    // No payment or escrow - return 402 with both requirements
    const resource = req.path || req.url || '/';

    const payaiBody = opts.facilitator.response402(
      resource,
      opts.priceUsd,
      opts.description,
      opts.networks
    );

    const payaiHeaders = opts.facilitator.headers402(
      resource,
      opts.priceUsd,
      opts.description,
      opts.networks?.[0]
    );

    const escrowReqHeaders = escrowRequirementHeaders(
      opts.timelockSeconds,
      opts.qualityThreshold
    );

    Object.entries({ ...payaiHeaders, ...escrowReqHeaders }).forEach(([k, v]) => {
      res.setHeader(k, v);
    });

    res.status(402).json({
      ...payaiBody,
      escrow: {
        required: true,
        timelockSeconds: opts.timelockSeconds || DEFAULT_TIMELOCK_SECONDS,
        qualityThreshold: opts.qualityThreshold || DEFAULT_QUALITY_THRESHOLD,
        message: 'Create Kamiyo escrow and include X-402-Escrow-PDA header',
      },
    });
  };
}

/**
 * Create escrow client for agent
 */
export function createEscrowX402Client(
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey,
  facilitator: PayAIFacilitator
): EscrowX402Client {
  return new EscrowX402Client(connection, wallet, programId, facilitator);
}

/**
 * Escrow extension for PayAI 402 response
 */
export interface Escrow402Extension {
  required: boolean;
  timelockSeconds: number;
  qualityThreshold: number;
  programId: string;
  message?: string;
}

/**
 * Build 402 response with escrow extension
 */
export function buildEscrow402Response(
  facilitator: PayAIFacilitator,
  resource: string,
  priceUsd: number,
  description: string,
  programId: PublicKey,
  options?: {
    networks?: PayAINetwork[];
    timelockSeconds?: number;
    qualityThreshold?: number;
  }
): {
  body: Record<string, unknown>;
  headers: Record<string, string>;
} {
  const payaiBody = facilitator.response402(
    resource,
    priceUsd,
    description,
    options?.networks
  );

  const payaiHeaders = facilitator.headers402(
    resource,
    priceUsd,
    description,
    options?.networks?.[0]
  );

  const escrowReqHeaders = escrowRequirementHeaders(
    options?.timelockSeconds,
    options?.qualityThreshold
  );

  const escrowExtension: Escrow402Extension = {
    required: true,
    timelockSeconds: options?.timelockSeconds || DEFAULT_TIMELOCK_SECONDS,
    qualityThreshold: options?.qualityThreshold || DEFAULT_QUALITY_THRESHOLD,
    programId: programId.toBase58(),
    message: 'Create Kamiyo escrow for dispute protection',
  };

  return {
    body: {
      ...payaiBody,
      escrow: escrowExtension,
    },
    headers: {
      ...payaiHeaders,
      ...escrowReqHeaders,
    },
  };
}

/**
 * Quality-based refund calculation
 */
export function calculateRefund(
  qualityScore: number,
  amount: number,
  threshold: number = DEFAULT_QUALITY_THRESHOLD
): { agentRefund: number; providerPayment: number } {
  if (qualityScore >= threshold) {
    // Quality met - provider gets full amount
    return { agentRefund: 0, providerPayment: amount };
  }

  if (qualityScore < 50) {
    // Quality severely lacking - agent gets full refund
    return { agentRefund: amount, providerPayment: 0 };
  }

  // Graduated refund based on quality
  // 50-69: 75% refund
  // 70-threshold: linear scale
  if (qualityScore < 70) {
    const refund = Math.floor(amount * 0.75);
    return { agentRefund: refund, providerPayment: amount - refund };
  }

  // Linear scale from 70 to threshold
  const range = threshold - 70;
  const position = qualityScore - 70;
  const refundPercent = 1 - (position / range);
  const refund = Math.floor(amount * refundPercent * 0.75);

  return { agentRefund: refund, providerPayment: amount - refund };
}
