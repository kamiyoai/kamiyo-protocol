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
import { EigenAIError, EscrowParams, EscrowResult, LIMITS } from './types.js';

const DISCRIMINATORS = {
  INITIALIZE_ESCROW: Buffer.from([0x3d, 0x2c, 0x1e, 0x4f, 0x5a, 0x6b, 0x7c, 0x8d]),
  RELEASE_FUNDS: Buffer.from([0x8a, 0x9b, 0xac, 0xbd, 0xce, 0xdf, 0xe0, 0xf1]),
  MARK_DISPUTED: Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]),
} as const;

export type EscrowState = 'active' | 'released' | 'disputed' | 'resolved' | 'unknown';

export interface EscrowHandlerConfig {
  connection: Connection;
  wallet: Keypair;
  programId: PublicKey;
}

export interface EscrowStatus {
  exists: boolean;
  state?: EscrowState;
  balance?: number;
}

function parseEscrowState(statusByte: number): EscrowState {
  switch (statusByte) {
    case 0:
      return 'active';
    case 1:
      return 'released';
    case 2:
      return 'disputed';
    case 3:
      return 'resolved';
    default:
      return 'unknown';
  }
}

export class EscrowHandler {
  private readonly connection: Connection;
  private readonly wallet: Keypair;
  private readonly programId: PublicKey;

  constructor(config: EscrowHandlerConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId;
  }

  deriveEscrowPDA(agent: PublicKey, transactionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), agent.toBuffer(), Buffer.from(transactionId)],
      this.programId
    );
  }

  private deriveProtocolConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('protocol_config')],
      this.programId
    );
  }

  private deriveFeeVaultPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], this.programId);
  }

  private buildInitializeEscrowInstruction(params: EscrowParams): TransactionInstruction {
    if (params.transactionId.length > LIMITS.MAX_TRANSACTION_ID_LENGTH) {
      throw EigenAIError.invalidInput('transactionId', `Exceeds ${LIMITS.MAX_TRANSACTION_ID_LENGTH} bytes`);
    }

    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, params.transactionId);
    const [protocolConfigPda] = this.deriveProtocolConfigPDA();
    const [feeVaultPda] = this.deriveFeeVaultPDA();

    const transactionIdBytes = Buffer.from(params.transactionId);
    const amountLamports = Math.floor(params.amount * LAMPORTS_PER_SOL);

    const data = Buffer.concat([
      DISCRIMINATORS.INITIALIZE_ESCROW,
      new BN(amountLamports).toArrayLike(Buffer, 'le', 8),
      new BN(params.timeLockSeconds).toArrayLike(Buffer, 'le', 8),
      Buffer.from([transactionIdBytes.length, 0, 0, 0]),
      transactionIdBytes,
      Buffer.from([0]),
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

  private buildReleaseFundsInstruction(
    transactionId: string,
    provider: PublicKey
  ): TransactionInstruction {
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

  private buildMarkDisputedInstruction(transactionId: string): TransactionInstruction {
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

  async create(params: EscrowParams): Promise<EscrowResult> {
    if (!params.transactionId || params.transactionId.length > LIMITS.MAX_TRANSACTION_ID_LENGTH) {
      return {
        success: false,
        error: EigenAIError.invalidInput('transactionId', 'Invalid or missing transaction ID'),
      };
    }
    if (params.amount < LIMITS.MIN_ESCROW_SOL || params.amount > LIMITS.MAX_ESCROW_SOL) {
      return {
        success: false,
        error: EigenAIError.invalidInput('amount', `Must be between ${LIMITS.MIN_ESCROW_SOL} and ${LIMITS.MAX_ESCROW_SOL} SOL`),
      };
    }
    if (params.timeLockSeconds < LIMITS.MIN_TIME_LOCK_SECONDS || params.timeLockSeconds > LIMITS.MAX_TIME_LOCK_SECONDS) {
      return {
        success: false,
        error: EigenAIError.invalidInput('timeLockSeconds', `Must be between ${LIMITS.MIN_TIME_LOCK_SECONDS} and ${LIMITS.MAX_TIME_LOCK_SECONDS} seconds`),
      };
    }

    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, params.transactionId);
    const existing = await this.connection.getAccountInfo(escrowPda);
    if (existing) {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.escrowFailed('Escrow with this transaction ID already exists'),
      };
    }

    try {
      const instruction = this.buildInitializeEscrowInstruction(params);
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
        transactionId: params.transactionId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('insufficient funds') || message.includes('0x1')) {
        return {
          success: false,
          error: EigenAIError.insufficientFunds(params.amount, 0),
        };
      }
      return {
        success: false,
        error: EigenAIError.escrowFailed(message, error instanceof Error ? error : undefined),
      };
    }
  }

  async release(transactionId: string, provider: PublicKey): Promise<EscrowResult> {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const status = await this.getStatus(transactionId);
    if (!status.exists) {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.escrowFailed('Escrow does not exist'),
      };
    }
    if (status.state !== 'active') {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.escrowFailed(`Cannot release escrow in state: ${status.state}`),
      };
    }

    try {
      const instruction = this.buildReleaseFundsInstruction(transactionId, provider);
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
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.escrowFailed(
          `Failed to release: ${error instanceof Error ? error.message : 'Unknown'}`,
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  async dispute(transactionId: string): Promise<EscrowResult> {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const status = await this.getStatus(transactionId);
    if (!status.exists) {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.disputeFailed('Escrow does not exist'),
      };
    }
    if (status.state === 'disputed') {
      return {
        success: true,
        escrowPda,
        transactionId,
      };
    }
    if (status.state !== 'active') {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.disputeFailed(`Cannot dispute escrow in state: ${status.state}`),
      };
    }

    try {
      const instruction = this.buildMarkDisputedInstruction(transactionId);
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
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.disputeFailed(
          error instanceof Error ? error.message : 'Unknown error',
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  async getStatus(transactionId: string): Promise<EscrowStatus> {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const info = await this.connection.getAccountInfo(escrowPda);

    if (!info) {
      return { exists: false };
    }

    const balance = info.lamports / LAMPORTS_PER_SOL;
    let state: EscrowState = 'unknown';
    if (info.data.length >= 97) {
      state = parseEscrowState(info.data[96]);
    }

    return { exists: true, state, balance };
  }

  async getBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.wallet.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }
}
