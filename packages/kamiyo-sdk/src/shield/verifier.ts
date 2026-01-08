import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { poseidon2Hash, fieldToBytes } from '../utils';
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
  constructor(private connection: Connection, private programId: PublicKey) {}

  async verifyReputation(proof: Uint8Array, agentPk: bigint, commitment: bigint, threshold: number): Promise<VerificationResult> {
    const buf = Buffer.alloc(1 + proof.length + 72);
    buf[0] = 0x01;
    buf.set(proof, 1);
    buf.set(fieldToBytes(agentPk), 1 + proof.length);
    buf.set(fieldToBytes(commitment), 1 + proof.length + 32);
    buf.writeBigUInt64LE(BigInt(threshold), 1 + proof.length + 64);
    return this.simulate(buf);
  }

  async verifyExclusion(proof: Uint8Array, root: bigint, key: bigint, siblings: bigint[]): Promise<VerificationResult> {
    const buf = Buffer.alloc(1 + proof.length + 68 + siblings.length * 32);
    let off = 0;
    buf[off++] = 0x02;
    buf.set(proof, off); off += proof.length;
    buf.set(fieldToBytes(root), off); off += 32;
    buf.set(fieldToBytes(key), off); off += 32;
    buf.writeUInt32LE(siblings.length, off); off += 4;
    for (const s of siblings) { buf.set(fieldToBytes(s), off); off += 32; }
    return this.simulate(buf);
  }

  async submitProof(payer: Keypair, data: ProofData): Promise<{ signature: string; slot: number }> {
    const tx = new Transaction().add(this.buildIx(data));
    const signature = await sendAndConfirmTransaction(this.connection, tx, [payer], { commitment: 'confirmed' });
    return { signature, slot: await this.connection.getSlot() };
  }

  async batchVerify(proofs: ProofData[]): Promise<VerificationResult[]> {
    return Promise.all(proofs.map(p => this.verifySingle(p)));
  }

  private async verifySingle(data: ProofData): Promise<VerificationResult> {
    try {
      const tx = new Transaction().add(this.buildIx(data));
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
      const tx = new Transaction().add(new TransactionInstruction({ keys: [], programId: this.programId, data }));
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.programId;
      const sim = await this.connection.simulateTransaction(tx);
      return { valid: sim.value.err === null, onChain: false };
    } catch (err) {
      return { valid: false, onChain: false, error: err instanceof Error ? err.message : 'unknown' };
    }
  }

  private buildIx(data: ProofData): TransactionInstruction {
    const c = data.credential;
    const cred = Buffer.alloc(104);
    cred.set(fieldToBytes(c.agentPk), 0);
    cred.set(fieldToBytes(c.repCommitment), 32);
    cred.set(fieldToBytes(c.blacklistRoot), 64);
    cred.writeUInt32LE(c.issuedAt, 96);
    cred.writeUInt32LE(c.expiresAt, 100);

    const thresh = Buffer.alloc(8);
    thresh.writeBigUInt64LE(BigInt(data.threshold));

    const repLen = Buffer.alloc(4);
    const exLen = Buffer.alloc(4);
    if (data.reputationProof) repLen.writeUInt32LE(data.reputationProof.length);
    if (data.exclusionProof) exLen.writeUInt32LE(data.exclusionProof.length);

    return new TransactionInstruction({
      keys: [],
      programId: this.programId,
      data: Buffer.concat([
        Buffer.from([0x03]), cred, thresh,
        repLen, ...(data.reputationProof ? [Buffer.from(data.reputationProof)] : []),
        exLen, ...(data.exclusionProof ? [Buffer.from(data.exclusionProof)] : []),
        Buffer.from(c.signature), Buffer.from(c.issuer.toBytes()),
      ]),
    });
  }
}

export function localVerifyMerkle(proof: MerkleProof, expectExists: boolean): boolean {
  const val = expectExists ? poseidon2Hash([proof.key]) : 0n;
  let cur = val;
  for (let i = 0; i < 256; i++) {
    const bit = ((proof.key >> BigInt(255 - (255 - i))) & 1n) === 1n;
    const sib = proof.siblings[i];
    cur = bit ? poseidon2Hash([sib, cur]) : poseidon2Hash([cur, sib]);
  }
  return cur === proof.root;
}
