import { PublicKey } from '@solana/web3.js';
import { createHash, randomBytes } from 'crypto';

export const KAMIYO_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

const SETTLEMENT_SEED = Buffer.from('settlement');
export const RESPONSE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export function deriveSettlementPDA(
  agent: PublicKey,
  paymentRef: string,
  programId: PublicKey = KAMIYO_PROGRAM_ID
): [PublicKey, number] {
  const paymentRefHash = createHash('sha256')
    .update(paymentRef)
    .digest()
    .slice(0, 32);

  return PublicKey.findProgramAddressSync(
    [SETTLEMENT_SEED, agent.toBuffer(), paymentRefHash],
    programId
  );
}

export function generateSettlementId(agent: PublicKey, paymentRef: string): string {
  const hash = createHash('sha256');
  hash.update(agent.toBuffer());
  hash.update(paymentRef);
  hash.update(randomBytes(16));
  return hash.digest('hex');
}

export function isValidPublicKey(value: unknown): value is PublicKey {
  if (value instanceof PublicKey) return true;
  if (typeof value === 'string') {
    try {
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function toPublicKey(value: string | PublicKey): PublicKey {
  if (value instanceof PublicKey) return value;
  return new PublicKey(value);
}

export function isExpired(deadline: number): boolean {
  return Date.now() > deadline;
}
