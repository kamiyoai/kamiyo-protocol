import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';
import {
  TARS_PROGRAM_ID,
  TarsAdapterConfig,
  DEFAULT_CONFIG,
  CombinedReputation,
  LinkedPayment,
  TarsRating,
  DisputeResolutionEvent,
  TarsAgentAccount,
  TarsJobRecord,
  isValidTarsRating,
} from './types';
import {
  JobEscrowLinker,
  deriveAgentPda,
  deriveJobPda,
  deriveFeedbackPda,
} from './job-linker';
import {
  ReputationSyncService,
  kamiyoToTarsRating,
  tarsToKamiyoReputation,
} from './reputation-sync';

export interface TarsBridgeConfig {
  connection: Connection;
  tarsProgramId?: PublicKey;
  kamiyoProgramId?: PublicKey;
  payer?: Keypair;
  config?: Partial<TarsAdapterConfig>;
}

export class TarsBridge {
  private connection: Connection;
  private tarsProgramId: PublicKey;
  private kamiyoProgramId: PublicKey;
  private payer?: Keypair;
  private config: TarsAdapterConfig;
  private linker: JobEscrowLinker;
  private reputationSync: ReputationSyncService;

  constructor(bridgeConfig: TarsBridgeConfig) {
    this.connection = bridgeConfig.connection;
    this.tarsProgramId = bridgeConfig.tarsProgramId || TARS_PROGRAM_ID;
    this.kamiyoProgramId = bridgeConfig.kamiyoProgramId || new PublicKey('3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr');
    this.payer = bridgeConfig.payer;
    this.config = { ...DEFAULT_CONFIG, ...bridgeConfig.config };

    this.linker = new JobEscrowLinker({
      connection: this.connection,
      tarsProgramId: this.tarsProgramId,
    });

    this.reputationSync = new ReputationSyncService({
      connection: this.connection,
      tarsProgramId: this.tarsProgramId,
      kamiyoProgramId: this.kamiyoProgramId,
      weights: this.config.reputationWeight,
    });
  }

  async linkJobToEscrow(
    kamiyoEscrowPda: PublicKey,
    tarsJobPda: PublicKey,
    paymentAmount: number
  ): Promise<void> {
    this.linker.linkJobToEscrow(kamiyoEscrowPda, tarsJobPda, paymentAmount);
  }

  getLinkByEscrow(kamiyoEscrowPda: PublicKey): LinkedPayment | undefined {
    return this.linker.getLinkByEscrow(kamiyoEscrowPda);
  }

  getLinkByJob(tarsJobPda: PublicKey): LinkedPayment | undefined {
    return this.linker.getLinkByJob(tarsJobPda);
  }

  async submitFeedbackFromDispute(
    escrowPda: PublicKey,
    qualityScore: number,
    clientWallet: Keypair,
    commentUri?: string
  ): Promise<string> {
    const link = this.linker.getLinkByEscrow(escrowPda);
    if (!link) {
      throw new Error('No linked TARS job found for this escrow');
    }

    const rating = kamiyoToTarsRating(qualityScore);
    return this.submitFeedback(link.tarsJobPda, rating, clientWallet, commentUri);
  }

  async submitFeedback(
    jobPda: PublicKey,
    rating: TarsRating,
    clientWallet: Keypair,
    commentUri?: string
  ): Promise<string> {
    if (!isValidTarsRating(rating)) {
      throw new Error(`Invalid rating: ${rating}. Must be 1-5.`);
    }

    if (commentUri && commentUri.length > 200) {
      throw new Error('Comment URI exceeds maximum length of 200 characters');
    }

    const job = await this.linker.fetchTarsJob(jobPda);
    if (!job) {
      throw new Error(`Job not found: ${jobPda.toBase58()}`);
    }

    const [feedbackPda] = deriveFeedbackPda(jobPda, this.tarsProgramId);
    const [agentPda] = deriveAgentPda(job.agentWallet, this.tarsProgramId);

    const existingFeedback = await this.connection.getAccountInfo(feedbackPda);
    if (existingFeedback) {
      throw new Error(`Feedback already submitted for job: ${jobPda.toBase58()}`);
    }

    const instruction = this.createSubmitFeedbackInstruction(
      feedbackPda,
      jobPda,
      agentPda,
      clientWallet.publicKey,
      rating,
      commentUri
    );

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = clientWallet.publicKey;

    transaction.sign(clientWallet);

    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await this.connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return signature;
  }

