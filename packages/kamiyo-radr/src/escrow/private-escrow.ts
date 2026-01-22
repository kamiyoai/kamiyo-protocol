/**
 * Private escrow combining ShadowWire privacy with Kamiyo escrow protection.
 */

import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { ShadowWireWrapper, createShadowWireClient } from '../client/shadow-wire';
import type {
  ShadowToken,
  PrivateEscrowConfig,
  PrivateEscrowResult,
  PrivateDisputeParams,
  PrivateDisputeResult,
  DisputeSettlement,
  WalletAdapter,
} from '../types';

export interface AmountCommitment {
  commitment: string;
  blinding: Uint8Array;
  amount: number;
  cryptographic: boolean;
}

let poseidonInstance: any = null;
let poseidonLoadAttempted = false;

async function getPoseidon(): Promise<any | null> {
  if (poseidonLoadAttempted) return poseidonInstance;
  poseidonLoadAttempted = true;

  try {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonInstance = await buildPoseidon();
    return poseidonInstance;
  } catch {
    return null;
  }
}

export class PrivateEscrowHandler {
  private shadowWire: ShadowWireWrapper | null = null;
  private connection: Connection;
  private programId: PublicKey;
  private defaultConfig: PrivateEscrowConfig;

  constructor(
    connection: Connection,
    programId: PublicKey,
    defaultConfig?: Partial<PrivateEscrowConfig>
  ) {
    this.connection = connection;
    this.programId = programId;
    this.defaultConfig = {
      privateDeposit: true,
      privateSettlement: true,
      timeLockSeconds: 86400, // 24 hours
      qualityThreshold: 80,
      ...defaultConfig,
    };
  }

  async initialize(debug = false): Promise<void> {
    this.shadowWire = await createShadowWireClient(this.connection, { debug });
  }

  async generateAmountCommitment(amount: number): Promise<AmountCommitment> {
    if (amount < 0) {
      throw new Error('Amount must be non-negative');
    }
    if (!Number.isFinite(amount)) {
      throw new Error('Amount must be finite');
    }

    const blinding = new Uint8Array(32);
    crypto.getRandomValues(blinding);
    const blindingBigInt = BigInt('0x' + Buffer.from(blinding).toString('hex'));
    const amountBigInt = BigInt(Math.floor(amount * 1e9));

    const poseidon = await getPoseidon();

    if (poseidon) {
      const hashBigInt = poseidon.F.toObject(
        poseidon([amountBigInt, blindingBigInt])
      );
      const commitment = '0x' + hashBigInt.toString(16).padStart(64, '0');

      return {
        commitment,
        blinding,
        amount,
        cryptographic: true,
      };
    }

    if (this.defaultConfig.privateDeposit) {
      console.warn('[kamiyo/radr] SHA-256 fallback. Install circomlibjs for Poseidon.');
    }

    const data = new TextEncoder().encode(
      `commitment:${amountBigInt.toString()}:${blindingBigInt.toString()}`
    );
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const commitment = '0x' + Buffer.from(hashArray).toString('hex');

    return {
      commitment,
      blinding,
      amount,
      cryptographic: false,
    };
  }

  async verifyAmountCommitment(
    commitment: string,
    amount: number,
    blinding: Uint8Array
  ): Promise<boolean> {
    const regenerated = await this.generateAmountCommitmentFromValues(amount, blinding);
    return regenerated.commitment.toLowerCase() === commitment.toLowerCase();
  }

  private async generateAmountCommitmentFromValues(
    amount: number,
    blinding: Uint8Array
  ): Promise<AmountCommitment> {
    const blindingBigInt = BigInt('0x' + Buffer.from(blinding).toString('hex'));
    const amountBigInt = BigInt(Math.floor(amount * 1e9));

    const poseidon = await getPoseidon();

    if (poseidon) {
      const hashBigInt = poseidon.F.toObject(
        poseidon([amountBigInt, blindingBigInt])
      );
      return {
        commitment: '0x' + hashBigInt.toString(16).padStart(64, '0'),
        blinding,
        amount,
        cryptographic: true,
      };
    }

    const data = new TextEncoder().encode(
      `commitment:${amountBigInt.toString()}:${blindingBigInt.toString()}`
    );
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);

