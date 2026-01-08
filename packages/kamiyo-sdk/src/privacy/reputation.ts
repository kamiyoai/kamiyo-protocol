import { PublicKey, Connection, TransactionInstruction } from '@solana/web3.js';
import { poseidon2Hash, generateBlinding, fieldToBytes, bytesToField } from '../utils';

export interface ReputationStats {
  successfulAgreements: number;
  totalAgreements: number;
  disputesWon: number;
  disputesLost: number;
}

export interface ReputationCommitment {
  agentPk: bigint;
  commitment: bigint;
  blinding: bigint;
}

export interface ThresholdProofResult {
  meets: boolean;
  commitment: bigint;
  publicInputs: {
    agentPk: bigint;
    commitment: bigint;
    threshold: number;
  };
}

export class PrivateReputation {
  private readonly agentPk: bigint;
  private readonly blinding: bigint;
  private stats: ReputationStats | null = null;
  private commitment: bigint | null = null;

  constructor(agentPubkey: PublicKey) {
    this.agentPk = bytesToField(agentPubkey.toBytes());
    this.blinding = generateBlinding();
  }

  setStats(stats: ReputationStats): void {
    this.stats = stats;
    this.commitment = this.hash(stats);
  }

  getSuccessRate(): number {
    if (!this.stats || this.stats.totalAgreements === 0) return 0;
    return Math.floor((this.stats.successfulAgreements * 100) / this.stats.totalAgreements);
  }

  meetsThreshold(threshold: number): boolean {
    return this.getSuccessRate() >= threshold;
  }

  getCommitment(): ReputationCommitment | null {
    if (!this.commitment) return null;
    return { agentPk: this.agentPk, commitment: this.commitment, blinding: this.blinding };
  }

  prepareProof(threshold: number): ThresholdProofResult {
    if (!this.stats) throw new Error('stats not set');
    if (!this.commitment) this.commitment = this.hash(this.stats);

    return {
      meets: this.getSuccessRate() >= threshold,
      commitment: this.commitment,
      publicInputs: { agentPk: this.agentPk, commitment: this.commitment, threshold },
    };
  }

  getProverInput(threshold: number) {
    if (!this.stats) return null;
    return { ...this.stats, blinding: this.blinding, agentPk: this.agentPk, threshold };
  }

  private hash(stats: ReputationStats): bigint {
    return poseidon2Hash([
      this.agentPk,
      BigInt(stats.successfulAgreements),
      BigInt(stats.totalAgreements),
      BigInt(stats.disputesWon),
      BigInt(stats.disputesLost),
      this.blinding,
    ]);
  }

  static fromOnChain(
    agentPubkey: PublicKey,
    data: { totalTransactions: number; successfulEscrows: number; disputesWon: number; disputesLost: number }
  ): PrivateReputation {
    const rep = new PrivateReputation(agentPubkey);
    rep.setStats({
      successfulAgreements: data.successfulEscrows,
      totalAgreements: data.totalTransactions,
      disputesWon: data.disputesWon,
      disputesLost: data.disputesLost,
    });
    return rep;
  }
}

export async function verifyOnChain(
  connection: Connection,
  verifierProgram: PublicKey,
  proof: Uint8Array,
  inputs: { agentPk: bigint; commitment: bigint; threshold: number }
): Promise<boolean> {
  const data = Buffer.concat([
    Buffer.from([0x02]),
    proof,
    fieldToBytes(inputs.agentPk),
    fieldToBytes(inputs.commitment),
    (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(inputs.threshold)); return b; })(),
  ]);

  const ix = new TransactionInstruction({ keys: [], programId: verifierProgram, data });
  const { blockhash } = await connection.getLatestBlockhash();
  const sim = await connection.simulateTransaction({ instructions: [ix], recentBlockhash: blockhash }, { sigVerify: false });

  return sim.value.err === null;
}
