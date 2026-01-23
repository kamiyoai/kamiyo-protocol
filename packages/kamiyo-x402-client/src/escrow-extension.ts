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
import {
  declareEscrowExtension,
  parseEscrowPayload,
  parseEscrowExtension,
  validateEscrowPayload,
  ESCROW_EXTENSION_KEY,
} from './v2/extensions';
import type {
  KamiyoEscrowInfo,
  KamiyoEscrowPayload,
  PaymentRequired402,
  ExtensionDeclaration,
} from './v2/types';

export { ESCROW_EXTENSION_KEY } from './v2/extensions';
export type { KamiyoEscrowInfo, KamiyoEscrowPayload } from './v2/types';

const DEFAULT_TIMELOCK_SECONDS = 3600;
const DEFAULT_QUALITY_THRESHOLD = 70;
const ESCROW_VERIFY_TIMEOUT_MS = 10_000;

export type EscrowStatus = 'none' | 'pending' | 'active' | 'released' | 'disputed' | 'resolved';

export interface EscrowRequirement {
  required: boolean;
  timelockSeconds: number;
  qualityThreshold: number;
  programId: string;
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

export function escrowExtensionInfo(
  programId: string,
  opts?: { timelockSeconds?: number; qualityThreshold?: number; required?: boolean }
): Record<string, ExtensionDeclaration> {
  return declareEscrowExtension({
    programId,
    timelockSeconds: opts?.timelockSeconds,
    qualityThreshold: opts?.qualityThreshold,
    required: opts?.required,
  });
}

export function buildEscrowPayloadV2(data: {
  escrowPda: string;
  transactionId: string;
  agentPk: string;
}): Record<string, ExtensionDeclaration> {
  return { [ESCROW_EXTENSION_KEY]: { info: data as unknown as Record<string, unknown> } };
}

export function parseEscrowRequirement(
  response: PaymentRequired402 | { extensions?: Record<string, ExtensionDeclaration> }
): EscrowRequirement | null {
  const info = parseEscrowExtension(response);
  if (!info) return null;
  return {
    required: info.required,
    timelockSeconds: info.timelockSeconds,
    qualityThreshold: info.qualityThreshold,
    programId: info.programId,
  };
}

export function hasEscrowProof(
  extensions?: Record<string, unknown>
): boolean {
  const payload = parseEscrowPayload(extensions);
  return payload !== null;
}

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

  async request(
    url: string,
    options?: RequestInit & {
      provider?: PublicKey;
      maxRetries?: number;
    }
  ): Promise<Response> {
    const maxRetries = options?.maxRetries ?? 3;

    let response = await fetch(url, options);

    if (response.status !== 402) {
      return response;
    }

    const responseBody = await response.json() as PaymentRequired402;
    const escrowInfo = parseEscrowExtension(responseBody);

    if (!escrowInfo?.required) {
      return response;
    }

    const requirements = responseBody.accepts;
    if (!requirements?.length) {
      throw new X402Error('INVALID_PAYMENT_REQUIREMENT', 'No payment requirements in 402 response');
    }

    const solanaReq = requirements.find(r =>
      r.network.startsWith('solana:')
    );
    if (!solanaReq) {
      throw new X402Error('INVALID_PAYMENT_REQUIREMENT', 'Escrow requires Solana network');
    }

    const provider = options?.provider || new PublicKey(solanaReq.payTo);
    const amountMicro = parseInt(solanaReq.amount, 10);
    const amountLamports = Math.ceil(amountMicro * 1000);
    const transactionId = generateTransactionId();

    const escrowResult = await this.escrowHandler.create({
      provider,
      amount: amountLamports,
      timeLockSeconds: escrowInfo.timelockSeconds,
      transactionId,
    });

    if (!escrowResult.success || !escrowResult.escrowPda) {
      throw escrowResult.error || new X402Error('ESCROW_CREATION_FAILED', 'Failed to create escrow');
    }

    const escrowPayload = buildEscrowPayloadV2({
      escrowPda: escrowResult.escrowPda.toBase58(),
      transactionId,
      agentPk: this.wallet.publicKey.toBase58(),
    });

    for (let retry = 0; retry < maxRetries; retry++) {
      const bodyWithEscrow = {
        ...(options?.body ? JSON.parse(options.body as string) : {}),
        extensions: escrowPayload,
      };
      response = await fetch(url, {
        ...options,
        headers: {
          ...options?.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyWithEscrow),
      });

      if (response.ok) {
        return response;
      }

      if (response.status !== 402) {
        const disputeResult = await this.escrowHandler.disputeWithRecovery(transactionId);
        const stateInfo = disputeResult.success ? ` (dispute state: ${disputeResult.state})` : '';
        throw new X402Error('PAYMENT_FAILED', `Request failed with status ${response.status}${stateInfo}`);
      }
    }

    const disputeResult = await this.escrowHandler.disputeWithRecovery(transactionId);
    const stateInfo = disputeResult.success ? ` (dispute state: ${disputeResult.state})` : '';
    throw new X402Error('NETWORK_ERROR', `Max retries exceeded${stateInfo}`);
  }

