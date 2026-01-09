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
  BlindoldEscrowMetadata,
  CardTier,
  CARD_TIERS,
  NATIVE_SOL_MINT,
} from './types';

export interface EscrowReleaseParams {
  escrowId: string;
  recipient: PublicKey;
  amount: BN;
  tokenMint: PublicKey;
  metadata?: BlindoldEscrowMetadata;
}

export interface ReputationProofData {
  agentPk: string;
  commitment: string;
  proofBytes: Uint8Array;
  threshold: number;
}

export interface BlindofoldPaymentResult {
  paymentId: string;
  holdingWalletAddress: string;
  transferSignature: string;
  tier: CardTier;
  limit: number;
}

/**
 * Hook to route KAMIYO escrow releases to Blindfold for card payment.
 */
export class EscrowToBlindoldHook {
  private connection: Connection;
  private blindfold: BlindfoldClient;

  constructor(connection: Connection, blindfoldConfig?: { baseUrl?: string }) {
    this.connection = connection;
    this.blindfold = new BlindfoldClient(blindfoldConfig);
  }

  /**
   * Process an escrow release, optionally routing to Blindfold.
   * Returns null if escrow doesn't have Blindfold metadata.
   */
  async onEscrowRelease(
    params: EscrowReleaseParams,
    payer: Keypair,
    reputationProof?: ReputationProofData
  ): Promise<BlindofoldPaymentResult | null> {
    const { metadata, amount, tokenMint } = params;

    if (!metadata?.blindfoldCard || !metadata.recipientEmail) {
      return null;
    }

    // Determine tier from reputation
    let tier: CardTier = 'basic';
    if (reputationProof) {
      tier = this.blindfold.getTierForThreshold(reputationProof.threshold);
    } else if (metadata.requestedTier) {
      tier = metadata.requestedTier;
    }

    const limit = this.blindfold.getLimitForTier(tier);
    const amountSol = amount.toNumber() / LAMPORTS_PER_SOL;

    // Validate amount against tier limit
    if (amountSol > limit) {
      throw new Error(
        `Amount $${amountSol.toFixed(2)} exceeds tier limit $${limit}`
      );
    }

    // Determine currency
    const currency = this.getCurrencyFromMint(tokenMint);

    // Create Blindfold payment
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

    // Create holding wallet
    const holding = await this.blindfold.createHoldingWallet(
      payment.paymentId,
      amount.toString(),
      tokenMint.toBase58()
    );

    // Transfer funds to holding wallet
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

  /**
   * Transfer funds to Blindfold holding wallet.
   */
  private async transferToHoldingWallet(
    payer: Keypair,
    holdingWallet: PublicKey,
    amount: BN,
    tokenMint: PublicKey
  ): Promise<string> {
    const isNativeSOL =
      tokenMint.equals(NATIVE_SOL_MINT) ||
      tokenMint.toBase58() === 'Native';

    if (isNativeSOL) {
      // Native SOL transfer
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: holdingWallet,
          lamports: amount.toNumber(),
        })
      );

      return sendAndConfirmTransaction(this.connection, tx, [payer]);
    }

    // SPL token transfer would go here
    // For now, only SOL is supported in Blindfold ZK payments
    throw new Error('Only SOL transfers are currently supported');
  }

  /**
   * Poll for payment completion.
   */
  async waitForCompletion(
    paymentId: string,
    timeoutMs: number = 300000,
    pollIntervalMs: number = 5000
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

  /**
   * Trigger the auto-split and exchange process after funds arrive.
   */
  async triggerProcessing(paymentId: string): Promise<void> {
    // Check funds arrived
    const fundsCheck = await this.blindfold.checkFunds(paymentId);
    if (!fundsCheck.success) {
      throw new Error(`Funds not received: ${fundsCheck.message}`);
    }

    // Trigger split and exchange
    await this.blindfold.autoSplitAndExchange(paymentId);
  }

  private getCurrencyFromMint(tokenMint: PublicKey): 'SOL' | 'USDC' | 'USDT' {
    const mint = tokenMint.toBase58();
    if (mint === NATIVE_SOL_MINT.toBase58() || mint === 'Native') {
      return 'SOL';
    }
    if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
      return 'USDC';
    }
    if (mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') {
      return 'USDT';
    }
    return 'SOL';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if escrow metadata indicates Blindfold card payment.
 */
export function isBlindoldCardPayment(
  metadata: unknown
): metadata is BlindoldEscrowMetadata {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  return m.blindfoldCard === true && typeof m.recipientEmail === 'string';
}

/**
 * Get required reputation threshold for a card tier.
 */
export function getThresholdForTier(tier: CardTier): number {
  const config = CARD_TIERS.find((t) => t.tier === tier);
  return config?.reputationThreshold ?? 0;
}
