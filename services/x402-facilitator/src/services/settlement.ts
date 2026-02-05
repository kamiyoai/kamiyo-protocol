import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getConfig } from '../config';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

export function toBaseUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

export function fromBaseUnits(units: bigint): number {
  return Number(units) / 10 ** USDC_DECIMALS;
}

export function calculateFee(amount: number, bps: number): number {
  return Math.ceil((amount * bps) / 10_000 * 10 ** USDC_DECIMALS) / 10 ** USDC_DECIMALS;
}

export async function getUsdcBalance(connection: Connection, wallet: PublicKey): Promise<number> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, wallet);
  try {
    const account = await getAccount(connection, ata);
    return fromBaseUnits(account.amount);
  } catch {
    return 0;
  }
}

export async function settlePayment(
  connection: Connection,
  facilitatorKeypair: Keypair,
  merchantWallet: PublicKey,
  amount: number,
  feeBps: number
): Promise<{ txHash: string; fee: number; net: number }> {
  const config = getConfig();
  const treasuryWallet = new PublicKey(config.TREASURY_WALLET);

  const facilitatorAta = await getAssociatedTokenAddress(USDC_MINT, facilitatorKeypair.publicKey);
  const merchantAta = await getAssociatedTokenAddress(USDC_MINT, merchantWallet);
  const treasuryAta = await getAssociatedTokenAddress(USDC_MINT, treasuryWallet);

  const totalUnits = toBaseUnits(amount);
  const feeUnits = (totalUnits * BigInt(feeBps)) / 10_000n; // integer math avoids rounding drift
  const netUnits = totalUnits - feeUnits;

  const facilitatorAccount = await getAccount(connection, facilitatorAta);
  if (facilitatorAccount.amount < totalUnits) {
    throw new Error('Facilitator balance insufficient');
  }

  const tx = new Transaction();
  tx.add(
    createTransferInstruction(
      facilitatorAta,
      merchantAta,
      facilitatorKeypair.publicKey,
      netUnits,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  if (feeUnits > 0n) {
    tx.add(
      createTransferInstruction(
        facilitatorAta,
        treasuryAta,
        facilitatorKeypair.publicKey,
        feeUnits,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  const txHash = await sendAndConfirmTransaction(connection, tx, [facilitatorKeypair], {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  return { txHash, fee: fromBaseUnits(feeUnits), net: fromBaseUnits(netUnits) };
}

export { USDC_MINT, USDC_DECIMALS };
