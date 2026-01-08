import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { poseidon2Hash, fieldToBytes, bytesToField } from '../utils';
import { MerkleProof } from './blacklist';
import { SignedCredential } from './credential';

export interface VerificationResult {
  valid: boolean;
  onChain: boolean;
  signature?: string;
  error?: string;
}

export interface ProofData {
  reputationProof?: Uint8Array;
  exclusionProof?: Uint8Array;
  credential: SignedCredential;
  threshold: number;
}

export class ShieldVerifier {
  private readonly connection: Connection;
  private readonly programId: PublicKey;

  constructor(connection: Connection, programId: PublicKey) {
    this.connection = connection;
    this.programId = programId;
  }

  async verifyReputation(
    proof: Uint8Array,
    agentPk: bigint,
    commitment: bigint,
    threshold: number
  ): Promise<VerificationResult> {
    const data = this.buildReputationVerifyData(proof, agentPk, commitment, threshold);
    return this.simulate(data);
  }

  async verifyExclusion(
    proof: Uint8Array,
    root: bigint,
    key: bigint,
    siblings: bigint[]
  ): Promise<VerificationResult> {
    const data = this.buildExclusionVerifyData(proof, root, key, siblings);
    return this.simulate(data);
  }

  async submitProof(
    payer: Keypair,
    proofData: ProofData
  ): Promise<{ signature: string; slot: number }> {
    const ix = this.buildVerifyInstruction(proofData);
    const tx = new Transaction().add(ix);

    const signature = await sendAndConfirmTransaction(this.connection, tx, [payer], {
      commitment: 'confirmed',
    });

    const slot = await this.connection.getSlot();
    return { signature, slot };
  }

  async batchVerify(proofs: ProofData[]): Promise<VerificationResult[]> {
    return Promise.all(proofs.map(p => this.verifySingle(p)));
  }

  private async verifySingle(proofData: ProofData): Promise<VerificationResult> {
    try {
      const ix = this.buildVerifyInstruction(proofData);
      const tx = new Transaction().add(ix);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.programId;

      const sim = await this.connection.simulateTransaction(tx);
      return { valid: sim.value.err === null, onChain: false };
    } catch (err) {
      return { valid: false, onChain: false, error: err instanceof Error ? err.message : 'unknown' };
    }
  }

  private async simulate(data: Buffer): Promise<VerificationResult> {
    try {
      const ix = new TransactionInstruction({ keys: [], programId: this.programId, data });
      const tx = new Transaction().add(ix);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.programId;

      const sim = await this.connection.simulateTransaction(tx);
      return { valid: sim.value.err === null, onChain: false };
    } catch (err) {
      return { valid: false, onChain: false, error: err instanceof Error ? err.message : 'unknown' };
    }
  }

  private buildReputationVerifyData(proof: Uint8Array, agentPk: bigint, commitment: bigint, threshold: number): Buffer {
    const buf = Buffer.alloc(1 + proof.length + 32 + 32 + 8);
    buf[0] = 0x01; // reputation verify instruction
    buf.set(proof, 1);
    buf.set(fieldToBytes(agentPk), 1 + proof.length);
    buf.set(fieldToBytes(commitment), 1 + proof.length + 32);
    buf.writeBigUInt64LE(BigInt(threshold), 1 + proof.length + 64);
    return buf;
  }

  private buildExclusionVerifyData(proof: Uint8Array, root: bigint, key: bigint, siblings: bigint[]): Buffer {
    const siblingBytes = siblings.length * 32;
    const buf = Buffer.alloc(1 + proof.length + 32 + 32 + 4 + siblingBytes);
    let offset = 0;

    buf[offset++] = 0x02; // exclusion verify instruction
    buf.set(proof, offset);
    offset += proof.length;
    buf.set(fieldToBytes(root), offset);
    offset += 32;
    buf.set(fieldToBytes(key), offset);
    offset += 32;
    buf.writeUInt32LE(siblings.length, offset);
    offset += 4;

    for (const s of siblings) {
      buf.set(fieldToBytes(s), offset);
      offset += 32;
    }

    return buf;
  }

  private buildVerifyInstruction(proofData: ProofData): TransactionInstruction {
    const parts: Buffer[] = [Buffer.from([0x03])]; // combined verify instruction

    // Credential data
    const credBuf = Buffer.alloc(104);
    credBuf.set(fieldToBytes(proofData.credential.agentPk), 0);
    credBuf.set(fieldToBytes(proofData.credential.repCommitment), 32);
    credBuf.set(fieldToBytes(proofData.credential.blacklistRoot), 64);
    credBuf.writeUInt32LE(proofData.credential.issuedAt, 96);
    credBuf.writeUInt32LE(proofData.credential.expiresAt, 100);
    parts.push(credBuf);

    // Threshold
    const threshBuf = Buffer.alloc(8);
    threshBuf.writeBigUInt64LE(BigInt(proofData.threshold));
    parts.push(threshBuf);

    // Proofs
    if (proofData.reputationProof) {
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(proofData.reputationProof.length);
      parts.push(lenBuf, Buffer.from(proofData.reputationProof));
    } else {
      parts.push(Buffer.alloc(4)); // zero length
    }

    if (proofData.exclusionProof) {
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(proofData.exclusionProof.length);
      parts.push(lenBuf, Buffer.from(proofData.exclusionProof));
    } else {
      parts.push(Buffer.alloc(4));
    }

    // Signature
    parts.push(Buffer.from(proofData.credential.signature));
    parts.push(Buffer.from(proofData.credential.issuer.toBytes()));

    return new TransactionInstruction({
      keys: [],
      programId: this.programId,
      data: Buffer.concat(parts),
    });
  }
}

export function localVerifyMerkle(proof: MerkleProof, expectExists: boolean): boolean {
  const SMT_DEPTH = 256;
  const value = expectExists ? poseidon2Hash([proof.key]) : 0n;
  let current = value;

  for (let i = 0; i < SMT_DEPTH; i++) {
    const bit = ((proof.key >> BigInt(255 - (SMT_DEPTH - 1 - i))) & 1n) === 1n;
    const sibling = proof.siblings[i];
    current = bit ? poseidon2Hash([sibling, current]) : poseidon2Hash([current, sibling]);
  }

  return current === proof.root;
}
