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
import {
  TOKEN_2022_PROGRAM_ID,
  createBurnInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import {
  EigenAIError,
  EscrowParams,
  EscrowResult,
  ReleaseParams,
  LIMITS,
  KAMIYO_MINT,
  FEE_CREATE_ESCROW,
  BURN_RATE_BPS,
  DISCRIMINATORS,
  EscrowStatus,
} from './types.js';

export type EscrowState = 'active' | 'disputed' | 'resolved' | 'released' | 'refunded' | 'unknown';

export interface EscrowHandlerConfig {
  connection: Connection;
  wallet: Keypair;
  programId: PublicKey;
}

export interface EscrowStatusResult {
  exists: boolean;
  state?: EscrowState;
  balance?: number;
  qualityScore?: number;
  refundPercentage?: number;
}

function parseEscrowState(statusByte: number): EscrowState {
  switch (statusByte) {
    case EscrowStatus.Active:
      return 'active';
    case EscrowStatus.Disputed:
      return 'disputed';
    case EscrowStatus.Resolved:
      return 'resolved';
    case EscrowStatus.Released:
      return 'released';
    case EscrowStatus.Refunded:
      return 'refunded';
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

  deriveEscrowPDA(user: PublicKey, sessionId: Uint8Array): [PublicKey, number] {
    if (sessionId.length !== LIMITS.SESSION_ID_LENGTH) {
      throw EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`);
    }
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), user.toBuffer(), Buffer.from(sessionId)],
      this.programId
    );
  }

  private deriveTokenTreasuryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('token_treasury')],
      this.programId
    );
  }

  private buildCreateEscrowInstruction(
    params: EscrowParams,
    escrowPda: PublicKey,
    escrowBump: number
  ): TransactionInstruction[] {
    const [tokenTreasuryPda] = this.deriveTokenTreasuryPDA();
    const amountLamports = Math.floor(params.amount * LAMPORTS_PER_SOL);

    const burnAmount = BigInt(FEE_CREATE_ESCROW) * BigInt(BURN_RATE_BPS) / 10000n;
    const treasuryAmount = BigInt(FEE_CREATE_ESCROW) - burnAmount;

    const instructions: TransactionInstruction[] = [];

    instructions.push(
      createBurnInstruction(
        params.userTokenAccount,
        KAMIYO_MINT,
        this.wallet.publicKey,
        burnAmount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    instructions.push(
      createTransferCheckedInstruction(
        params.userTokenAccount,
        KAMIYO_MINT,
        tokenTreasuryPda,
        this.wallet.publicKey,
        treasuryAmount,
        6,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const data = Buffer.concat([
      DISCRIMINATORS.CREATE_ESCROW,
      Buffer.from(params.sessionId),
      new BN(amountLamports).toArrayLike(Buffer, 'le', 8),
    ]);

    instructions.push(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: params.treasury, isSigner: false, isWritable: false },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: KAMIYO_MINT, isSigner: false, isWritable: true },
          { pubkey: params.userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: tokenTreasuryPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      })
    );

    return instructions;
  }

  private buildRateAndReleaseInstruction(
    params: ReleaseParams,
    escrowPda: PublicKey
  ): TransactionInstruction {
    const data = Buffer.concat([
      DISCRIMINATORS.RATE_AND_RELEASE,
      Buffer.from([params.rating]),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: params.treasury, isSigner: false, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data,
    });
  }

  private buildMarkDisputedInstruction(
    sessionId: Uint8Array,
    escrowPda: PublicKey
  ): TransactionInstruction {
    return new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.MARK_DISPUTED,
    });
  }

  async create(params: EscrowParams): Promise<EscrowResult> {
    if (params.sessionId.length !== LIMITS.SESSION_ID_LENGTH) {
      return {
        success: false,
        error: EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`),
      };
    }
    if (typeof params.amount !== 'number' || isNaN(params.amount) || params.amount <= 0) {
      return {
        success: false,
        error: EigenAIError.invalidInput('amount', 'Must be a positive number'),
      };
    }
    if (params.amount < LIMITS.MIN_ESCROW_SOL || params.amount > LIMITS.MAX_ESCROW_SOL) {
      return {
        success: false,
        error: EigenAIError.invalidInput('amount', `Must be between ${LIMITS.MIN_ESCROW_SOL} and ${LIMITS.MAX_ESCROW_SOL} SOL`),
      };
    }
    if (!PublicKey.isOnCurve(params.treasury)) {
      return {
        success: false,
        error: EigenAIError.invalidInput('treasury', 'Invalid treasury public key'),
      };
    }

    const [escrowPda, bump] = this.deriveEscrowPDA(this.wallet.publicKey, params.sessionId);
    const existing = await this.connection.getAccountInfo(escrowPda);
    if (existing) {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.escrowFailed('Escrow with this session ID already exists'),
      };
    }

    try {
      const instructions = this.buildCreateEscrowInstruction(params, escrowPda, bump);
      const transaction = new Transaction().add(...instructions);
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
        sessionId: params.sessionId,
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

  async rateAndRelease(params: ReleaseParams): Promise<EscrowResult> {
    if (params.sessionId.length !== LIMITS.SESSION_ID_LENGTH) {
      return {
        success: false,
        error: EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`),
      };
    }
    if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
      return {
        success: false,
        error: EigenAIError.invalidInput('rating', 'Must be an integer between 1 and 5'),
      };
    }
    if (!PublicKey.isOnCurve(params.treasury)) {
      return {
        success: false,
        error: EigenAIError.invalidInput('treasury', 'Invalid treasury public key'),
      };
    }

    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, params.sessionId);
    const status = await this.getStatus(params.sessionId);
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
      const instruction = this.buildRateAndReleaseInstruction(params, escrowPda);
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
        sessionId: params.sessionId,
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

  async dispute(sessionId: Uint8Array): Promise<EscrowResult> {
    if (sessionId.length !== LIMITS.SESSION_ID_LENGTH) {
      return {
        success: false,
        error: EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`),
      };
    }

    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, sessionId);
    const status = await this.getStatus(sessionId);
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
        sessionId,
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
      const instruction = this.buildMarkDisputedInstruction(sessionId, escrowPda);
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
        sessionId,
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

  async getStatus(sessionId: Uint8Array): Promise<EscrowStatusResult> {
    try {
      const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, sessionId);
      const info = await this.connection.getAccountInfo(escrowPda);

      if (!info) {
        return { exists: false };
      }

    const balance = info.lamports / LAMPORTS_PER_SOL;

    let state: EscrowState = 'unknown';
    let qualityScore: number | undefined;
    let refundPercentage: number | undefined;

    if (info.data.length >= 122) {
      state = parseEscrowState(info.data[121]);
    }

    return { exists: true, state, balance, qualityScore, refundPercentage };
    } catch {
      return { exists: false };
    }
  }

  async getBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.wallet.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }

  generateSessionId(): Uint8Array {
    const sessionId = new Uint8Array(LIMITS.SESSION_ID_LENGTH);
    crypto.getRandomValues(sessionId);
    return sessionId;
  }
}
