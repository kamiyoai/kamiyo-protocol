import { PublicKey } from '@solana/web3.js';
import { X402Program } from '../solana/anchor.js';
import { generateTransactionId, parseEscrowStatus, lamportsToSol, solToLamports } from '../solana/transactions.js';

export interface CreateEscrowParams {
  api: string; // API provider wallet address
  amount: number; // Payment amount in SOL
  timeLock?: number; // Escrow expiry in seconds (default: 3600 = 1 hour)
}

export interface CreateEscrowResult {
  success: boolean;
  escrowAddress?: string;
  transactionId?: string;
  signature?: string;
  error?: string;
}

export interface CheckEscrowParams {
  escrowAddress?: string;
  transactionId?: string;
}

export interface CheckEscrowResult {
  success: boolean;
  status?: 'Active' | 'Disputed' | 'Resolved' | 'Released';
  agent?: string;
  api?: string;
  amount?: number; // In SOL
  createdAt?: number;
  expiresAt?: number;
  transactionId?: string;
  qualityScore?: number;
  refundPercentage?: number;
  error?: string;
}

export interface VerifyPaymentParams {
  transactionId: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  verified?: boolean;
  escrowAddress?: string;
  amount?: number; // In SOL
  status?: string;
  error?: string;
}

/**
 * Create a new escrow for API payment
 */
export async function createEscrow(
  params: CreateEscrowParams,
  program: X402Program
): Promise<CreateEscrowResult> {
  try {
    // Validate inputs
    if (!params.api) {
      return { success: false, error: 'API provider address is required' };
    }

    if (!params.amount || params.amount <= 0) {
      return { success: false, error: 'Amount must be greater than 0' };
    }

    // Convert amount to lamports
    const amountLamports = solToLamports(params.amount);

    // Validate amount is within bounds
    const MIN_ESCROW_AMOUNT = 1_000_000; // 0.001 SOL
    const MAX_ESCROW_AMOUNT = 1_000_000_000_000; // 1000 SOL

    if (amountLamports < MIN_ESCROW_AMOUNT) {
      return { success: false, error: 'Amount too small (minimum 0.001 SOL)' };
    }

    if (amountLamports > MAX_ESCROW_AMOUNT) {
      return { success: false, error: 'Amount too large (maximum 1000 SOL)' };
    }

    // Parse API provider public key
    const apiPublicKey = new PublicKey(params.api);

    // Generate unique transaction ID
    const transactionId = generateTransactionId();

    // Default time lock: 1 hour (3600 seconds)
    const timeLock = params.timeLock || 3600;

    // Validate time lock
    const MIN_TIME_LOCK = 3600; // 1 hour
    const MAX_TIME_LOCK = 2_592_000; // 30 days

    if (timeLock < MIN_TIME_LOCK || timeLock > MAX_TIME_LOCK) {
      return {
        success: false,
        error: `Time lock must be between ${MIN_TIME_LOCK} and ${MAX_TIME_LOCK} seconds`,
      };
    }

    // Initialize escrow
    const result = await program.initializeEscrow({
      api: apiPublicKey,
      amount: amountLamports,
      timeLock,
      transactionId,
    });

    return {
      success: true,
      escrowAddress: result.escrowPDA.toBase58(),
      transactionId,
      signature: result.signature,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create escrow',
    };
  }
}

/**
 * Check the status of an escrow
 */
export async function checkEscrowStatus(
  params: CheckEscrowParams,
  program: X402Program
): Promise<CheckEscrowResult> {
  try {
    let escrowPDA: PublicKey;

    if (params.escrowAddress) {
      escrowPDA = new PublicKey(params.escrowAddress);
    } else if (params.transactionId) {
      [escrowPDA] = program.pda.deriveEscrowPDA(params.transactionId);
    } else {
      return { success: false, error: 'Either escrowAddress or transactionId is required' };
    }

    // Fetch escrow account
    const escrow = await program.getEscrowAccount(escrowPDA);

    return {
      success: true,
      status: parseEscrowStatus(escrow.status),
      agent: escrow.agent.toBase58(),
      api: escrow.api.toBase58(),
      amount: lamportsToSol(Number(escrow.amount)),
      createdAt: Number(escrow.createdAt),
      expiresAt: Number(escrow.expiresAt),
      transactionId: escrow.transactionId,
      qualityScore: escrow.qualityScore !== null ? escrow.qualityScore : undefined,
      refundPercentage: escrow.refundPercentage !== null ? escrow.refundPercentage : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch escrow status',
    };
  }
}

/**
 * Verify that payment was received and escrow is active
 */
export async function verifyPayment(
  params: VerifyPaymentParams,
  program: X402Program
): Promise<VerifyPaymentResult> {
  try {
    const [escrowPDA] = program.pda.deriveEscrowPDA(params.transactionId);

    // Check if escrow exists
    const exists = await program.escrowExists(params.transactionId);

    if (!exists) {
      return {
        success: true,
        verified: false,
        error: 'Escrow not found',
      };
    }

    // Fetch escrow details
    const escrow = await program.getEscrowAccount(escrowPDA);
    const status = parseEscrowStatus(escrow.status);

    return {
      success: true,
      verified: status === 'Active',
      escrowAddress: escrowPDA.toBase58(),
      amount: lamportsToSol(Number(escrow.amount)),
      status,
    };
  } catch (error: any) {
    return {
      success: false,
      verified: false,
      error: error.message || 'Failed to verify payment',
    };
  }
}
