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

export class SolanaVerifier {
  private connection: Connection;
  private verifierProgramId: PublicKey;
  private payer: Keypair;

  constructor(config: VerifierConfig) {
    this.connection = config.connection;
    this.verifierProgramId = config.verifierProgramId;
    this.payer = config.payer;
  }

  async verify(proofWithInputs: Uint8Array): Promise<VerificationResult> {
    try {
      const ix = new TransactionInstruction({
        keys: [],
        programId: this.verifierProgramId,
        data: Buffer.from(proofWithInputs)
      });

      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
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

  async verifyOracleVote(
    proofData: Uint8Array,
    escrowAccount: PublicKey,
    oracleAccount: PublicKey
  ): Promise<VerificationResult> {
    try {
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: escrowAccount, isSigner: false, isWritable: true },
          { pubkey: oracleAccount, isSigner: false, isWritable: false }
        ],
        programId: this.verifierProgramId,
        data: Buffer.from(proofData)
      });

      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
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

  async verifyExclusion(
    proofData: Uint8Array,
    blacklistAccount: PublicKey,
    oracleAccount: PublicKey
  ): Promise<VerificationResult> {
    try {
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: blacklistAccount, isSigner: false, isWritable: false },
          { pubkey: oracleAccount, isSigner: false, isWritable: false }
        ],
        programId: this.verifierProgramId,
        data: Buffer.from(proofData)
      });

      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
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

  async getBlacklistRoot(blacklistAccount: PublicKey): Promise<bigint> {
    const accountInfo = await this.connection.getAccountInfo(blacklistAccount);
    if (!accountInfo) {
      throw new Error('Blacklist account not found');
    }
    const rootBytes = accountInfo.data.slice(0, 32);
    return BigInt('0x' + Buffer.from(rootBytes).toString('hex'));
  }
}
