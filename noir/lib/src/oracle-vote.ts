import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { poseidon2Hash, generateBlinding, fieldToHex } from './utils';

export interface OracleVoteInput {
  score: number;
  blinding: bigint;
  escrowId: bigint;
  oraclePk: bigint;
}

export interface OracleVoteProof {
  proof: Uint8Array;
  publicInputs: {
    escrowId: bigint;
    oraclePk: bigint;
    commitment: bigint;
  };
}

export class OracleVoteProver {
  private circuitPath: string;
  private artifactsPath: string;

  constructor(circuitPath?: string) {
    this.circuitPath = circuitPath || path.join(__dirname, '../../circuits/oracle-vote');
    this.artifactsPath = path.join(this.circuitPath, 'target');
  }

  computeCommitment(input: OracleVoteInput): bigint {
    return poseidon2Hash([
      BigInt(input.score),
      input.blinding,
      input.escrowId,
      input.oraclePk
    ]);
  }

  generateBlinding(): bigint {
    return generateBlinding();
  }

  async generateProof(input: OracleVoteInput): Promise<OracleVoteProof> {
    if (input.score < 0 || input.score > 100) {
      throw new Error('Score must be in range [0, 100]');
    }

    const commitment = this.computeCommitment(input);

    const proverToml = `
score = ${input.score}
blinding = "${fieldToHex(input.blinding)}"
escrow_id = "${fieldToHex(input.escrowId)}"
oracle_pk = "${fieldToHex(input.oraclePk)}"
expected_commitment = "${fieldToHex(commitment)}"
`.trim();

    const proverPath = path.join(this.circuitPath, 'Prover.toml');
    fs.writeFileSync(proverPath, proverToml);

    try {
      execSync('nargo compile', { cwd: this.circuitPath, stdio: 'pipe' });
      execSync('nargo execute', { cwd: this.circuitPath, stdio: 'pipe' });
      execSync('sunspot prove', { cwd: this.circuitPath, stdio: 'pipe' });

      const proofPath = path.join(this.artifactsPath, 'proof');
      const proofBytes = fs.readFileSync(proofPath);

      return {
        proof: new Uint8Array(proofBytes),
        publicInputs: {
          escrowId: input.escrowId,
          oraclePk: input.oraclePk,
          commitment
        }
      };
    } finally {
      if (fs.existsSync(proverPath)) {
        fs.unlinkSync(proverPath);
      }
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

  getVerifierProgram(): Uint8Array {
    const verifierPath = path.join(this.artifactsPath, 'verifier.so');
    if (!fs.existsSync(verifierPath)) {
      throw new Error('Verifier not found. Run sunspot build first.');
    }
    return new Uint8Array(fs.readFileSync(verifierPath));
  }

  formatForSolana(proof: OracleVoteProof): Uint8Array {
    const publicInputs = Buffer.alloc(96);
    publicInputs.writeBigUInt64BE(proof.publicInputs.escrowId, 0);
    publicInputs.writeBigUInt64BE(proof.publicInputs.oraclePk, 32);
    publicInputs.writeBigUInt64BE(proof.publicInputs.commitment, 64);
    return new Uint8Array([...proof.proof, ...publicInputs]);
  }
}
