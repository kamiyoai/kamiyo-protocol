import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const API = 'https://quote-api.jup.ag/v6';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface JupiterConfig {
  connection: Connection;
  wallet: Keypair;
  slippageBps?: number;
  priorityFee?: number;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceImpactPct: string;
}

export interface SwapResult {
  success: boolean;
  signature?: string;
  inputAmount: number;
  outputAmount: number;
  error?: string;
}

export class JupiterSwap {
  private readonly connection: Connection;
  private readonly wallet: Keypair;
  private readonly slippageBps: number;
  private readonly priorityFee: number;

  constructor(config: JupiterConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.slippageBps = config.slippageBps ?? 50;
    this.priorityFee = config.priorityFee ?? 0;
  }

  async quote(inputMint: string, outputMint: string, amount: number): Promise<SwapQuote | null> {
    const url = `${API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${this.slippageBps}`;
    try {
      const res = await fetch(url);
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  }

  async swap(inputMint: string, outputMint: string, amount: number): Promise<SwapResult> {
    const q = await this.quote(inputMint, outputMint, amount);
    if (!q) return { success: false, inputAmount: amount, outputAmount: 0, error: 'quote failed' };

    try {
      const res = await fetch(`${API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: q,
          userPublicKey: this.wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: this.priorityFee,
        }),
      });

      if (!res.ok) return { success: false, inputAmount: amount, outputAmount: 0, error: 'swap request failed' };

      const { swapTransaction } = await res.json();
      const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
      tx.sign([this.wallet]);

      const sig = await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      await this.connection.confirmTransaction(sig, 'confirmed');

      return { success: true, signature: sig, inputAmount: parseInt(q.inputAmount), outputAmount: parseInt(q.outputAmount) };
    } catch (err) {
      return { success: false, inputAmount: amount, outputAmount: 0, error: err instanceof Error ? err.message : 'swap failed' };
    }
  }

  toSol(inputMint: string, amount: number): Promise<SwapResult> {
    return this.swap(inputMint, SOL_MINT, amount);
  }

  toUsdc(inputMint: string, amount: number): Promise<SwapResult> {
    return this.swap(inputMint, USDC_MINT, amount);
  }
}

export async function payWithAnyToken(
  config: JupiterConfig,
  inputMint: string,
  inputAmount: number,
  recipient: PublicKey
): Promise<SwapResult & { paymentSig?: string }> {
  const jup = new JupiterSwap(config);
  const swap = await jup.toSol(inputMint, inputAmount);
  if (!swap.success) return swap;

  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: config.wallet.publicKey, toPubkey: recipient, lamports: swap.outputAmount })
    );
    const paymentSig = await sendAndConfirmTransaction(config.connection, tx, [config.wallet], { commitment: 'confirmed' });
    return { ...swap, paymentSig };
  } catch (err) {
    return { success: false, inputAmount, outputAmount: swap.outputAmount, signature: swap.signature, error: err instanceof Error ? err.message : 'transfer failed' };
  }
}
