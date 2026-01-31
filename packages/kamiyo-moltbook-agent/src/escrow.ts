import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import crypto from 'crypto';

export type EscrowStatus = 'active' | 'released' | 'disputed' | 'resolved' | 'refunded' | 'unknown';

export interface EscrowResult {
  success: boolean;
  escrowAddress?: string;
  signature?: string;
  error?: string;
}

export interface EscrowState {
  status: EscrowStatus;
  amount: number;
  provider: string;
  agent: string;
  createdAt: number;
  expiresAt: number;
}

// Validation constants
const MAX_JOB_ID_LENGTH = 100;
const MIN_AMOUNT_SOL = 0.001;
const MAX_AMOUNT_SOL = 1000;
const MIN_RATING = 1;
const MAX_RATING = 5;
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// KAMIYO token mint on pump.fun (Token-2022)
const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

// Discriminators for program instructions
const DISCRIMINATORS = {
  createEscrow: Buffer.from([200, 155, 31, 148, 211, 76, 1, 206]),
  rateAndRelease: Buffer.from([186, 40, 179, 217, 195, 57, 44, 113]),
};

export class EscrowClient {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;
  private treasuryAddress: PublicKey | null = null;

  constructor(
    connection: Connection,
    wallet: Keypair,
    programId: PublicKey,
    treasuryAddress?: string
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
    if (treasuryAddress) {
      this.treasuryAddress = new PublicKey(treasuryAddress);
    }
  }

  get publicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  private generateSessionId(jobId: string): Uint8Array {
    const hash = crypto.createHash('sha256');
    hash.update(`moltbook_${jobId}`);
    return new Uint8Array(hash.digest());
  }

