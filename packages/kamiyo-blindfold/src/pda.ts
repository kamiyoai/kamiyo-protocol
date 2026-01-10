import { PublicKey } from '@solana/web3.js';
import { BLINDFOLD_PROGRAM_ID, NATIVE_SOL_MINT } from './types';

// Seeds: ["pool", token_mint]
export function derivePoolPDA(
  tokenMint: PublicKey | string,
  programId: PublicKey = BLINDFOLD_PROGRAM_ID
): [PublicKey, number] {
  const mint = resolveTokenMint(tokenMint);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), mint.toBuffer()],
    programId
  );
}

// Seeds: ["user_balance", wallet, token_mint]
export function deriveUserBalancePDA(
  wallet: PublicKey | string,
  tokenMint: PublicKey | string,
  programId: PublicKey = BLINDFOLD_PROGRAM_ID
): [PublicKey, number] {
  const walletPk = typeof wallet === 'string' ? new PublicKey(wallet) : wallet;
  const mint = resolveTokenMint(tokenMint);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_balance'), walletPk.toBuffer(), mint.toBuffer()],
    programId
  );
}

// Seeds: ["proof", nonce (u64 LE bytes)]
export function deriveProofPDA(
  nonce: number | bigint,
  programId: PublicKey = BLINDFOLD_PROGRAM_ID
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  const nonceBigInt = BigInt(nonce);
  for (let i = 0; i < 8; i++) {
    nonceBuffer[i] = Number((nonceBigInt >> BigInt(i * 8)) & BigInt(0xff));
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from('proof'), nonceBuffer],
    programId
  );
}

function resolveTokenMint(tokenMint: PublicKey | string): PublicKey {
  if (typeof tokenMint === 'string') {
    if (tokenMint === 'Native' || tokenMint === 'SOL') {
      return NATIVE_SOL_MINT;
    }
    return new PublicKey(tokenMint);
  }
  return tokenMint;
}

export function isValidAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}
