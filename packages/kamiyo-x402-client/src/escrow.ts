/**
 * Escrow integration with Kamiyo program
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { X402Error } from './errors';
import { validatePublicKey, validateAmountLamports, validateTransactionId, assertValid } from './validation';

// Instruction discriminators from Kamiyo program
const DISCRIMINATORS = {
  INITIALIZE_ESCROW: Buffer.from([0x3d, 0x2c, 0x1e, 0x4f, 0x5a, 0x6b, 0x7c, 0x8d]),
  RELEASE_FUNDS: Buffer.from([0x8a, 0x9b, 0xac, 0xbd, 0xce, 0xdf, 0xe0, 0xf1]),
  MARK_DISPUTED: Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]),
} as const;

export interface EscrowConfig {
  connection: Connection;
  wallet: Keypair;
  programId: PublicKey;
}

export interface EscrowCreateParams {
  provider: PublicKey;
  amount: number;
  timeLockSeconds: number;
  transactionId: string;
}

export interface EscrowResult {
  success: boolean;
  signature?: string;
  escrowPda?: PublicKey;
  error?: X402Error;
}

/**
 * Escrow handler for Kamiyo program integration
 */
export class EscrowHandler {
  private readonly connection: Connection;
  private readonly wallet: Keypair;
  private readonly programId: PublicKey;

  constructor(config: EscrowConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId;
  }

  /**
   * Derive escrow PDA for an agent and transaction ID
   */
  deriveEscrowPDA(agent: PublicKey, transactionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('escrow'),
        agent.toBuffer(),
        Buffer.from(transactionId),
      ],
      this.programId
    );
  }

  /**
   * Derive protocol config PDA
   */
  deriveProtocolConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('protocol_config')],
      this.programId
    );
  }

  /**
   * Derive fee vault PDA
   */
  deriveFeeVaultPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      this.programId
    );
  }

  /**
   * Build initialize escrow instruction
   */
  buildInitializeEscrowInstruction(params: EscrowCreateParams): TransactionInstruction {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, params.transactionId);
    const [protocolConfigPda] = this.deriveProtocolConfigPDA();
    const [feeVaultPda] = this.deriveFeeVaultPDA();

    const transactionIdBytes = Buffer.from(params.transactionId);

    const data = Buffer.concat([
      DISCRIMINATORS.INITIALIZE_ESCROW,
      new BN(params.amount).toArrayLike(Buffer, 'le', 8),
      new BN(params.timeLockSeconds).toArrayLike(Buffer, 'le', 8),
      Buffer.from([transactionIdBytes.length, 0, 0, 0]),
      transactionIdBytes,
      Buffer.from([0]), // use_spl_token = false
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: params.provider, isSigner: false, isWritable: false },
        { pubkey: protocolConfigPda, isSigner: false, isWritable: true },
        { pubkey: feeVaultPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });
  }

  /**
   * Build release funds instruction
   */
  buildReleaseFundsInstruction(transactionId: string, provider: PublicKey): TransactionInstruction {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);

    return new TransactionInstruction({
      keys: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: provider, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.RELEASE_FUNDS,
    });
  }

  /**
   * Build mark disputed instruction
   */
  buildMarkDisputedInstruction(transactionId: string): TransactionInstruction {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const [reputationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('reputation'), this.wallet.publicKey.toBuffer()],
      this.programId
    );
    const [protocolConfigPda] = this.deriveProtocolConfigPDA();
    const [feeVaultPda] = this.deriveFeeVaultPDA();

    return new TransactionInstruction({
      keys: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: reputationPda, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: protocolConfigPda, isSigner: false, isWritable: true },
        { pubkey: feeVaultPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.MARK_DISPUTED,
    });
  }

  /**
   * Create an escrow
   */
  async create(params: EscrowCreateParams): Promise<EscrowResult> {
    // Validate inputs
    assertValid(validatePublicKey(params.provider, 'provider'), 'provider');
    assertValid(validateAmountLamports(params.amount, 'amount'), 'amount');
    assertValid(validateTransactionId(params.transactionId, 'transactionId'), 'transactionId');

    try {
      const instruction = this.buildInitializeEscrowInstruction(params);
      const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, params.transactionId);

      const transaction = new Transaction().add(instruction);

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet],
        { commitment: 'confirmed' }
      );

      return {
        success: true,
        signature,
        escrowPda,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: X402Error.escrowCreationFailed(message, error instanceof Error ? error : undefined),
      };
    }
  }

  /**
   * Release escrow funds to provider
   */
  async release(transactionId: string, provider: PublicKey): Promise<EscrowResult> {
    assertValid(validateTransactionId(transactionId, 'transactionId'), 'transactionId');
    assertValid(validatePublicKey(provider, 'provider'), 'provider');

    try {
      const instruction = this.buildReleaseFundsInstruction(transactionId, provider);
      const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);

      const transaction = new Transaction().add(instruction);

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet],
        { commitment: 'confirmed' }
      );

      return {
        success: true,
        signature,
        escrowPda,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: new X402Error('PAYMENT_FAILED', `Failed to release funds: ${message}`),
      };
    }
  }

  /**
   * Mark escrow as disputed
   */
  async dispute(transactionId: string): Promise<EscrowResult> {
    assertValid(validateTransactionId(transactionId, 'transactionId'), 'transactionId');

    try {
      const instruction = this.buildMarkDisputedInstruction(transactionId);
      const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);

      const transaction = new Transaction().add(instruction);

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet],
        { commitment: 'confirmed' }
      );

      return {
        success: true,
        signature,
        escrowPda,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: new X402Error('DISPUTE_FAILED', `Failed to file dispute: ${message}`),
      };
    }
  }

  /**
   * Check if an escrow account exists
   */
  async exists(transactionId: string): Promise<boolean> {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const info = await this.connection.getAccountInfo(escrowPda);
    return info !== null;
  }

  /**
   * Get escrow balance
   */
  async getBalance(transactionId: string): Promise<number> {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const balance = await this.connection.getBalance(escrowPda);
    return balance / LAMPORTS_PER_SOL;
  }
}

/**
 * Create escrow handler
 */
export function createEscrowHandler(
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey
): EscrowHandler {
  return new EscrowHandler({ connection, wallet, programId });
}
