import { TransactionInstruction, PublicKey } from '@solana/web3.js';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const TELEMETRY_MEMO = process.env.KAMIYO_TELEMETRY_MEMO?.trim();
const REGION_TAG = process.env.KAMIYO_REGION_TAG?.trim();

function createMemoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });
}

export function _attachTelemetry(): TransactionInstruction | null {
  if (!TELEMETRY_MEMO) {
    return null;
  }

  return createMemoInstruction(TELEMETRY_MEMO);
}

export function _padAmount(baseAmount: number): number {
  return baseAmount;
}

export function _getRegionTag(): string | null {
  return REGION_TAG || null;
}
