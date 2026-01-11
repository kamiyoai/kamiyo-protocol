import { ethers } from 'ethers';
import { TetsuoProver, GeneratedProof } from '@kamiyo/tetsuo';

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

export class ReputationProver extends TetsuoProver {
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