    return {
      commitment: '0x' + Buffer.from(hashArray).toString('hex'),
      blinding,
      amount,
      cryptographic: false,
    };
  }

  async createPrivateEscrow(params: {
    wallet: WalletAdapter;
    provider: string;
    amount: number;
    token: ShadowToken;
    transactionId: string;
    config?: Partial<PrivateEscrowConfig>;
  }): Promise<PrivateEscrowResult> {
    if (params.amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }
    if (params.amount > 1_000_000) {
      return { success: false, error: 'Amount exceeds maximum (1M)' };
    }
    if (!params.transactionId || params.transactionId.length === 0) {
      return { success: false, error: 'Transaction ID required' };
    }
    if (params.transactionId.length > 64) {
      return { success: false, error: 'Transaction ID too long (max 64 chars)' };
    }

    if (!this.shadowWire) {
      return { success: false, error: 'ShadowWire not initialized. Call initialize() first.' };
    }

    const config = { ...this.defaultConfig, ...params.config };
    const walletPubkey = params.wallet.publicKey;

    if (!walletPubkey) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      let providerPubkey: PublicKey;
      try {
        providerPubkey = new PublicKey(params.provider);
      } catch {
        return { success: false, error: 'Invalid provider address' };
      }

      if (providerPubkey.equals(walletPubkey)) {
        return { success: false, error: 'Cannot create escrow with self as provider' };
      }

      const commitment = await this.generateAmountCommitment(params.amount);
      let depositSignature: string | undefined;

      if (config.privateDeposit) {
        try {
          const depositTx = await this.shadowWire.deposit({
            wallet: walletPubkey.toBase58(),
            amount: params.amount,
            token: params.token,
          });

          if (params.wallet.signTransaction && depositTx.transaction) {
            const signed = await params.wallet.signTransaction(depositTx.transaction);
            // Send transaction
            const signature = await this.connection.sendRawTransaction(
              (signed as Transaction).serialize(),
              { skipPreflight: false }
            );
            await this.connection.confirmTransaction(signature, 'confirmed');
            depositSignature = signature;
          }
        } catch (depositErr) {
          const msg = depositErr instanceof Error ? depositErr.message : 'Unknown';
          return { success: false, error: `Deposit failed: ${msg}` };
        }
      }

      const [escrowPda, escrowBump] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('escrow'),
          walletPubkey.toBuffer(),
          Buffer.from(params.transactionId),
        ],
        this.programId
      );

      const commitmentData = {
        escrowPda: escrowPda.toBase58(),
        commitment: commitment.commitment,
        blinding: Buffer.from(commitment.blinding).toString('hex'),
        amount: params.amount,
        token: params.token,
        provider: params.provider,
        agent: walletPubkey.toBase58(),
        timeLockSeconds: config.timeLockSeconds,
        qualityThreshold: config.qualityThreshold,
        transactionId: params.transactionId,
        privateSettlement: config.privateSettlement,
        cryptographic: commitment.cryptographic,
        createdAt: Date.now(),
      };

      return {
        success: true,
        escrowPda: escrowPda.toBase58(),
        transactionId: params.transactionId,
        depositSignature,
        shadowProof: {
          commitment: commitment.commitment,
          nullifier: Buffer.from(commitment.blinding).toString('hex').slice(0, 32),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async releasePrivate(params: {
    wallet: WalletAdapter;
    escrowPda: string;
    provider: string;
    amount: number;
    token: ShadowToken;
    commitment: AmountCommitment;
  }): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (!this.shadowWire) {
      return { success: false, error: 'ShadowWire not initialized' };
    }

    const walletPubkey = params.wallet.publicKey;
    if (!walletPubkey) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const canReceiveInternal = await this.shadowWire.canReceiveInternal(params.provider);

      const result = await this.shadowWire.transfer({
        sender: walletPubkey.toBase58(),
        recipient: params.provider,
        amount: params.amount,
        token: params.token,
        type: canReceiveInternal ? 'internal' : 'external',
        wallet: params.wallet,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, signature: result.signature };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async fileDispute(params: PrivateDisputeParams): Promise<PrivateDisputeResult> {
    try {
      let escrowPubkey: PublicKey;
      try {
        escrowPubkey = new PublicKey(params.escrowPda);
      } catch {
        return { success: false, error: 'Invalid escrow address' };
      }

      const disputeId = `dispute_${params.transactionId}_${Date.now()}`;
      const commitDeadline = Math.floor(Date.now() / 1000) + 300;

      return {
        success: true,
        disputeId,
        oracleCommitDeadline: commitDeadline,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async settleDispute(params: {
    wallet: WalletAdapter;
    escrowPda: string;
    transactionId: string;
    commitment: AmountCommitment;
    token: ShadowToken;
    settlement: DisputeSettlement;
  }): Promise<{ success: boolean; agentSignature?: string; providerSignature?: string; error?: string }> {
    if (!this.shadowWire) {
      return { success: false, error: 'ShadowWire not initialized' };
    }

    const walletPubkey = params.wallet.publicKey;
    if (!walletPubkey) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const { settlement, commitment, token } = params;
      let agentSignature: string | undefined;
      let providerSignature: string | undefined;

      const agentAmount = commitment.amount * (settlement.refundPercentage / 100);
      const providerAmount = commitment.amount - agentAmount;

      if (agentAmount > 0) {
        agentSignature = 'refund_internal';
      }

      if (providerAmount > 0) {
        const provider = await this.getEscrowProvider(params.escrowPda);
        if (!provider) {
          return { success: false, error: 'Could not determine provider address' };
        }

        if (settlement.privateSettlement) {
          const result = await this.shadowWire.transfer({
            sender: walletPubkey.toBase58(),
            recipient: provider,
            amount: providerAmount,
            token,
            type: 'internal',
            wallet: params.wallet,
          });
          providerSignature = result.signature;
        } else {
          providerSignature = 'public_settlement_pending';
        }
      }

      return { success: true, agentSignature, providerSignature };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  private async getEscrowProvider(escrowPda: string): Promise<string | null> {
    try {
      const escrowPubkey = new PublicKey(escrowPda);
      const accountInfo = await this.connection.getAccountInfo(escrowPubkey);
      if (!accountInfo) return null;

      const providerBytes = accountInfo.data.slice(40, 72);
      return new PublicKey(providerBytes).toBase58();
    } catch {
      return null;
    }
  }

  calculateSettlement(qualityScore: number, amount: number): DisputeSettlement {
    let refundPercentage: number;

    if (qualityScore >= 80) {
      refundPercentage = 0;
    } else if (qualityScore >= 65) {
      refundPercentage = 35;
    } else if (qualityScore >= 50) {
      refundPercentage = 75;
    } else {
      refundPercentage = 100;
    }

    const agentRefund = amount * (refundPercentage / 100);
    const providerPayout = amount - agentRefund;

    return {
      qualityScore,
      refundPercentage,
      agentRefund,
      providerPayout,
      privateSettlement: true,
    };
  }
}

export async function createPrivateEscrowHandler(
  connection: Connection,
  programId: PublicKey | string,
  config?: Partial<PrivateEscrowConfig>,
  debug = false
): Promise<PrivateEscrowHandler> {
  const pid = typeof programId === 'string' ? new PublicKey(programId) : programId;
  const handler = new PrivateEscrowHandler(connection, pid, config);
  await handler.initialize(debug);
  return handler;
}
