import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { X402KamiyoClient, PaymentResult } from './client';

export interface PaymentWidgetConfig {
  connection: Connection;
  wallet: Keypair;
  programId: PublicKey;
  provider: PublicKey;
  amount: number;
  description?: string;
  useEscrow?: boolean;
  onComplete?: (result: PaymentResult) => void;
  onError?: (error: Error) => void;
}

export interface PaymentState {
  status: 'idle' | 'processing' | 'completed' | 'error';
  txId?: string;
  signature?: string;
  escrowPda?: string;
  error?: string;
}

type StateListener = (state: PaymentState) => void;

export class PaymentWidget {
  private readonly config: PaymentWidgetConfig;
  private readonly client: X402KamiyoClient;
  private state: PaymentState = { status: 'idle' };
  private listeners: StateListener[] = [];

  constructor(config: PaymentWidgetConfig) {
    this.config = config;
    this.client = new X402KamiyoClient({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programId,
    });
  }

  getState(): PaymentState {
    return { ...this.state };
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  async pay(): Promise<PaymentResult> {
    if (this.state.status === 'processing') throw new Error('in progress');

    this.update({ status: 'processing' });
    const txId = `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const lamports = Math.floor(this.config.amount * LAMPORTS_PER_SOL);

    try {
      const result = this.config.useEscrow
        ? await this.client.createEscrow(this.config.provider, lamports, txId)
        : await this.transfer(lamports, txId);

      if (result.success) {
        this.update({ status: 'completed', txId, signature: result.signature, escrowPda: result.escrowPda?.toBase58() });
        this.config.onComplete?.(result);
      } else {
        const msg = result.error?.message || 'failed';
        this.update({ status: 'error', error: msg });
        this.config.onError?.(new Error(msg));
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      this.update({ status: 'error', error: msg });
      this.config.onError?.(err instanceof Error ? err : new Error(msg));
      throw err;
    }
  }

  async release(): Promise<PaymentResult> {
    if (!this.state.txId) throw new Error('no escrow');
    return this.client.releaseEscrow(this.state.txId);
  }

  async dispute(): Promise<PaymentResult> {
    if (!this.state.txId) throw new Error('no escrow');
    return this.client.disputeEscrow(this.state.txId);
  }

  reset(): void {
    this.state = { status: 'idle' };
    this.listeners.forEach(l => l(this.state));
  }

  private update(patch: Partial<PaymentState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(l => l(this.state));
  }

  private async transfer(lamports: number, txId: string): Promise<PaymentResult> {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.config.wallet.publicKey,
        toPubkey: this.config.provider,
        lamports,
      })
    );
    const signature = await sendAndConfirmTransaction(this.config.connection, tx, [this.config.wallet], { commitment: 'confirmed' });
    return { success: true, signature, transactionId: txId, amount: lamports / LAMPORTS_PER_SOL };
  }
}

export function createPaymentButton(config: PaymentWidgetConfig): { html: string; widget: PaymentWidget } {
  const widget = new PaymentWidget(config);
  const html = `
<button class="kamiyo-pay" style="background:#14f195;color:#000;border:none;padding:12px 24px;font:600 16px system-ui;border-radius:8px;cursor:pointer">
  Pay ${config.amount} SOL
</button>`.trim();
  return { html, widget };
}

export async function quickPay(
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey,
  provider: PublicKey,
  amount: number,
  useEscrow = true
): Promise<PaymentResult> {
  return new PaymentWidget({ connection, wallet, programId, provider, amount, useEscrow }).pay();
}
