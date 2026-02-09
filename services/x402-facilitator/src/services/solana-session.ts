import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { USDC_DECIMALS, USDC_MINT } from './settlement';

export type UsdcDelegateState = {
  ata: PublicKey;
  balanceMicro: bigint;
  delegate: PublicKey | null;
  delegatedMicro: bigint;
};

export async function getUsdcDelegateState(
  connection: Connection,
  owner: PublicKey
): Promise<UsdcDelegateState> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner);
  const account = await getAccount(connection, ata);
  return {
    ata,
    balanceMicro: account.amount,
    delegate: account.delegate ?? null,
    delegatedMicro: account.delegatedAmount,
  };
}

async function ensureAta(
  connection: Connection,
  tx: Transaction,
  feePayer: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner);
  try {
    await getAccount(connection, ata);
    return ata;
  } catch {
    tx.add(createAssociatedTokenAccountInstruction(feePayer, ata, owner, USDC_MINT));
    return ata;
  }
}

export async function settleDelegatedUsdcTransfer(params: {
  connection: Connection;
  delegateKeypair: Keypair;
  payer: PublicKey;
  merchant: PublicKey;
  treasury: PublicKey | null;
  totalMicro: bigint;
  feeBps: number;
}): Promise<{ txHash: string; feeMicro: bigint; netMicro: bigint }> {
  const feeMicro = (params.totalMicro * BigInt(params.feeBps)) / 10_000n;
  const netMicro = params.totalMicro - feeMicro;
  if (netMicro <= 0n) {
    throw new Error('Net amount after fees is zero or negative');
  }

  const payerState = await getUsdcDelegateState(params.connection, params.payer);
  if (!payerState.delegate || !payerState.delegate.equals(params.delegateKeypair.publicKey)) {
    throw new Error('Payer has not delegated USDC to facilitator');
  }
  if (payerState.delegatedMicro < params.totalMicro) {
    throw new Error('Delegated allowance insufficient');
  }
  if (payerState.balanceMicro < params.totalMicro) {
    throw new Error('Payer USDC balance insufficient');
  }

  const tx = new Transaction();
  tx.feePayer = params.delegateKeypair.publicKey;

  const merchantAta = await ensureAta(params.connection, tx, tx.feePayer, params.merchant);
  const treasuryAta =
    params.treasury && feeMicro > 0n
      ? await ensureAta(params.connection, tx, tx.feePayer, params.treasury)
      : null;

  tx.add(
    createTransferCheckedInstruction(
      payerState.ata,
      USDC_MINT,
      merchantAta,
      params.delegateKeypair.publicKey,
      netMicro,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  if (treasuryAta && feeMicro > 0n) {
    tx.add(
      createTransferCheckedInstruction(
        payerState.ata,
        USDC_MINT,
        treasuryAta,
        params.delegateKeypair.publicKey,
        feeMicro,
        USDC_DECIMALS,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  const txHash = await sendAndConfirmTransaction(params.connection, tx, [params.delegateKeypair], {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  return { txHash, feeMicro, netMicro };
}

