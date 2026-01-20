import { Connection, PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Groth16Proof } from './types';

// Production program (mainnet/devnet)
export const KAMIYO_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

// Alias for backwards compatibility
export const KAMIYO_PROGRAM_ID_TEST = KAMIYO_PROGRAM_ID;

/**
 * Builds an instruction to verify a reputation tier proof on-chain.
 *
 * @param user - The user's public key (must sign the transaction)
 * @param proof - The Groth16 proof from generateProof()
 * @param threshold - The reputation threshold (0-100)
 * @param commitment - The Poseidon commitment (32 bytes)
 * @param programId - Optional program ID (defaults to test program on devnet)
 * @returns TransactionInstruction to call verify_reputation_tier
 */
export function buildVerifyReputationTierInstruction(
  user: PublicKey,
  proof: Groth16Proof,
  threshold: number,
  commitment: Uint8Array,
  programId: PublicKey = KAMIYO_PROGRAM_ID_TEST,
): TransactionInstruction {
  if (threshold < 0 || threshold > 100) {
    throw new Error('Threshold must be between 0 and 100');
  }
  if (commitment.length !== 32) {
    throw new Error('Commitment must be 32 bytes');
  }

  const proofA = serializeG1PointA(proof.pi_a);
  const proofB = serializeG2Point(proof.pi_b);
  const proofC = serializeG1Point(proof.pi_c);

  // Instruction discriminator for verify_reputation_tier
  // Generated from sha256("global:verify_reputation_tier")[0:8]
  const discriminator = Buffer.from([0xff, 0x11, 0x30, 0x30, 0xfe, 0x58, 0xd6, 0x97]);

  const data = Buffer.concat([
    discriminator,
    proofA,
    proofB,
    proofC,
    Buffer.from([threshold]),
    Buffer.from(commitment),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: user, isSigner: true, isWritable: false },
    ],
    programId,
    data,
  });
}

/**
 * Verifies a reputation tier proof on-chain.
 *
 * @param connection - Solana connection
 * @param wallet - Wallet to sign the transaction
 * @param proof - The Groth16 proof from generateProof()
 * @param threshold - The reputation threshold (0-100)
 * @param commitment - The Poseidon commitment (32 bytes)
 * @returns Transaction signature
 */
export async function verifyReputationTierOnChain(
  connection: Connection,
  wallet: Wallet,
  proof: Groth16Proof,
  threshold: number,
  commitment: Uint8Array,
): Promise<string> {
  const { Transaction, sendAndConfirmTransaction } = await import('@solana/web3.js');

  const instruction = buildVerifyReputationTierInstruction(
    wallet.publicKey,
    proof,
    threshold,
    commitment,
  );

  const transaction = new Transaction().add(instruction);
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Estimates the compute units for verifying a reputation tier proof.
 * Groth16 verification on Solana uses approximately 200,000 CU.
 */
export const VERIFY_REPUTATION_TIER_CU = 200_000;

// Helper functions for serialization

// BN254 field modulus for negation
const BN254_FIELD_MODULUS = BigInt('21888242871839275222246405745257275088696311157297823662689037894645226208583');

function serializeG1PointA(point: string[]): Buffer {
  // groth16-solana expects proof_a with negated y: [x, -y]
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);
  const negY = BN254_FIELD_MODULUS - y;
  const buffer = Buffer.alloc(64);
  writeBigInt(buffer, 0, x, 32);
  writeBigInt(buffer, 32, negY, 32);
  return buffer;
}

function serializeG1Point(point: string[]): Buffer {
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);
  const buffer = Buffer.alloc(64);
  writeBigInt(buffer, 0, x, 32);
  writeBigInt(buffer, 32, y, 32);
  return buffer;
}

function serializeG2Point(point: string[][]): Buffer {
  // groth16-solana expects G2 in order: [x_c1, x_c0, y_c1, y_c0]
  const x0 = BigInt(point[0][0]);
  const x1 = BigInt(point[0][1]);
  const y0 = BigInt(point[1][0]);
  const y1 = BigInt(point[1][1]);
  const buffer = Buffer.alloc(128);
  writeBigInt(buffer, 0, x1, 32);
  writeBigInt(buffer, 32, x0, 32);
  writeBigInt(buffer, 64, y1, 32);
  writeBigInt(buffer, 96, y0, 32);
  return buffer;
}

function writeBigInt(buffer: Buffer, offset: number, value: bigint, length: number): void {
  const hex = value.toString(16).padStart(length * 2, '0');
  for (let i = 0; i < length; i++) {
    buffer[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
}
