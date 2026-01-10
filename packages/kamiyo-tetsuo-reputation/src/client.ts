import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { BN, Wallet } from '@coral-xyz/anchor';
import {
  KAMIYO_PROGRAM_ID,
  ModelReputation,
  ModelStats,
  UserReputation,
  modelIdFromString,
} from './types';

export interface ReputationClientConfig {
  connection: Connection;
  wallet?: Wallet;
  programId?: PublicKey;
}

export class ReputationClient {
  private connection: Connection;
  private wallet?: Wallet;
  private programId: PublicKey;

  constructor(config: ReputationClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId ?? KAMIYO_PROGRAM_ID;
  }

  getModelPDA(modelId: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('model'), Buffer.from(modelId)],
      this.programId
    );
  }

  async getModelReputation(model: string): Promise<ModelStats | null> {
    if (!model || model.trim().length === 0) {
      throw new Error('Model name is required');
    }

    const modelId = modelIdFromString(model);
    const [modelPda] = this.getModelPDA(modelId);

    const info = await this.connection.getAccountInfo(modelPda);
    if (!info) return null;

    const rep = this.deserializeModel(info.data);
    return this.toStats(rep);
  }

  async getModelReputationByPDA(modelPda: PublicKey): Promise<ModelStats | null> {
    const info = await this.connection.getAccountInfo(modelPda);
    if (!info) return null;

    const rep = this.deserializeModel(info.data);
    return this.toStats(rep);
  }

  async meetsThreshold(model: string, threshold: number): Promise<boolean> {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be 0-100');
    }
    const stats = await this.getModelReputation(model);
    if (!stats) return false;
    return stats.successRate >= threshold;
  }

  getUserReputationPDA(user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('user_reputation'), user.toBuffer()],
      this.programId
    );
  }

  async getUserReputation(user: PublicKey): Promise<UserReputation | null> {
    const [repPda] = this.getUserReputationPDA(user);

    const info = await this.connection.getAccountInfo(repPda);
    if (!info) return null;

    return this.deserializeUser(info.data);
  }

  async registerModel(
    modelName: string,
  ): Promise<{ modelPda: PublicKey; signature: string }> {
    if (!this.wallet) {
      throw new Error('Wallet required for registerModel');
    }

    if (!modelName || modelName.trim().length === 0) {
      throw new Error('Model name is required');
    }
    if (modelName.length > 64) {
      throw new Error('Model name must be 64 characters or less');
    }

    const modelId = modelIdFromString(modelName);
    const [modelPda] = this.getModelPDA(modelId);

    // register_model discriminator
    const discriminator = Buffer.from([0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b]);
    const data = Buffer.alloc(8 + 32);
    discriminator.copy(data, 0);
    Buffer.from(modelId).copy(data, 8);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: modelPda, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.wallet.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    const signed = await this.wallet.signTransaction(tx);
    const signature = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(signature);

    return { modelPda, signature };
  }

  async updateModelStats(
    modelName: string,
    qualityScore: number,
    successful: boolean,
  ): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet required for updateModelStats');
    }

    if (!modelName || modelName.trim().length === 0) {
      throw new Error('Model name is required');
    }

    if (qualityScore < 0 || qualityScore > 100 || !Number.isInteger(qualityScore)) {
      throw new Error('Quality score must be an integer 0-100');
    }

    const modelId = modelIdFromString(modelName);
    const [modelPda] = this.getModelPDA(modelId);

    // update_model_stats discriminator
    const discriminator = Buffer.from([0x2c, 0x3d, 0x4e, 0x5f, 0x6a, 0x7b, 0x8c, 0x9d]);
    const data = Buffer.alloc(10);
    discriminator.copy(data, 0);
    data.writeUInt8(qualityScore, 8);
    data.writeUInt8(successful ? 1 : 0, 9);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: modelPda, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.wallet.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    const signed = await this.wallet.signTransaction(tx);
    const signature = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  private toStats(rep: ModelReputation): ModelStats {
    const total = rep.totalInferences.toNumber();
    const successful = rep.successfulInferences.toNumber();
    const qualitySum = rep.totalQualitySum.toNumber();

    return {
      successRate: total > 0 ? Math.floor((successful * 100) / total) : 0,
      avgQuality: total > 0 ? Math.floor(qualitySum / total) : 0,
      totalInferences: total,
      disputes: rep.disputes.toNumber(),
    };
  }

  private deserializeModel(data: Buffer): ModelReputation {
    let offset = 8;

    const modelId = new Uint8Array(data.subarray(offset, offset + 32));
    offset += 32;

    const owner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const totalInferences = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const successfulInferences = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const totalQualitySum = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const disputes = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const lastUpdated = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const bump = data[offset];

    return {
      modelId,
      owner,
      totalInferences,
      successfulInferences,
      totalQualitySum,
      disputes,
      createdAt,
      lastUpdated,
      bump,
    };
  }

  private deserializeUser(data: Buffer): UserReputation {
    let offset = 8; // Skip discriminator

    const totalSpent = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const totalInferences = data.readUInt32LE(offset);
    offset += 4;

    const successfulInferences = data.readUInt32LE(offset);
    offset += 4;

    const disputedInferences = data.readUInt32LE(offset);
    offset += 4;

    const totalQualitySum = data.readUInt32LE(offset);

    const disputeRate = totalInferences > 0
      ? Math.floor((disputedInferences * 100) / totalInferences)
      : 0;

    const avgScore = totalInferences > 0
      ? Math.floor(totalQualitySum / totalInferences)
      : 0;

    return {
      totalSpent,
      totalInferences,
      disputeRate,
      avgScore,
    };
  }
}
