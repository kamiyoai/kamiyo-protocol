import { PublicKey, Connection } from '@solana/web3.js';
import { PrivateReputation, ReputationStats, verifyOnChain } from '../privacy/reputation';
import { poseidon2Hash, generateBlinding, fieldToBytes } from '../utils';

export interface ProveThresholdRequest {
  agentPubkey: PublicKey;
  stats: ReputationStats;
  threshold: number;
}

export interface ProveThresholdResponse {
  meets: boolean;
  commitment: string;
  publicInputs: {
    agentPk: string;
    commitment: string;
    threshold: number;
  };
  proverInput: {
    successfulAgreements: number;
    totalAgreements: number;
    disputesWon: number;
    disputesLost: number;
    blinding: string;
    agentPk: string;
    threshold: number;
  } | null;
}

export interface VerifyProofRequest {
  connection: Connection;
  verifierProgram: PublicKey;
  proof: Uint8Array;
  agentPk: string;
  commitment: string;
  threshold: number;
}

export class ReputationAPI {
  private cache = new Map<string, PrivateReputation>();

  proveThreshold(req: ProveThresholdRequest): ProveThresholdResponse {
    const key = req.agentPubkey.toBase58();
    let rep = this.cache.get(key);
    if (!rep) {
      rep = new PrivateReputation(req.agentPubkey);
      this.cache.set(key, rep);
    }
    rep.setStats(req.stats);

    const result = rep.prepareProof(req.threshold);
    const prover = rep.getProverInput(req.threshold);

    return {
      meets: result.meets,
      commitment: result.commitment.toString(16),
      publicInputs: {
        agentPk: result.publicInputs.agentPk.toString(16),
        commitment: result.publicInputs.commitment.toString(16),
        threshold: result.publicInputs.threshold,
      },
      proverInput: prover ? {
        ...prover,
        blinding: prover.blinding.toString(16),
        agentPk: prover.agentPk.toString(16),
      } : null,
    };
  }

  async verify(req: VerifyProofRequest): Promise<boolean> {
    return verifyOnChain(req.connection, req.verifierProgram, req.proof, {
      agentPk: BigInt('0x' + req.agentPk),
      commitment: BigInt('0x' + req.commitment),
      threshold: req.threshold,
    });
  }

  computeCommitment(agentPubkey: PublicKey, stats: ReputationStats): string {
    const agentPk = BigInt('0x' + Buffer.from(agentPubkey.toBytes()).toString('hex'));
    const blinding = generateBlinding();
    const commitment = poseidon2Hash([
      agentPk,
      BigInt(stats.successfulAgreements),
      BigInt(stats.totalAgreements),
      BigInt(stats.disputesWon),
      BigInt(stats.disputesLost),
      blinding,
    ]);
    return commitment.toString(16);
  }

  getSuccessRate(stats: ReputationStats): number {
    if (stats.totalAgreements === 0) return 0;
    return Math.floor((stats.successfulAgreements * 100) / stats.totalAgreements);
  }

  meetsThreshold(stats: ReputationStats, threshold: number): boolean {
    return this.getSuccessRate(stats) >= threshold;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const reputationAPI = new ReputationAPI();
