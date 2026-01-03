import { X402Program } from '../solana/anchor.js';
import { createEscrow, CreateEscrowParams } from './escrow.js';
import { assessDataQuality } from './quality.js';
import { fileDispute } from './dispute.js';
import { getApiReputation } from './reputation.js';

export interface CallApiWithEscrowParams {
  apiUrl: string; // API endpoint to call
  apiProvider: string; // API provider wallet address
  amount: number; // Payment amount in SOL
  expectedCriteria?: string[]; // Expected fields in response
  timeLock?: number; // Escrow expiry in seconds
  autoDispute?: boolean; // Automatically file dispute if quality is low (default: false)
  qualityThreshold?: number; // Quality score threshold for auto-dispute (default: 50)
}

export interface CallApiWithEscrowResult {
  success: boolean;
  escrowAddress?: string;
  transactionId?: string;
  apiResponse?: any;
  qualityScore?: number;
  refundPercentage?: number;
  disputeFiled?: boolean;
  finalStatus?: 'completed' | 'disputed' | 'failed';
  signature?: string;
  error?: string;
}

/**
 * Unified workflow: Create escrow -> Call API -> Assess quality -> Dispute if needed
 *
 * This is the main end-to-end tool that agents should use for making
 * protected API calls with automatic quality assessment and dispute filing.
 */
export async function callApiWithEscrow(
  params: CallApiWithEscrowParams,
  program: X402Program
): Promise<CallApiWithEscrowResult> {
  try {
    // Step 1: Check API provider reputation
    console.log('Checking API provider reputation...');
    const reputationResult = await getApiReputation(
      { apiProvider: params.apiProvider },
      program
    );

    if (reputationResult.success && reputationResult.recommendation === 'avoid') {
      return {
        success: false,
        error: `API provider has poor reputation (score: ${reputationResult.reputationScore}/1000). Transaction not recommended.`,
        finalStatus: 'failed',
      };
    }

    // Step 2: Create escrow
    console.log('Creating escrow...');
    const escrowParams: CreateEscrowParams = {
      api: params.apiProvider,
      amount: params.amount,
      timeLock: params.timeLock,
    };

    const escrowResult = await createEscrow(escrowParams, program);

    if (!escrowResult.success) {
      return {
        success: false,
        error: `Failed to create escrow: ${escrowResult.error}`,
        finalStatus: 'failed',
      };
    }

    console.log(`Escrow created: ${escrowResult.escrowAddress}`);
    console.log(`Transaction ID: ${escrowResult.transactionId}`);

    // Step 3: Call API with payment proof
    console.log(`Calling API: ${params.apiUrl}`);
    let apiResponse: any;

    try {
      const response = await fetch(params.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Proof': escrowResult.transactionId!,
          'X-Escrow-Address': escrowResult.escrowAddress!,
        },
      });

      apiResponse = await response.json();
      console.log('API response received');
    } catch (error: any) {
      return {
        success: false,
        escrowAddress: escrowResult.escrowAddress,
        transactionId: escrowResult.transactionId,
        error: `API call failed: ${error.message}`,
        finalStatus: 'failed',
      };
    }

    // Step 4: Assess data quality
    console.log('Assessing data quality...');
    const qualityResult = await assessDataQuality({
      apiResponse,
      expectedCriteria: params.expectedCriteria || [],
    });

    if (!qualityResult.success) {
      return {
        success: false,
        escrowAddress: escrowResult.escrowAddress,
        transactionId: escrowResult.transactionId,
        apiResponse,
        error: `Quality assessment failed: ${qualityResult.error}`,
        finalStatus: 'failed',
      };
    }

    console.log(`Quality score: ${qualityResult.qualityScore}/100`);
    console.log(`Refund percentage: ${qualityResult.refundPercentage}%`);
    console.log(`Rationale: ${qualityResult.rationale}`);

    // Step 5: Auto-dispute if quality is below threshold
    const autoDispute = params.autoDispute !== false; // Default true
    const qualityThreshold = params.qualityThreshold || 50;
    let disputeFiled = false;

    if (autoDispute && qualityResult.qualityScore! < qualityThreshold) {
      console.log(
        `Quality score (${qualityResult.qualityScore}) below threshold (${qualityThreshold}). Filing dispute...`
      );

      const disputeResult = await fileDispute(
        {
          transactionId: escrowResult.transactionId!,
          qualityScore: qualityResult.qualityScore!,
          refundPercentage: qualityResult.refundPercentage!,
          evidence: {
            apiUrl: params.apiUrl,
            apiResponse,
            qualityAssessment: qualityResult,
            timestamp: Date.now(),
          },
        },
        program
      );

      if (disputeResult.success) {
        console.log('Dispute filed successfully');
        disputeFiled = true;
      } else {
        console.error(`Failed to file dispute: ${disputeResult.error}`);
      }
    }

    // Return complete results
    return {
      success: true,
      escrowAddress: escrowResult.escrowAddress,
      transactionId: escrowResult.transactionId,
      apiResponse,
      qualityScore: qualityResult.qualityScore,
      refundPercentage: qualityResult.refundPercentage,
      disputeFiled,
      finalStatus: disputeFiled ? 'disputed' : 'completed',
      signature: escrowResult.signature,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to execute API call with escrow',
      finalStatus: 'failed',
    };
  }
}
