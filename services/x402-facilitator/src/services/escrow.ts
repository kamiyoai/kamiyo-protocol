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
  operatorKeypair: Keypair,
  payerWallet: PublicKey,
  amount: number,
  sessionId: string,
  timeLockSeconds: number = 86400
): Promise<{ escrowAddress: string; txHash: string; fee: number; expiresAt: number }> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount');
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('Invalid sessionId');
  const lock = Math.max(60, Math.min(30 * 24 * 3600, Math.floor(timeLockSeconds)));

  const config = getConfig();
  const programId = new PublicKey(config.ESCROW_PROGRAM_ID);
  const fee = calculateFee(amount, config.ESCROW_FEE_BPS);

  const sessionIdBytes = sessionIdToBytes(sessionId);
  const escrowPda = deriveEscrowPda(programId, payerWallet, sessionIdBytes);
  const amountUnits = Math.round(amount * 10 ** USDC_DECIMALS);
  if (!Number.isFinite(amountUnits) || amountUnits <= 0) throw new Error('Invalid scaled amount');
  const amountBn = new BN(amountUnits.toString());

  const program = await getProgram(connection, operatorKeypair, programId);
  const txHash = await (program.methods as any)
    .createEscrow(Array.from(sessionIdBytes), amountBn)
    .accounts({ user: payerWallet, escrow: escrowPda })
    .signers([operatorKeypair])
    .rpc();

  const expiresAt = Date.now() + lock * 1000;
  return { escrowAddress: escrowPda.toBase58(), txHash, fee, expiresAt };
}

export async function releaseEscrow(
  connection: Connection,
  operatorKeypair: Keypair,
  escrowAddress: string,
  qualityScore: number
): Promise<{ txHash: string; refundPercent: number; merchantAmount: number; refundAmount: number }> {
  const config = getConfig();
  const programId = new PublicKey(config.ESCROW_PROGRAM_ID);
  const escrowPda = new PublicKey(escrowAddress);
  const refundPercent = calculateRefundPercent(qualityScore);

  const program = await getProgram(connection, operatorKeypair, programId);
  const rating = qualityScore >= 80 ? 5 : qualityScore >= 60 ? 3 : 1;

  const txHash = await (program.methods as any)
    .rateAndRelease(rating)
    .accounts({ escrow: escrowPda })
    .signers([operatorKeypair])
    .rpc();

  return { txHash, refundPercent, merchantAmount: 0, refundAmount: 0 };
}
