import { ethers } from 'ethers';
import { DarkForestProver, GeneratedProof } from '@kamiyo/kamiyo-mitama';

export {
  DarkForestProver,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
} from '@kamiyo/kamiyo-mitama';

export type {
  ProverConfig,
  GeneratedProof,
  ProofInput,
  TierLevel,
  EVMGroth16Proof as Groth16Proof,
  Commitment,
  VerificationResult,
} from '@kamiyo/kamiyo-mitama';

export class ReputationProver extends DarkForestProver {
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
