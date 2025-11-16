/**
 * x402Resolve Escrow Client
 * High-level SDK for interacting with the escrow program
 */

import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, Connection, Transaction } from '@solana/web3.js';
import IDL from '../types/x402_escrow.json';

type X402Escrow = any; // Type will be inferred from IDL

export interface EscrowConfig {
  programId: PublicKey;
  connection: Connection;
  wallet: anchor.Wallet;
}

export interface CreateEscrowParams {
  amount: anchor.BN;
  timeLock: anchor.BN;
  transactionId: string;
  apiPublicKey: PublicKey;
}

export interface EscrowAccount {
  agent: PublicKey;
  api: PublicKey;
  amount: anchor.BN;
  status: any;
  createdAt: anchor.BN;
  expiresAt: anchor.BN;
  transactionId: string;
  bump: number;
  qualityScore?: number;
  refundPercentage?: number;
}

export class EscrowClient {
  private program: Program<X402Escrow>;
  private provider: AnchorProvider;

  constructor(config: EscrowConfig, idl: Idl) {
    this.provider = new AnchorProvider(
      config.connection,
      config.wallet,
      AnchorProvider.defaultOptions()
    );
    this.program = new Program(idl as X402Escrow, this.provider);
    // Note: programId is derived from IDL, or we can override if needed
  }

