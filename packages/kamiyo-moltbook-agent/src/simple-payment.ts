import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

export interface PaymentResult {
  success: boolean;
  signature?: string;
  error?: string;
}

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function sendSolPayment(params: {
  connection: Connection;
  wallet: Keypair;
  recipientAddress: string;
  amountSol: number;
  memo?: string;
}): Promise<PaymentResult> {
  const { connection, wallet, recipientAddress, amountSol } = params;

  if (!recipientAddress || !BASE58_REGEX.test(recipientAddress)) {
    return { success: false, error: 'Invalid recipient address' };
  }
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    return { success: false, error: 'Invalid amount' };
  }
  if (amountSol > 10) {
    return { success: false, error: 'Amount exceeds safety limit (10 SOL)' };
  }

  try {
    const recipient = new PublicKey(recipientAddress);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    const balance = await connection.getBalance(wallet.publicKey);
    const requiredLamports = lamports + 10_000;
    if (balance < requiredLamports) {
      return {
        success: false,
        error: `Insufficient balance: have ${balance / LAMPORTS_PER_SOL} SOL, need ${requiredLamports / LAMPORTS_PER_SOL} SOL`,
      };
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    console.log(`[Payment] Sent ${amountSol} SOL to ${recipientAddress}: ${signature}`);
    return { success: true, signature };
  } catch (err) {
    console.error('[Payment] Transfer failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Transfer failed',
    };
  }
}
