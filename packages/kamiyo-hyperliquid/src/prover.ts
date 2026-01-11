/**
 * ZK Prover for Hyperliquid Reputation Tiers
 *
 * Re-exports from @kamiyo/tetsuo with Hyperliquid-specific helpers.
 */

import { ethers } from 'ethers';
import {
  TetsuoProver,
  GeneratedProof,
} from '@kamiyo/tetsuo';

// Re-export core prover functionality
export {
  TetsuoProver,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
} from '@kamiyo/tetsuo';

export type {
  ProverConfig,
  GeneratedProof,
  ProofInput,
  TierLevel,
  Groth16Proof,
  Commitment,
  VerificationResult,
} from '@kamiyo/tetsuo';

/**
 * Hyperliquid-specific proof wrapper
 *
 * Extends TetsuoProver with EVM contract formatting.
 */
export class ReputationProver extends TetsuoProver {
  /**
   * Format proof for Hyperliquid ReputationLimits contract
   */
  formatForContract(proof: GeneratedProof): {
    proofA: [bigint, bigint];
    proofB: [[bigint, bigint], [bigint, bigint]];
    proofC: [bigint, bigint];
    pubInputs: bigint[];
  } {
    return {
      proofA: proof.a,
      proofB: proof.b,
      proofC: proof.c,
      pubInputs: proof.publicInputs,
    };
  }

  /**
   * Generate commitment as hex string (for contract)
   */
  async generateCommitmentHex(score: number, secret?: bigint): Promise<{
    commitment: string;
    secret: bigint;
  }> {
    const result = await this.generateCommitment(score, secret);
    return {
      commitment: ethers.zeroPadValue(ethers.toBeHex(result.value), 32),
      secret: result.secret,
    };
  }
}
