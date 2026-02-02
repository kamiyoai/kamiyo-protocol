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
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { randomBytes } from 'node:crypto';
import {
  EigenAIError,
  EscrowParams,
  EscrowResult,
  ReleaseParams,
  LIMITS,
  KAMIYO_MINT,
  DISCRIMINATORS,
  EscrowStatus,
} from './types.js';

export type EscrowState = 'active' | 'disputed' | 'resolved' | 'released' | 'refunded' | 'unknown';

export interface EscrowHandlerConfig { connection: Connection; wallet: Keypair; programId: PublicKey }
export interface EscrowStatusResult { exists: boolean; state?: EscrowState; balance?: number; qualityScore?: number; refundPercentage?: number }

const ESCROW_STATE_MAP: Record<number, EscrowState> = { [EscrowStatus.Active]: 'active', [EscrowStatus.Disputed]: 'disputed', [EscrowStatus.Resolved]: 'resolved', [EscrowStatus.Released]: 'released', [EscrowStatus.Refunded]: 'refunded' };
function parseEscrowState(statusByte: number): EscrowState { return ESCROW_STATE_MAP[statusByte] ?? 'unknown'; }

export class EscrowHandler {
  private readonly connection: Connection;
  private readonly wallet: Keypair;
  private readonly programId: PublicKey;

  constructor(config: EscrowHandlerConfig) { this.connection = config.connection; this.wallet = config.wallet; this.programId = config.programId; }

  deriveEscrowPDA(user: PublicKey, sessionId: Uint8Array): [PublicKey, number] {
    if (sessionId.length !== LIMITS.SESSION_ID_LENGTH) throw EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`);
    return PublicKey.findProgramAddressSync([Buffer.from('escrow'), user.toBuffer(), Buffer.from(sessionId)], this.programId);
  }

  private deriveTokenTreasuryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('token_treasury')], this.programId);
  }

  private buildCreateEscrowInstruction(params: EscrowParams, escrowPda: PublicKey): TransactionInstruction {
    const [tokenTreasuryPda] = this.deriveTokenTreasuryPDA();
    const amountLamports = BigInt(Math.round(params.amount * LAMPORTS_PER_SOL));
    const data = Buffer.concat([DISCRIMINATORS.CREATE_ESCROW, Buffer.from(params.sessionId), new BN(amountLamports.toString()).toArrayLike(Buffer, 'le', 8)]);
    return new TransactionInstruction({
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
    });
  }

  private buildRateAndReleaseInstruction(params: ReleaseParams, escrowPda: PublicKey): TransactionInstruction {
    const data = Buffer.concat([DISCRIMINATORS.RATE_AND_RELEASE, Buffer.from([params.rating])]);
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

  private buildMarkDisputedInstruction(escrowPda: PublicKey): TransactionInstruction {
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
    if (params.sessionId.length !== LIMITS.SESSION_ID_LENGTH)
      return { success: false, error: EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`) };
    if (typeof params.amount !== 'number' || isNaN(params.amount) || params.amount <= 0)
      return { success: false, error: EigenAIError.invalidInput('amount', 'Must be positive') };
    if (params.amount < LIMITS.MIN_ESCROW_SOL || params.amount > LIMITS.MAX_ESCROW_SOL)
      return { success: false, error: EigenAIError.invalidInput('amount', `Must be ${LIMITS.MIN_ESCROW_SOL}-${LIMITS.MAX_ESCROW_SOL} SOL`) };
    if (!PublicKey.isOnCurve(params.treasury))
      return { success: false, error: EigenAIError.invalidInput('treasury', 'Invalid public key') };

    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, params.sessionId);
    const existing = await this.connection.getAccountInfo(escrowPda);
    if (existing) {
      return {
        success: false,
        escrowPda,
        error: EigenAIError.escrowFailed('Escrow with this session ID already exists'),
      };
    }

    try {
      const instruction = this.buildCreateEscrowInstruction(params, escrowPda);
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
    if (params.sessionId.length !== LIMITS.SESSION_ID_LENGTH)
      return { success: false, error: EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`) };
    if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5)
      return { success: false, error: EigenAIError.invalidInput('rating', 'Must be 1-5') };
    if (!PublicKey.isOnCurve(params.treasury))
      return { success: false, error: EigenAIError.invalidInput('treasury', 'Invalid public key') };

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
    if (sessionId.length !== LIMITS.SESSION_ID_LENGTH)
      return { success: false, error: EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`) };

    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, sessionId);
    const status = await this.getStatus(sessionId);

    if (!status.exists)
      return { success: false, escrowPda, error: EigenAIError.disputeFailed('Escrow not found') };
    if (status.state === 'disputed')
      return { success: true, escrowPda, sessionId };
    if (status.state !== 'active')
      return { success: false, escrowPda, error: EigenAIError.disputeFailed(`Cannot dispute: ${status.state}`) };

    try {
      const instruction = this.buildMarkDisputedInstruction(escrowPda);
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
      if (!info) return { exists: false };
      const state = info.data.length > 121 ? parseEscrowState(info.data[121]) : 'unknown' as EscrowState;
      return { exists: true, state, balance: info.lamports / LAMPORTS_PER_SOL };
    } catch { return { exists: false }; }
  }

  async getBalance(): Promise<number> { return (await this.connection.getBalance(this.wallet.publicKey)) / LAMPORTS_PER_SOL; }
  generateSessionId(): Uint8Array { return new Uint8Array(randomBytes(LIMITS.SESSION_ID_LENGTH)); }
}
