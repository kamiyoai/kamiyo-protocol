import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { BlindfoldClient } from './client';
import {
  BlindfoldEscrowMetadata,
  CardTier,
  CARD_TIERS,
  NATIVE_SOL_MINT,
  USDC_MINT,
  USDT_MINT,
} from './types';

export interface EscrowReleaseParams {
  escrowId: string;
  recipient: PublicKey;
  amount: BN;
  tokenMint: PublicKey;
  metadata?: BlindfoldEscrowMetadata;
}

export interface ReputationProofData {
  agentPk: string;
  commitment: string;
  proofBytes: Uint8Array;
  threshold: number;
}

export interface BlindfoldPaymentResult {
  paymentId: string;
  holdingWalletAddress: string;
  transferSignature: string;
  tier: CardTier;
  limit: number;
}

// Routes KAMIYO escrow releases to Blindfold for card payment
export class EscrowToBlindoldHook {
  private connection: Connection;
  private blindfold: BlindfoldClient;

  constructor(connection: Connection, blindfoldConfig?: { baseUrl?: string }) {
    this.connection = connection;
    this.blindfold = new BlindfoldClient(blindfoldConfig);
  }

  // Returns null if escrow doesn't have Blindfold metadata
  async onEscrowRelease(
    params: EscrowReleaseParams,
    payer: Keypair,
    reputationProof?: ReputationProofData
  ): Promise<BlindfoldPaymentResult | null> {
    const { metadata, amount, tokenMint } = params;

    if (!metadata?.blindfoldCard || !metadata.recipientEmail) {
      return null;
    }

    let tier: CardTier = 'basic';
    if (reputationProof) {
      tier = this.blindfold.getTierForThreshold(reputationProof.threshold);
    } else if (metadata.requestedTier) {
      tier = metadata.requestedTier;
    }

    const limit = this.blindfold.getLimitForTier(tier);
    const amountSol = amount.toNumber() / LAMPORTS_PER_SOL;

    if (amountSol > limit) {
      throw new Error(`Amount $${amountSol.toFixed(2)} exceeds tier limit $${limit}`);
    }

    const currency = this.getCurrencyFromMint(tokenMint);

    const payment = await this.blindfold.createPayment({
      amount: amountSol,
      currency,
      recipientEmail: metadata.recipientEmail,
      useZkProof: true,
      agentPk: reputationProof?.agentPk,
      reputationCommitment: reputationProof?.commitment,
      reputationProof: reputationProof
        ? Buffer.from(reputationProof.proofBytes).toString('base64')
        : undefined,
      requestedTier: tier,
    });

    const holding = await this.blindfold.createHoldingWallet(
      payment.paymentId,
      amount.toString(),
      tokenMint.toBase58()
    );

    const holdingWalletPubkey = new PublicKey(holding.holdingWalletAddress);
    const transferSignature = await this.transferToHoldingWallet(
      payer,
      holdingWalletPubkey,
      amount,
      tokenMint
    );

    return {
      paymentId: payment.paymentId,
      holdingWalletAddress: holding.holdingWalletAddress,
      transferSignature,
      tier,
      limit,
    };
  }

  private async transferToHoldingWallet(
    payer: Keypair,
    holdingWallet: PublicKey,
    amount: BN,
    tokenMint: PublicKey
  ): Promise<string> {
    if (tokenMint.equals(NATIVE_SOL_MINT)) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: holdingWallet,
          lamports: amount.toNumber(),
        })
      );
      return sendAndConfirmTransaction(this.connection, tx, [payer]);
    }

    // SPL tokens not yet supported by Blindfold ZK payments
    throw new Error('Only SOL transfers supported');
  }

  async waitForCompletion(
    paymentId: string,
    timeoutMs = 300000,
    pollIntervalMs = 5000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.blindfold.getPaymentStatus(paymentId);

      if (status.status === 'confirmed' && status.giftCardCreated) {
        return true;
      }

      if (status.status === 'failed' || status.status === 'expired') {
        return false;
      }

      await sleep(pollIntervalMs);
    }

    return false;
  }

  async triggerProcessing(paymentId: string): Promise<void> {
    const fundsCheck = await this.blindfold.checkFunds(paymentId);
    if (!fundsCheck.success) {
      throw new Error(`Funds not received: ${fundsCheck.message}`);
    }
    await this.blindfold.autoSplitAndExchange(paymentId);
  }

  private getCurrencyFromMint(tokenMint: PublicKey): 'SOL' | 'USDC' | 'USDT' {
    if (tokenMint.equals(NATIVE_SOL_MINT)) return 'SOL';
    if (tokenMint.equals(USDC_MINT)) return 'USDC';
    if (tokenMint.equals(USDT_MINT)) return 'USDT';
    return 'SOL';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isBlindfoldCardPayment(
  metadata: unknown
): metadata is BlindfoldEscrowMetadata {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  return m.blindfoldCard === true && typeof m.recipientEmail === 'string';
}

export function getThresholdForTier(tier: CardTier): number {
  const config = CARD_TIERS.find((t) => t.tier === tier);
  return config?.reputationThreshold ?? 0;
}