  async release(transactionId: string, provider: PublicKey): Promise<EscrowResult> {
    return this.escrowHandler.release(transactionId, provider);
  }

  async dispute(transactionId: string): Promise<EscrowResult> {
    return this.escrowHandler.disputeWithRecovery(transactionId);
  }

  async getStatus(transactionId: string) {
    return this.escrowHandler.getStatus(transactionId);
  }

  async waitForState(
    transactionId: string,
    targetState: 'active' | 'released' | 'disputed' | 'resolved',
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ) {
    return this.escrowHandler.waitForState(transactionId, targetState, options);
  }

  async getEscrowBalance(transactionId: string): Promise<number> {
    return this.escrowHandler.getBalance(transactionId);
  }

  async escrowExists(transactionId: string): Promise<boolean> {
    return this.escrowHandler.exists(transactionId);
  }
}

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

    // Status byte at offset 96: 8 (discriminator) + 32 (agent) + 32 (provider) + 8 (amount) + 8 (timelock) + 8 (created)
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

export function escrowMiddleware(opts: EscrowMiddlewareOptions) {
  return async (
    req: { body?: { extensions?: Record<string, unknown> }; url?: string; path?: string },
    res: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (k: string, v: string) => void },
    next: (err?: unknown) => void
  ): Promise<void> => {
    const resource = req.path || req.url || '/';
    const escrowPayload = parseEscrowPayload(req.body?.extensions);

    if (!escrowPayload) {
      const escrowExt = escrowExtensionInfo(opts.programId.toBase58(), {
        timelockSeconds: opts.timelockSeconds,
        qualityThreshold: opts.qualityThreshold,
      });

      const body = opts.facilitator.response402(
        resource,
        opts.priceUsd,
        opts.description,
        opts.networks,
        escrowExt
      );

      const headers = opts.facilitator.headers402();
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

      res.status(402).json(body);
      return;
    }

    const validation = validateEscrowPayload(escrowPayload);
    if (!validation.valid) {
      res.status(400).json({ error: 'Invalid escrow payload', reason: validation.errors[0] });
      return;
    }

    let escrowPda: PublicKey;
    try {
      escrowPda = new PublicKey(escrowPayload.escrowPda);
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

    opts.onEscrowCreated?.(escrowPda, escrowPayload.transactionId);
    next();
  };
}

export function payaiEscrowMiddleware(opts: EscrowMiddlewareOptions) {
  return async (
    req: { body?: { extensions?: Record<string, unknown> }; headers: Record<string, string | string[] | undefined>; url?: string; path?: string },
    res: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (k: string, v: string) => void },
    next: (err?: unknown) => void
  ): Promise<void> => {
    if (hasEscrowProof(req.body?.extensions)) {
      return escrowMiddleware(opts)(req, res, next);
    }

    const paymentHeader = req.headers['payment-signature'];
    if (paymentHeader && !Array.isArray(paymentHeader)) {
      next();
      return;
    }

    const resource = req.path || req.url || '/';
    const escrowExt = escrowExtensionInfo(opts.programId.toBase58(), {
      timelockSeconds: opts.timelockSeconds,
      qualityThreshold: opts.qualityThreshold,
    });

    const body = opts.facilitator.response402(
      resource,
      opts.priceUsd,
      opts.description,
      opts.networks,
      escrowExt
    );

    const headers = opts.facilitator.headers402();
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

    res.status(402).json(body);
  };
}

export function createEscrowX402Client(
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey,
  facilitator: PayAIFacilitator
): EscrowX402Client {
  return new EscrowX402Client(connection, wallet, programId, facilitator);
}

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
  body: PaymentRequired402;
  headers: Record<string, string>;
} {
  const escrowExt = escrowExtensionInfo(programId.toBase58(), {
    timelockSeconds: options?.timelockSeconds,
    qualityThreshold: options?.qualityThreshold,
  });

  const body = facilitator.response402(
    resource,
    priceUsd,
    description,
    options?.networks,
    escrowExt
  );

  return {
    body: body as unknown as PaymentRequired402,
    headers: facilitator.headers402(),
  };
}

export function calculateRefund(
  qualityScore: number,
  amount: number,
  threshold: number = DEFAULT_QUALITY_THRESHOLD
): { agentRefund: number; providerPayment: number } {
  if (qualityScore >= threshold) {
    return { agentRefund: 0, providerPayment: amount };
  }

  if (qualityScore < 50) {
    return { agentRefund: amount, providerPayment: 0 };
  }

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
