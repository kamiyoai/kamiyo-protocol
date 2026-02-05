import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { getConfig } from '../config';
import { calculateFee, USDC_DECIMALS } from './settlement';
import * as crypto from 'crypto';

const REFUND_TIERS = [
  { maxScore: 49, refundPercent: 100 },
  { maxScore: 64, refundPercent: 75 },
  { maxScore: 79, refundPercent: 35 },
  { maxScore: 100, refundPercent: 0 },
];

export function calculateRefundPercent(qualityScore: number): number {
  for (const tier of REFUND_TIERS) if (qualityScore <= tier.maxScore) return tier.refundPercent;
  return 0;
}

export function sessionIdToBytes(sessionId: string): Uint8Array {
  const hash = crypto.createHash('sha256').update(sessionId).digest();
  return new Uint8Array(hash);
}

export function deriveEscrowPda(programId: PublicKey, user: PublicKey, sessionIdBytes: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), user.toBuffer(), Buffer.from(sessionIdBytes)],
    programId
  );
  return pda;
}

const programCache = new Map<string, { idl: any; program: Program }>();

async function getProgram(connection: Connection, signer: Keypair, programId: PublicKey): Promise<Program> {
  const key = programId.toBase58();
  const cached = programCache.get(key);
  if (cached) return cached.program;

  const provider = new AnchorProvider(connection, new Wallet(signer), { commitment: 'confirmed' });
  const idl = await Program.fetchIdl(programId, provider);
  if (!idl) throw new Error('Failed to fetch escrow program IDL');
  const program = new Program(idl, provider);
  programCache.set(key, { idl, program });
  return program;
}

export async function createEscrow(
  connection: Connection,
  facilitatorKeypair: Keypair,
  payerWallet: PublicKey,
  amount: number,
  sessionId: string,
  timeLockSeconds: number = 86400
): Promise<{ escrowAddress: string; txHash: string; fee: number; expiresAt: number }> {
  const config = getConfig();
  const programId = new PublicKey(config.ESCROW_PROGRAM_ID);
  const fee = calculateFee(amount, config.ESCROW_FEE_BPS);

  const sessionIdBytes = sessionIdToBytes(sessionId);
  const escrowPda = deriveEscrowPda(programId, payerWallet, sessionIdBytes);
  const amountLamports = new BN(Math.round(amount * 10 ** USDC_DECIMALS));

  const program = await getProgram(connection, facilitatorKeypair, programId);
  const txHash = await (program.methods as any)
    .createEscrow(Array.from(sessionIdBytes), amountLamports)
    .accounts({ user: payerWallet, escrow: escrowPda })
    .signers([facilitatorKeypair])
    .rpc();

  const expiresAt = Date.now() + timeLockSeconds * 1000;
  return { escrowAddress: escrowPda.toBase58(), txHash, fee, expiresAt };
}

export async function releaseEscrow(
  connection: Connection,
  facilitatorKeypair: Keypair,
  escrowAddress: string,
  qualityScore: number
): Promise<{ txHash: string; refundPercent: number; merchantAmount: number; refundAmount: number }> {
  const config = getConfig();
  const programId = new PublicKey(config.ESCROW_PROGRAM_ID);
  const escrowPda = new PublicKey(escrowAddress);
  const refundPercent = calculateRefundPercent(qualityScore);

  const program = await getProgram(connection, facilitatorKeypair, programId);
  const rating = qualityScore >= 80 ? 5 : qualityScore >= 60 ? 3 : 1;

  const txHash = await (program.methods as any)
    .rateAndRelease(rating)
    .accounts({ escrow: escrowPda })
    .signers([facilitatorKeypair])
    .rpc();

  return { txHash, refundPercent, merchantAmount: 0, refundAmount: 0 };
}
