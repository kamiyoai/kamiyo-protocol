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

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

const DISCRIMINATORS = {
  INITIALIZE_ESCROW: Buffer.from([0x3d, 0x2c, 0x1e, 0x4f, 0x5a, 0x6b, 0x7c, 0x8d]),
  RELEASE_FUNDS: Buffer.from([0x8a, 0x9b, 0xac, 0xbd, 0xce, 0xdf, 0xe0, 0xf1]),
  MARK_DISPUTED: Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]),
} as const;

export type EscrowState = 'active' | 'released' | 'disputed' | 'resolved' | 'unknown';

export interface EscrowConfig {
  connection: Connection;
  wallet: Keypair;
  programId: PublicKey;
  retryAttempts?: number;
  retryDelayMs?: number;
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
  state?: EscrowState;
  balance?: number;
  retriesUsed?: number;
  error?: X402Error;
}

export interface EscrowStatusResult {
  exists: boolean;
  state?: EscrowState;
  balance?: number;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const ESCROW_STATE_OFFSET = 96; // discriminator(8) + agent(32) + provider(32) + amount(8) + timelock(8) + created(8)

function parseEscrowState(statusByte: number): EscrowState {
  switch (statusByte) {
    case 0: return 'active';
    case 1: return 'released';
    case 2: return 'disputed';
    case 3: return 'resolved';
    default: return 'unknown';
  }
}

export class EscrowHandler {
  private readonly connection: Connection;
  private readonly wallet: Keypair;
  private readonly programId: PublicKey;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  constructor(config: EscrowConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId;
    this.retryAttempts = config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  deriveEscrowPDA(agent: PublicKey, transactionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), agent.toBuffer(), Buffer.from(transactionId)],
      this.programId
    );
  }

  deriveProtocolConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('protocol_config')], this.programId);
  }

  deriveFeeVaultPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], this.programId);
  }

  private deriveReputationPDA(agent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('reputation'), agent.toBuffer()], this.programId);
  }

  buildInitializeEscrowInstruction(params: EscrowCreateParams): TransactionInstruction {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, params.transactionId);
    const [protocolConfigPda] = this.deriveProtocolConfigPDA();
    const [feeVaultPda] = this.deriveFeeVaultPDA();

    const transactionIdBytes = Buffer.from(params.transactionId);
    const lenPrefix = Buffer.alloc(4);
    lenPrefix.writeUInt32LE(transactionIdBytes.length, 0);

    const data = Buffer.concat([
      DISCRIMINATORS.INITIALIZE_ESCROW,
      new BN(params.amount).toArrayLike(Buffer, 'le', 8),
      new BN(params.timeLockSeconds).toArrayLike(Buffer, 'le', 8),
      lenPrefix,
      transactionIdBytes,
      Buffer.from([0]), // boolean use_spl_token = false
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

  buildMarkDisputedInstruction(transactionId: string): TransactionInstruction {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const [reputationPda] = this.deriveReputationPDA(this.wallet.publicKey);
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

  async create(params: EscrowCreateParams): Promise<EscrowResult> {
    assertValid(validatePublicKey(params.provider, 'provider'), 'provider');
    assertValid(validateAmountLamports(params.amount, 'amount'), 'amount');
    assertValid(validateTransactionId(params.transactionId, 'transactionId'), 'transactionId');

    try {
      const instruction = this.buildInitializeEscrowInstruction(params);
      const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, params.transactionId);
      const tx = new Transaction().add(instruction);

      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.wallet],
        { commitment: 'confirmed', preflightCommitment: 'confirmed', skipPreflight: false }
      );

      return { success: true, signature, escrowPda };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: X402Error.escrowCreationFailed(message, error instanceof Error ? error : undefined) };
    }
  }

  async release(transactionId: string, provider: PublicKey): Promise<EscrowResult> {
    assertValid(validateTransactionId(transactionId, 'transactionId'), 'transactionId');
    assertValid(validatePublicKey(provider, 'provider'), 'provider');

    try {
      const instruction = this.buildReleaseFundsInstruction(transactionId, provider);
      const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
      const tx = new Transaction().add(instruction);

      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.wallet],
        { commitment: 'confirmed', preflightCommitment: 'confirmed', skipPreflight: false }
      );

      return { success: true, signature, escrowPda };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: new X402Error('PAYMENT_FAILED', `Failed to release funds: ${message}`) };
    }
  }

  async dispute(transactionId: string): Promise<EscrowResult> {
    assertValid(validateTransactionId(transactionId, 'transactionId'), 'transactionId');

    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    let lastError: Error | undefined;
    let retriesUsed = 0;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const instruction = this.buildMarkDisputedInstruction(transactionId);
        const tx = new Transaction().add(instruction);

        const signature = await sendAndConfirmTransaction(
          this.connection,
          tx,
          [this.wallet],
          { commitment: 'confirmed', preflightCommitment: 'confirmed', skipPreflight: false }
        );

        const status = await this.getStatus(transactionId);
        if (status.state === 'disputed') {
          return { success: true, signature, escrowPda, state: 'disputed', balance: status.balance, retriesUsed };
        }

        return { success: true, signature, escrowPda, state: status.state, balance: status.balance, retriesUsed };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retriesUsed = attempt + 1;

        const status = await this.getStatus(transactionId);
        if (status.state === 'disputed') {
          return { success: true, escrowPda, state: 'disputed', balance: status.balance, retriesUsed };
        }

        if (this.isNonRetryableError(lastError)) break;

        const delay = Math.min(this.retryDelayMs * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
        await sleep(delay);
      }
    }

    return {
      success: false,
      escrowPda,
      retriesUsed,
      error: new X402Error('DISPUTE_FAILED', `Failed to file dispute after ${retriesUsed} attempts: ${lastError?.message}`),
    };
  }

  async disputeWithRecovery(
    transactionId: string,
    options?: { pollIntervalMs?: number; maxPollAttempts?: number }
  ): Promise<EscrowResult> {
    const pollInterval = options?.pollIntervalMs ?? 2000;
    const maxPollAttempts = options?.maxPollAttempts ?? 5;
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);

    const initialStatus = await this.getStatus(transactionId);
    if (initialStatus.state === 'disputed' || initialStatus.state === 'resolved') {
      return { success: true, escrowPda, state: initialStatus.state, balance: initialStatus.balance, retriesUsed: 0 };
    }

    if (!initialStatus.exists) {
      return { success: false, error: new X402Error('DISPUTE_FAILED', 'Escrow does not exist') };
    }

    const result = await this.dispute(transactionId);
    if (!result.success) return result;

    for (let i = 0; i < maxPollAttempts; i++) {
      await sleep(pollInterval);
      const status = await this.getStatus(transactionId);
      if (status.state === 'disputed' || status.state === 'resolved') {
        return { ...result, state: status.state, balance: status.balance };
      }
    }

    return result;
  }

  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('insufficient funds') ||
      message.includes('account not found') ||
      message.includes('invalid account') ||
      message.includes('already processed') ||
      message.includes('invalid instruction') ||
      message.includes('blockhash not found') ||
      message.includes('would exceed max ledger slots')
    );
  }

  async exists(transactionId: string): Promise<boolean> {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const info = await this.connection.getAccountInfo(escrowPda, { commitment: 'confirmed' });
    return info !== null;
  }

  async getBalance(transactionId: string): Promise<number> {
    const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
    const balance = await this.connection.getBalance(escrowPda, 'confirmed');
    return balance / LAMPORTS_PER_SOL;
  }

  async getStatus(transactionId: string): Promise<EscrowStatusResult> {
    try {
      const [escrowPda] = this.deriveEscrowPDA(this.wallet.publicKey, transactionId);
      const info = await this.connection.getAccountInfo(escrowPda, { commitment: 'confirmed' });

      if (!info) return { exists: false };

      const balance = info.lamports / LAMPORTS_PER_SOL;
      let state: EscrowState = 'unknown';
      if (info.data.length >= ESCROW_STATE_OFFSET + 1) {
        state = parseEscrowState(info.data[ESCROW_STATE_OFFSET]);
      }

      return { exists: true, state, balance };
    } catch (error) {
      return { exists: false, error: error instanceof Error ? error.message : 'Failed to get status' };
    }
  }

  async waitForState(
    transactionId: string,
    targetState: EscrowState,
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<EscrowStatusResult> {
    const timeoutMs = options?.timeoutMs ?? 30000;
    const pollIntervalMs = options?.pollIntervalMs ?? 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getStatus(transactionId);
      if (!status.exists) return status;
      if (status.state === targetState) return status;
      if (targetState === 'disputed' && status.state === 'resolved') return status;
      await sleep(pollIntervalMs);
    }

    return { exists: true, error: `Timeout waiting for state ${targetState}` };
  }
}

export function createEscrowHandler(
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey
): EscrowHandler {
  return new EscrowHandler({ connection, wallet, programId });
}
