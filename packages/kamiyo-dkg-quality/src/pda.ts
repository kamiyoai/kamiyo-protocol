import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import type { UAL } from './types.js';

export const DEFAULT_PROGRAM_ID = new PublicKey('KAMiYo1111111111111111111111111111111111111');

export const ESCROW_SEED = 'quality_escrow';
export const STAKE_SEED = 'quality_stake';
export const ORACLE_SEED = 'oracle_registry';

export interface PDAConfig {
  programId: PublicKey;
  useFallback?: boolean; // Use hash-based fallback instead of real PDAs
}

export function deriveEscrowPDA(
  assetUal: UAL,
  publisher: PublicKey,
  config?: Partial<PDAConfig>
): { pda: PublicKey; bump?: number } {
  const programId = config?.programId || DEFAULT_PROGRAM_ID;
  const useFallback = config?.useFallback ?? true; // Default to fallback for now

  // Hash UAL to fixed-size seed (max seed length is 32 bytes)
  const ualHash = createHash('sha256').update(assetUal).digest().slice(0, 16);

  if (useFallback) {
    // Deterministic hash-based approach (for testing without deployed program)
    const seed = Buffer.concat([
      Buffer.from(ESCROW_SEED),
      publisher.toBuffer(),
      ualHash,
    ]);
    const hash = createHash('sha256').update(seed).digest();
    return { pda: new PublicKey(hash.slice(0, 32)) };
  }

  // Real PDA derivation
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(ESCROW_SEED), publisher.toBuffer(), ualHash],
    programId
  );

  return { pda, bump };
}

export function deriveStakePDA(
  escrowPda: PublicKey,
  config?: Partial<PDAConfig>
): { pda: PublicKey; bump?: number } {
  const programId = config?.programId || DEFAULT_PROGRAM_ID;
  const useFallback = config?.useFallback ?? true;

  if (useFallback) {
    const seed = Buffer.concat([Buffer.from(STAKE_SEED), escrowPda.toBuffer()]);
    const hash = createHash('sha256').update(seed).digest();
    return { pda: new PublicKey(hash.slice(0, 32)) };
  }

  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(STAKE_SEED), escrowPda.toBuffer()],
    programId
  );

  return { pda, bump };
}

export function deriveOraclePDA(
  oracleId: PublicKey,
  config?: Partial<PDAConfig>
): { pda: PublicKey; bump?: number } {
  const programId = config?.programId || DEFAULT_PROGRAM_ID;
  const useFallback = config?.useFallback ?? true;

  if (useFallback) {
    const seed = Buffer.concat([Buffer.from(ORACLE_SEED), oracleId.toBuffer()]);
    const hash = createHash('sha256').update(seed).digest();
    return { pda: new PublicKey(hash.slice(0, 32)) };
  }

  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(ORACLE_SEED), oracleId.toBuffer()],
    programId
  );

  return { pda, bump };
}

export function verifyPDA(
  pda: PublicKey,
  seeds: Buffer[],
  programId: PublicKey
): boolean {
  try {
    const [derived] = PublicKey.findProgramAddressSync(seeds, programId);
    return derived.equals(pda);
  } catch {
    return false;
  }
}

export function ualToSeed(ual: UAL): Buffer {
  return createHash('sha256').update(ual).digest().slice(0, 16);
}