  private createSubmitFeedbackInstruction(
    feedbackPda: PublicKey,
    jobPda: PublicKey,
    agentPda: PublicKey,
    clientWallet: PublicKey,
    rating: number,
    commentUri?: string
  ): TransactionInstruction {
    const discriminator = Buffer.from([222, 189, 16, 203, 186, 151, 236, 188]);

    const ratingBuf = Buffer.alloc(1);
    ratingBuf.writeUInt8(rating);

    let commentUriBuf: Buffer;
    if (commentUri) {
      const uriBytes = Buffer.from(commentUri, 'utf8');
      commentUriBuf = Buffer.alloc(1 + 4 + uriBytes.length);
      commentUriBuf.writeUInt8(1, 0);
      commentUriBuf.writeUInt32LE(uriBytes.length, 1);
      uriBytes.copy(commentUriBuf, 5);
    } else {
      commentUriBuf = Buffer.alloc(1);
      commentUriBuf.writeUInt8(0, 0);
    }

    const data = Buffer.concat([discriminator, ratingBuf, commentUriBuf]);

    return new TransactionInstruction({
      keys: [
        { pubkey: feedbackPda, isSigner: false, isWritable: true },
        { pubkey: jobPda, isSigner: false, isWritable: false },
        { pubkey: agentPda, isSigner: false, isWritable: true },
        { pubkey: clientWallet, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.tarsProgramId,
      data,
    });
  }

  async getCombinedReputation(agentWallet: PublicKey): Promise<CombinedReputation> {
    return this.reputationSync.getCombinedReputation(agentWallet);
  }

  async fetchTarsAgent(walletAddress: PublicKey): Promise<TarsAgentAccount | null> {
    return this.linker.fetchTarsAgent(walletAddress);
  }

  async fetchTarsJob(jobPda: PublicKey): Promise<TarsJobRecord | null> {
    return this.linker.fetchTarsJob(jobPda);
  }

  createRegisterJobInstruction(
    jobPda: PublicKey,
    agentPda: PublicKey,
    agentWallet: PublicKey,
    clientTokenAccount: PublicKey,
    agentTokenAccount: PublicKey,
    paymentTx: PublicKey,
    clientWallet: PublicKey,
    feePayer: PublicKey,
    tokenProgram: PublicKey,
    transferInstructionIndex: number
  ): TransactionInstruction {
    const discriminator = Buffer.from([87, 213, 177, 255, 131, 17, 178, 45]);

    const indexBuf = Buffer.alloc(1);
    indexBuf.writeUInt8(transferInstructionIndex);

    const data = Buffer.concat([discriminator, indexBuf]);

    return new TransactionInstruction({
      keys: [
        { pubkey: jobPda, isSigner: false, isWritable: true },
        { pubkey: agentPda, isSigner: false, isWritable: true },
        { pubkey: agentWallet, isSigner: false, isWritable: false },
        { pubkey: clientTokenAccount, isSigner: false, isWritable: false },
        { pubkey: agentTokenAccount, isSigner: false, isWritable: false },
        { pubkey: paymentTx, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: clientWallet, isSigner: true, isWritable: false },
        { pubkey: feePayer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
      ],
      programId: this.tarsProgramId,
      data,
    });
  }

  createRegisterAgentInstruction(
    agentPda: PublicKey,
    signerWallet: PublicKey,
    metadataUri: string
  ): TransactionInstruction {
    if (metadataUri.length > 200) {
      throw new Error('Metadata URI exceeds maximum length of 200 characters');
    }

    const discriminator = Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]);

    const uriBytes = Buffer.from(metadataUri, 'utf8');
    const uriBuf = Buffer.alloc(4 + uriBytes.length);
    uriBuf.writeUInt32LE(uriBytes.length, 0);
    uriBytes.copy(uriBuf, 4);

    const data = Buffer.concat([discriminator, uriBuf]);

    return new TransactionInstruction({
      keys: [
        { pubkey: agentPda, isSigner: false, isWritable: true },
        { pubkey: signerWallet, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.tarsProgramId,
      data,
    });
  }

  async handleDisputeResolution(event: DisputeResolutionEvent, clientWallet: Keypair): Promise<string | null> {
    if (!this.config.autoSubmitFeedback) {
      return null;
    }

    const link = this.linker.getLinkByEscrow(event.escrowPda);
    if (!link) {
      return null;
    }

    if (this.config.feedbackDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.feedbackDelay));
    }

    return this.submitFeedbackFromDispute(
      event.escrowPda,
      event.qualityScore,
      clientWallet
    );
  }

  async watchAgent(agentWallet: PublicKey, onUpdate: (combined: CombinedReputation) => void): Promise<void> {
    const sync = new ReputationSyncService({
      connection: this.connection,
      tarsProgramId: this.tarsProgramId,
      kamiyoProgramId: this.kamiyoProgramId,
      weights: this.config.reputationWeight,
      onReputationUpdate: onUpdate,
    });

    await sync.watchAgent(agentWallet);
  }

  getConfig(): TarsAdapterConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<TarsAdapterConfig>): void {
    this.config = { ...this.config, ...config };
    this.reputationSync.setWeights(this.config.reputationWeight);
  }

  get programId(): PublicKey {
    return this.tarsProgramId;
  }
}

export function createTarsBridge(config: TarsBridgeConfig): TarsBridge {
  return new TarsBridge(config);
}