  /**
   * Derive escrow PDA from transaction ID
   */
  deriveEscrowAddress(transactionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), Buffer.from(transactionId)],
      this.program.programId
    );
  }

  /**
   * Derive reputation PDA from entity address
   */
  deriveReputationAddress(entity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('reputation'), entity.toBuffer()],
      this.program.programId
    );
  }

  /**
   * Create a new escrow
   */
  async createEscrow(params: CreateEscrowParams): Promise<string> {
    this.validateCreateEscrowParams(params);

    const [escrowPda] = this.deriveEscrowAddress(params.transactionId);

    const tx: string = await (this.program.methods as any)
      .initializeEscrow(params.amount, params.timeLock, params.transactionId)
      .accounts({
        escrow: escrowPda,
        agent: this.provider.wallet.publicKey,
        api: params.apiPublicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  private validateCreateEscrowParams(params: CreateEscrowParams): void {
    if (!params.transactionId || params.transactionId.trim().length === 0) {
      throw new Error('Transaction ID is required');
    }

    if (!params.apiPublicKey) {
      throw new Error('API public key is required');
    }

    if (!params.amount || params.amount.isNeg() || params.amount.isZero()) {
      throw new Error('Amount must be a positive number');
    }

    if (!params.timeLock || params.timeLock.isNeg() || params.timeLock.isZero()) {
      throw new Error('Time lock must be a positive number');
    }
  }

  /**
   * Release funds to API (happy path)
   */
  async releaseFunds(transactionId: string): Promise<string> {
    if (!transactionId || transactionId.trim().length === 0) {
      throw new Error('Transaction ID is required');
    }

    const [escrowPda] = this.deriveEscrowAddress(transactionId);
    const escrow = await this.getEscrow(transactionId);

    if (!escrow) {
      throw new Error(`Escrow not found for transaction: ${transactionId}`);
    }

    const tx: string = await (this.program.methods as any)
      .releaseFunds()
      .accounts({
        escrow: escrowPda,
        agent: this.provider.wallet.publicKey,
        api: escrow.api,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Mark escrow as disputed
   */
  async markDisputed(transactionId: string): Promise<string> {
    if (!transactionId || transactionId.trim().length === 0) {
      throw new Error('Transaction ID is required');
    }

    const [escrowPda] = this.deriveEscrowAddress(transactionId);

    const tx: string = await (this.program.methods as any)
      .markDisputed()
      .accounts({
        escrow: escrowPda,
        agent: this.provider.wallet.publicKey,
      })
      .rpc();

    return tx;
  }

  /**
   * Resolve dispute with verifier signature (Python verifier)
   */
  async resolveDispute(
    transactionId: string,
    qualityScore: number,
    refundPercentage: number,
    signature: number[],
    verifierPublicKey: PublicKey
  ): Promise<string> {
    const [escrowPda] = this.deriveEscrowAddress(transactionId);
    const escrow = await this.getEscrow(transactionId);

    // Need to derive reputation PDAs
    const [agentReputation] = this.deriveReputationAddress(escrow.agent);
    const [apiReputation] = this.deriveReputationAddress(escrow.api);

    const tx: string = await (this.program.methods as any)
      .resolveDispute(qualityScore, refundPercentage, signature)
      .accounts({
        escrow: escrowPda,
        agent: escrow.agent,
        api: escrow.api,
        verifier: verifierPublicKey,
        instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        agentReputation: agentReputation,
        apiReputation: apiReputation,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Resolve dispute with Switchboard On-Demand oracle
   *
   * Uses decentralized oracle network for trustless quality assessment
   */
  async resolveDisputeSwitchboard(
    transactionId: string,
    qualityScore: number,
    refundPercentage: number,
    switchboardAttestation: PublicKey
  ): Promise<string> {
    const [escrowPda] = this.deriveEscrowAddress(transactionId);
    const escrow = await this.getEscrow(transactionId);

    // Derive reputation PDAs
    const [agentReputation] = this.deriveReputationAddress(escrow.agent);
    const [apiReputation] = this.deriveReputationAddress(escrow.api);

    const tx: string = await (this.program.methods as any)
      .resolveDisputeSwitchboard(qualityScore, refundPercentage)
      .accounts({
        escrow: escrowPda,
        agent: escrow.agent,
        api: escrow.api,
        switchboardFunction: switchboardAttestation,
        agentReputation: agentReputation,
        apiReputation: apiReputation,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Get escrow account data
   */
  async getEscrow(transactionId: string): Promise<EscrowAccount> {
    const [escrowPda] = this.deriveEscrowAddress(transactionId);
    return await (this.program.account as any).escrow.fetch(escrowPda);
  }

  /**
   * Check if escrow exists
   */
  async escrowExists(transactionId: string): Promise<boolean> {
    try {
      await this.getEscrow(transactionId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get escrow status
   */
  async getStatus(transactionId: string): Promise<string> {
    const escrow = await this.getEscrow(transactionId);
    const status = escrow.status;

    if ('active' in status) return 'Active';
    if ('released' in status) return 'Released';
    if ('disputed' in status) return 'Disputed';
    if ('resolved' in status) return 'Resolved';

    return 'Unknown';
  }

  /**
   * Check if time lock has expired
   */
  async isExpired(transactionId: string): Promise<boolean> {
    const escrow = await this.getEscrow(transactionId);
    const now = Math.floor(Date.now() / 1000);
    return now >= escrow.expiresAt.toNumber();
  }

  /**
   * Get time remaining until expiration
   */
  async getTimeRemaining(transactionId: string): Promise<number> {
    const escrow = await this.getEscrow(transactionId);
    const now = Math.floor(Date.now() / 1000);
    const remaining = escrow.expiresAt.toNumber() - now;
    return Math.max(0, remaining);
  }

  /**
   * Subscribe to escrow events
   */
  subscribeToEvents(
    callbacks: {
      onInitialized?: (event: any) => void;
      onDisputed?: (event: any) => void;
      onResolved?: (event: any) => void;
      onReleased?: (event: any) => void;
    }
  ): number[] {
    const listeners: number[] = [];

    if (callbacks.onInitialized) {
      listeners.push(
        this.program.addEventListener('EscrowInitialized', callbacks.onInitialized)
      );
    }

    if (callbacks.onDisputed) {
      listeners.push(
        this.program.addEventListener('DisputeMarked', callbacks.onDisputed)
      );
    }

    if (callbacks.onResolved) {
      listeners.push(
        this.program.addEventListener('DisputeResolved', callbacks.onResolved)
      );
    }

    if (callbacks.onReleased) {
      listeners.push(
        this.program.addEventListener('FundsReleased', callbacks.onReleased)
      );
    }

    return listeners;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribeFromEvents(listenerIds: number[]): void {
    listenerIds.forEach((id) => {
      this.program.removeEventListener(id);
    });
  }

  /**
   * Get all escrows for an agent
   */
  async getAgentEscrows(agentPublicKey: PublicKey): Promise<EscrowAccount[]> {
    const escrows = await (this.program.account as any).escrow.all([
      {
        memcmp: {
          offset: 8, // Discriminator
          bytes: agentPublicKey.toBase58(),
        },
      },
    ]);

    return escrows.map((e: any) => e.account as EscrowAccount);
  }

  /**
   * Get program address
   */
  getProgramId(): PublicKey {
    return this.program.programId;
  }

  /**
   * Get provider
   */
  getProvider(): AnchorProvider {
    return this.provider;
  }
}

/**
 * Validation utilities
 */
export class EscrowValidator {
  static readonly MIN_AMOUNT = 1_000_000; // 0.001 SOL
  static readonly MAX_AMOUNT = 1_000_000_000_000; // 1000 SOL
  static readonly MIN_TIME_LOCK = 3600; // 1 hour
  static readonly MAX_TIME_LOCK = 2_592_000; // 30 days
  static readonly MAX_TRANSACTION_ID_LENGTH = 64;

  /**
   * Validate escrow amount
   */
  static validateAmount(amount: number): { valid: boolean; error?: string } {
    if (amount < this.MIN_AMOUNT) {
      return {
        valid: false,
        error: `Amount must be at least ${this.MIN_AMOUNT / 1_000_000_000} SOL`,
      };
    }

    if (amount > this.MAX_AMOUNT) {
      return {
        valid: false,
        error: `Amount cannot exceed ${this.MAX_AMOUNT / 1_000_000_000} SOL`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate time lock
   */
  static validateTimeLock(timeLock: number): { valid: boolean; error?: string } {
    if (timeLock < this.MIN_TIME_LOCK) {
      return {
        valid: false,
        error: `Time lock must be at least ${this.MIN_TIME_LOCK / 3600} hours`,
      };
    }

    if (timeLock > this.MAX_TIME_LOCK) {
      return {
        valid: false,
        error: `Time lock cannot exceed ${this.MAX_TIME_LOCK / 86400} days`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate transaction ID
   */
  static validateTransactionId(txId: string): { valid: boolean; error?: string } {
    if (!txId || txId.length === 0) {
      return { valid: false, error: 'Transaction ID cannot be empty' };
    }

    if (txId.length > this.MAX_TRANSACTION_ID_LENGTH) {
      return {
        valid: false,
        error: `Transaction ID cannot exceed ${this.MAX_TRANSACTION_ID_LENGTH} characters`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate quality score
   */
  static validateQualityScore(score: number): { valid: boolean; error?: string } {
    if (score < 0 || score > 100) {
      return { valid: false, error: 'Quality score must be between 0 and 100' };
    }

    return { valid: true };
  }

  /**
   * Validate refund percentage
   */
  static validateRefundPercentage(percentage: number): { valid: boolean; error?: string } {
    if (percentage < 0 || percentage > 100) {
      return { valid: false, error: 'Refund percentage must be between 0 and 100' };
    }

    return { valid: true };
  }

  /**
   * Validate all create escrow parameters
   */
  static validateCreateParams(params: CreateEscrowParams): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    const amountCheck = this.validateAmount(params.amount.toNumber());
    if (!amountCheck.valid) errors.push(amountCheck.error!);

    const timeLockCheck = this.validateTimeLock(params.timeLock.toNumber());
    if (!timeLockCheck.valid) errors.push(timeLockCheck.error!);

    const txIdCheck = this.validateTransactionId(params.transactionId);
    if (!txIdCheck.valid) errors.push(txIdCheck.error!);

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Utility functions
 */
export class EscrowUtils {
  /**
   * Convert SOL to lamports
   */
  static solToLamports(sol: number): anchor.BN {
    return new anchor.BN(sol * 1_000_000_000);
  }

  /**
   * Convert lamports to SOL
   */
  static lamportsToSol(lamports: anchor.BN): number {
    return lamports.toNumber() / 1_000_000_000;
  }

  /**
   * Convert seconds to hours
   */
  static secondsToHours(seconds: number): number {
    return seconds / 3600;
  }

  /**
   * Convert hours to seconds
   */
  static hoursToSeconds(hours: number): anchor.BN {
    return new anchor.BN(hours * 3600);
  }

  /**
   * Format timestamp
   */
  static formatTimestamp(timestamp: anchor.BN): string {
    return new Date(timestamp.toNumber() * 1000).toISOString();
  }

  /**
   * Calculate refund amounts
   */
  static calculateRefund(amount: anchor.BN, refundPercentage: number): {
    refundAmount: anchor.BN;
    paymentAmount: anchor.BN;
  } {
    const refundAmount = amount.muln(refundPercentage).divn(100);
    const paymentAmount = amount.sub(refundAmount);

    return { refundAmount, paymentAmount };
  }

  /**
   * Generate unique transaction ID
   */
  static generateTransactionId(prefix: string = 'tx'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Get Explorer URL
   */
  static getExplorerUrl(
    signature: string,
    cluster: 'mainnet-beta' | 'devnet' | 'testnet' = 'devnet'
  ): string {
    return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
  }
}
