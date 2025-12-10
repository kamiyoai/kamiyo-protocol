import { PublicKey } from '@solana/web3.js';
import { X402Program } from '../solana/anchor.js';
import { parseEscrowStatus } from '../solana/transactions.js';

export interface FileDisputeParams {
  transactionId: string;
  qualityScore: number; // 0-100
  evidence: Record<string, any>; // Evidence supporting the dispute
  refundPercentage: number; // 0-100
}

export interface FileDisputeResult {
  success: boolean;
  disputeId?: string;
  status?: 'disputed';
  signature?: string;
  message?: string;
  error?: string;
}

/**
 * File a dispute for an escrow
 *
 * This marks the escrow as disputed on-chain. In production,
 * this would also submit the dispute to a verifier oracle
 * for quality assessment and resolution.
 *
 * For now, this only marks the escrow as disputed. The actual
 * resolution with oracle signature would be handled separately
 * via resolve_dispute instruction.
 */
export async function fileDispute(
  params: FileDisputeParams,
  program: X402Program
): Promise<FileDisputeResult> {
  try {
    // Validate inputs
    if (!params.transactionId) {
      return { success: false, error: 'Transaction ID is required' };
    }

    if (params.qualityScore < 0 || params.qualityScore > 100) {
      return { success: false, error: 'Quality score must be between 0 and 100' };
    }

    if (params.refundPercentage < 0 || params.refundPercentage > 100) {
      return { success: false, error: 'Refund percentage must be between 0 and 100' };
    }

    // Check if escrow exists
    const exists = await program.escrowExists(params.transactionId);
    if (!exists) {
      return { success: false, error: 'Escrow not found' };
    }

    // Get escrow account to verify status
    const [escrowPDA] = program.pda.deriveEscrowPDA(params.transactionId);
    const escrow = await program.getEscrowAccount(escrowPDA);
    const status = parseEscrowStatus(escrow.status);

    // Verify escrow is active
    if (status !== 'Active') {
      return {
        success: false,
        error: `Cannot dispute escrow in ${status} status. Only Active escrows can be disputed.`,
      };
    }

    // Check if agent reputation exists, if not create it
    const agentReputationExists = await program.reputationExists(program.program.provider.publicKey!);
    if (!agentReputationExists) {
      await program.initReputation();
    }

    // Mark escrow as disputed
    const signature = await program.markDisputed(params.transactionId);

    // In a production system, we would also:
    // 1. Submit evidence to verifier oracle
    // 2. Wait for oracle assessment
    // 3. Get Ed25519 signature from oracle
    // 4. Call resolve_dispute with signature
    //
    // For this MCP implementation, the dispute filing is separate
    // from resolution. The verifier oracle integration would be
    // implemented as a separate service.

    return {
      success: true,
      disputeId: params.transactionId,
      status: 'disputed',
      signature,
      message: `Dispute filed for transaction ${params.transactionId}. Quality score: ${params.qualityScore}, Refund: ${params.refundPercentage}%. Waiting for verifier oracle resolution.`,
    };
  } catch (error: any) {
    // Parse common Anchor errors
    let errorMessage = error.message || 'Failed to file dispute';

    if (errorMessage.includes('DisputeWindowExpired')) {
      errorMessage = 'Dispute window has expired. Cannot dispute after time lock expires.';
    } else if (errorMessage.includes('InsufficientDisputeFunds')) {
      errorMessage = 'Insufficient funds to pay dispute cost.';
    } else if (errorMessage.includes('Unauthorized')) {
      errorMessage = 'Only the agent who created the escrow can file a dispute.';
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get dispute cost for an entity based on their reputation
 *
 * Higher dispute frequency = higher cost to prevent abuse
 */
export async function getDisputeCost(
  entity: PublicKey,
  program: X402Program
): Promise<{ success: boolean; cost?: number; error?: string }> {
  try {
    const BASE_DISPUTE_COST = 1_000_000; // 0.001 SOL

    // Check if reputation exists
    const exists = await program.reputationExists(entity);
    if (!exists) {
      return {
        success: true,
        cost: BASE_DISPUTE_COST / 1_000_000_000, // Return in SOL
      };
    }

    const [reputationPDA] = program.pda.deriveReputationPDA(entity);
    const reputation = await program.getReputationAccount(reputationPDA);

    // Calculate dispute rate
    const totalTxs = Number(reputation.totalTransactions);
    const disputesFiled = Number(reputation.disputesFiled);

    if (totalTxs === 0) {
      return {
        success: true,
        cost: BASE_DISPUTE_COST / 1_000_000_000,
      };
    }

    const disputeRate = (disputesFiled * 100) / totalTxs;

    // Calculate multiplier based on dispute rate
    let multiplier = 1;
    if (disputeRate > 60) {
      multiplier = 10; // Abuse pattern
    } else if (disputeRate > 40) {
      multiplier = 5; // Very high
    } else if (disputeRate > 20) {
      multiplier = 2; // High
    } else {
      multiplier = 1; // Normal
    }

    const cost = BASE_DISPUTE_COST * multiplier;

    return {
      success: true,
      cost: cost / 1_000_000_000, // Return in SOL
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to calculate dispute cost',
    };
  }
}
