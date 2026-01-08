import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { poseidon2Hash, generateBlinding, fieldToHex, fieldToBytes } from './utils';

export interface ReputationInput {
  successfulAgreements: number;
  totalAgreements: number;
  disputesWon: number;
  disputesLost: number;
  blinding: bigint;
  agentPk: bigint;
  threshold: number;
}

export interface ReputationProof {
  proof: Uint8Array;
  publicInputs: {
    agentPk: bigint;
    commitment: bigint;
    threshold: number;
  };
}

export class ReputationProver {
  private readonly circuitPath: string;
  private readonly artifactsPath: string;

  constructor(circuitPath?: string) {
    this.circuitPath = circuitPath || path.join(__dirname, '../../circuits/reputation-proof');
    this.artifactsPath = path.join(this.circuitPath, 'target');
  }

  computeCommitment(input: ReputationInput): bigint {
    return poseidon2Hash([
      input.agentPk,
      BigInt(input.successfulAgreements),
      BigInt(input.totalAgreements),
      BigInt(input.disputesWon),
      BigInt(input.disputesLost),
      input.blinding,
    ]);
  }

  generateBlinding(): bigint {
    return generateBlinding();
  }

  getSuccessRate(input: ReputationInput): number {
    if (input.totalAgreements === 0) return 0;
    return Math.floor((input.successfulAgreements * 100) / input.totalAgreements);
  }

  async generateProof(input: ReputationInput): Promise<ReputationProof> {
    this.validate(input);

    const commitment = this.computeCommitment(input);
    const proverPath = path.join(this.circuitPath, 'Prover.toml');

    fs.writeFileSync(proverPath, this.buildProverToml(input, commitment));

    try {
      execSync('nargo compile', { cwd: this.circuitPath, stdio: 'pipe' });
      execSync('nargo execute', { cwd: this.circuitPath, stdio: 'pipe' });
      execSync('sunspot prove', { cwd: this.circuitPath, stdio: 'pipe' });

      const proofBytes = fs.readFileSync(path.join(this.artifactsPath, 'proof'));

      return {
        proof: new Uint8Array(proofBytes),
        publicInputs: { agentPk: input.agentPk, commitment, threshold: input.threshold },
      };
    } finally {
      fs.rmSync(proverPath, { force: true });
    }
  }

  async verifyLocal(): Promise<boolean> {
    try {
      execSync('sunspot verify', { cwd: this.circuitPath, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  formatForSolana(proof: ReputationProof): Uint8Array {
    const buf = Buffer.alloc(72);
    buf.set(fieldToBytes(proof.publicInputs.agentPk), 0);
    buf.set(fieldToBytes(proof.publicInputs.commitment), 32);
    buf.writeBigUInt64BE(BigInt(proof.publicInputs.threshold), 64);
    return new Uint8Array([...proof.proof, ...buf]);
  }

  private validate(input: ReputationInput): void {
    if (input.totalAgreements === 0) throw new Error('no agreements');
    if (input.successfulAgreements > input.totalAgreements) throw new Error('invalid success count');
    if (input.threshold > 100) throw new Error('threshold exceeds 100');
    if (this.getSuccessRate(input) < input.threshold) throw new Error('below threshold');
  }

  private buildProverToml(input: ReputationInput, commitment: bigint): string {
    return [
      `successful_agreements = ${input.successfulAgreements}`,
      `total_agreements = ${input.totalAgreements}`,
      `disputes_won = ${input.disputesWon}`,
      `disputes_lost = ${input.disputesLost}`,
      `blinding = "${fieldToHex(input.blinding)}"`,
      `agent_pk = "${fieldToHex(input.agentPk)}"`,
      `reputation_commitment = "${fieldToHex(commitment)}"`,
      `threshold = ${input.threshold}`,
    ].join('\n');
  }
}
