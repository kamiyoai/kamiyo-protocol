import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
  sendAndConfirmTransaction
} from '@solana/web3.js';

export interface VerificationResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface VerifierConfig {
  connection: Connection;
  verifierProgramId: PublicKey;
  payer: Keypair;
}

/**
 * Client for submitting Noir proofs to Solana for on-chain verification
 */
export class SolanaVerifier {
  private connection: Connection;
  private verifierProgramId: PublicKey;
  private payer: Keypair;

  constructor(config: VerifierConfig) {
    this.connection = config.connection;
    this.verifierProgramId = config.verifierProgramId;
    this.payer = config.payer;
  }

  /**
   * Submit proof to Solana verifier program
   * Proof bytes + public inputs are passed as instruction data
   */
  async verify(proofWithInputs: Uint8Array): Promise<VerificationResult> {
    try {
      const instruction = new TransactionInstruction({
        keys: [],
        programId: this.verifierProgramId,
        data: Buffer.from(proofWithInputs)
      });

      const transaction = new Transaction().add(instruction);

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer],
        { commitment: 'confirmed' }
      );

      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Verify oracle vote proof on-chain
   */
  async verifyOracleVote(
    proofData: Uint8Array,
    escrowAccount: PublicKey,
    oracleAccount: PublicKey
  ): Promise<VerificationResult> {
    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: escrowAccount, isSigner: false, isWritable: true },
          { pubkey: oracleAccount, isSigner: false, isWritable: false }
        ],
        programId: this.verifierProgramId,
        data: Buffer.from(proofData)
      });

      const transaction = new Transaction().add(instruction);

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer],
        { commitment: 'confirmed' }
      );

      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Verify SMT exclusion proof (oracle not blacklisted)
   */
  async verifyExclusion(
    proofData: Uint8Array,
    blacklistAccount: PublicKey,
    oracleAccount: PublicKey
  ): Promise<VerificationResult> {
    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: blacklistAccount, isSigner: false, isWritable: false },
          { pubkey: oracleAccount, isSigner: false, isWritable: false }
        ],
        programId: this.verifierProgramId,
        data: Buffer.from(proofData)
      });

      const transaction = new Transaction().add(instruction);

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer],
        { commitment: 'confirmed' }
      );

      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Get the current blacklist SMT root from on-chain account
   */
  async getBlacklistRoot(blacklistAccount: PublicKey): Promise<bigint> {
    const accountInfo = await this.connection.getAccountInfo(blacklistAccount);
    if (!accountInfo) {
      throw new Error('Blacklist account not found');
    }

    // First 32 bytes are the SMT root
    const rootBytes = accountInfo.data.slice(0, 32);
    return BigInt('0x' + Buffer.from(rootBytes).toString('hex'));
  }
}