  getEscrowPDA(sessionId: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('escrow'),
        this.wallet.publicKey.toBuffer(),
        Buffer.from(sessionId),
      ],
      this.programId
    );
  }

  getTokenTreasuryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('token_treasury')],
      this.programId
    );
  }

  async createEscrow(params: {
    requester: string;
    amount: number;
    jobId: string;
  }): Promise<EscrowResult> {
    // Input validation
    if (!params.jobId || params.jobId.length > MAX_JOB_ID_LENGTH) {
      return { success: false, error: 'Invalid job ID' };
    }
    if (!params.requester || !BASE58_REGEX.test(params.requester)) {
      return { success: false, error: 'Invalid requester address' };
    }
    if (!Number.isFinite(params.amount) || params.amount < MIN_AMOUNT_SOL) {
      return { success: false, error: `Amount must be at least ${MIN_AMOUNT_SOL} SOL` };
    }
    if (params.amount > MAX_AMOUNT_SOL) {
      return { success: false, error: `Amount cannot exceed ${MAX_AMOUNT_SOL} SOL` };
    }
    if (!this.treasuryAddress) {
      return { success: false, error: 'Treasury address not configured' };
    }

    try {
      console.log(`[Escrow] Creating: job=${params.jobId} amount=${params.amount}SOL`);

      // Generate session ID from job ID
      const sessionId = this.generateSessionId(params.jobId);

      // Derive PDA for escrow account
      const [escrowPda] = this.getEscrowPDA(sessionId);
      const [tokenTreasuryPda] = this.getTokenTreasuryPDA();

      // Get user's KAMIYO token account
      const userTokenAccount = getAssociatedTokenAddressSync(
        KAMIYO_MINT,
        this.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Convert SOL to lamports
      const amountLamports = BigInt(Math.floor(params.amount * LAMPORTS_PER_SOL));

      // Build instruction data: discriminator + session_id (32 bytes) + amount (8 bytes LE)
      const data = Buffer.alloc(8 + 32 + 8);
      DISCRIMINATORS.createEscrow.copy(data, 0);
      Buffer.from(sessionId).copy(data, 8);
      data.writeBigUInt64LE(amountLamports, 40);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: this.treasuryAddress, isSigner: false, isWritable: false },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: KAMIYO_MINT, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: tokenTreasuryPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const transaction = new Transaction().add(instruction);

      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      transaction.sign(this.wallet);

      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false }
      );

      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      console.log(`[Escrow] Created: ${escrowPda.toBase58()} tx=${signature}`);

      return {
        success: true,
        escrowAddress: escrowPda.toBase58(),
        signature,
      };
    } catch (err) {
      console.error('[Escrow] Failed to create escrow:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async releaseEscrow(params: {
    escrowAddress: string;
    rating: number;
  }): Promise<EscrowResult> {
    // Input validation
    if (!params.escrowAddress || !BASE58_REGEX.test(params.escrowAddress)) {
      return { success: false, error: 'Invalid escrow address' };
    }
    if (!Number.isInteger(params.rating) || params.rating < MIN_RATING || params.rating > MAX_RATING) {
      return { success: false, error: `Rating must be between ${MIN_RATING} and ${MAX_RATING}` };
    }
    if (!this.treasuryAddress) {
      return { success: false, error: 'Treasury address not configured' };
    }

    try {
      console.log(`[Escrow] Releasing: ${params.escrowAddress} rating=${params.rating}`);

      const escrowPda = new PublicKey(params.escrowAddress);

      // Build instruction data: discriminator + rating (1 byte)
      const data = Buffer.alloc(9);
      DISCRIMINATORS.rateAndRelease.copy(data, 0);
      data.writeUInt8(params.rating, 8);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: this.treasuryAddress, isSigner: false, isWritable: true },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
        ],
        programId: this.programId,
        data,
      });

      const transaction = new Transaction().add(instruction);

      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      transaction.sign(this.wallet);

      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false }
      );

      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      console.log(`[Escrow] Released: tx=${signature}`);

      return {
        success: true,
        escrowAddress: params.escrowAddress,
        signature,
      };
    } catch (err) {
      console.error('[Escrow] Failed to release escrow:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async checkStatus(escrowAddress: string): Promise<EscrowState | null> {
    if (!escrowAddress || !BASE58_REGEX.test(escrowAddress)) {
      return null;
    }

    try {
      const pubkey = new PublicKey(escrowAddress);
      const accountInfo = await this.connection.getAccountInfo(pubkey);

      if (!accountInfo) {
        return null;
      }

      // Skip 8-byte discriminator and parse escrow state
      const data = accountInfo.data;
      if (data.length < 90) {
        return null;
      }

      // Parse escrow account (after 8-byte discriminator):
      // user: 32 bytes
      // treasury: 32 bytes
      // session_id: 32 bytes
      // amount: 8 bytes (u64)
      // created_at: 8 bytes (i64)
      // bump: 1 byte
      // status: 1 byte

      const user = new PublicKey(data.slice(8, 40));
      const amount = Number(data.readBigUInt64LE(104)) / LAMPORTS_PER_SOL;
      const createdAt = Number(data.readBigInt64LE(112));
      const statusByte = data[121];

      const statusMap: Record<number, EscrowStatus> = {
        0: 'active',
        1: 'disputed',
        2: 'resolved',
        3: 'released',
        4: 'refunded',
      };

      const status = statusMap[statusByte] ?? 'unknown';

      return {
        status,
        amount,
        provider: user.toBase58(),
        agent: this.wallet.publicKey.toBase58(),
        createdAt: createdAt * 1000,
        expiresAt: (createdAt + 7 * 24 * 60 * 60) * 1000,
      };
    } catch (err) {
      console.error('[Escrow] Failed to check status:', err);
      return null;
    }
  }

  async verifyFunded(escrowAddress: string): Promise<boolean> {
    const state = await this.checkStatus(escrowAddress);
    return state !== null && state.status === 'active';
  }
}

export async function createEscrowClient(config: {
  rpcUrl: string;
  privateKey: string;
  programId: string;
  treasuryAddress?: string;
}): Promise<EscrowClient> {
  if (!config.rpcUrl) {
    throw new Error('RPC URL is required');
  }
  if (!config.privateKey) {
    throw new Error('Private key is required');
  }
  if (!config.programId || !BASE58_REGEX.test(config.programId)) {
    throw new Error('Valid program ID is required');
  }
  if (config.treasuryAddress && !BASE58_REGEX.test(config.treasuryAddress)) {
    throw new Error('Invalid treasury address');
  }

  const connection = new Connection(config.rpcUrl, 'confirmed');

  let secretKey: Uint8Array;
  try {
    secretKey = bs58.decode(config.privateKey);
  } catch {
    throw new Error('Invalid private key format');
  }

  if (secretKey.length !== 64) {
    throw new Error('Invalid private key length');
  }

  const wallet = Keypair.fromSecretKey(secretKey);
  const programId = new PublicKey(config.programId);

  return new EscrowClient(connection, wallet, programId, config.treasuryAddress);
}
