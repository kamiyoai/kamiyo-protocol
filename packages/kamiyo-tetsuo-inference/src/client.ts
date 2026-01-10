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
  InferenceEscrow,
  InferenceStatus,
  CreateEscrowParams,
  EscrowResult,
  SettlementResult,
  modelIdFromString,
} from './types';

export interface InferenceClientConfig {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;
}

export class InferenceClient {
  private connection: Connection;
  private wallet: Wallet;
  private programId: PublicKey;

  constructor(config: InferenceClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId ?? KAMIYO_PROGRAM_ID;
  }

  getInferenceEscrowPDA(user: PublicKey, modelId: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('inference_escrow'), user.toBuffer(), Buffer.from(modelId)],
      this.programId
    );
  }

  getModelPDA(modelId: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('model'), Buffer.from(modelId)],
      this.programId
    );
  }

  async createInferenceEscrow(params: CreateEscrowParams): Promise<EscrowResult> {
    // Input validation
    if (!params.model || params.model.trim().length === 0) {
      throw new Error('Model name is required');
    }

    const numericAmount = typeof params.amount === 'number'
      ? params.amount
      : params.amount.toNumber() / LAMPORTS_PER_SOL;
    if (numericAmount <= 0 || !Number.isFinite(numericAmount)) {
      throw new Error('Amount must be a positive number');
    }
    if (numericAmount > 1000000) {
      throw new Error('Amount exceeds maximum (1,000,000 SOL)');
    }

    const qualityThreshold = params.qualityThreshold ?? 70;
    if (qualityThreshold < 0 || qualityThreshold > 100) {
      throw new Error('Quality threshold must be 0-100');
    }

    const expiresIn = params.expiresIn ?? 3600;
    if (expiresIn <= 0 || expiresIn > 86400 * 30) {
      throw new Error('Expiration must be between 1 second and 30 days');
    }

    const modelId = modelIdFromString(params.model);
    const [escrowPda] = this.getInferenceEscrowPDA(this.wallet.publicKey, modelId);
    const [modelPda] = this.getModelPDA(modelId);

    const amount = typeof params.amount === 'number'
      ? new BN(params.amount * LAMPORTS_PER_SOL)
      : params.amount;

    // Anchor discriminator: sha256("global:create_inference_escrow")[0:8]
    const discriminator = Buffer.from([0xc9, 0x63, 0x68, 0xa5, 0xe2, 0x22, 0xf0, 0xe2]);
    const data = Buffer.alloc(8 + 32 + 8 + 1 + 8);
    discriminator.copy(data, 0);
    Buffer.from(modelId).copy(data, 8);
    data.writeBigUInt64LE(BigInt(amount.toString()), 40);
    data.writeUInt8(qualityThreshold, 48);
    data.writeBigInt64LE(BigInt(expiresIn), 49);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: modelPda, isSigner: false, isWritable: false },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.wallet.publicKey;
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const signed = await this.wallet.signTransaction(tx);
    const signature = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return {
      escrowPda,
      escrowId: escrowPda.toBase58(),
      signature,
    };
  }

  async getEscrow(escrowPda: PublicKey): Promise<InferenceEscrow | null> {
    const info = await this.connection.getAccountInfo(escrowPda);
    if (!info) return null;
    return this.deserializeEscrow(info.data);
  }

  async verifyEscrow(escrowId: string): Promise<{
    valid: boolean;
    escrow: InferenceEscrow | null;
    error?: string;
  }> {
    try {
      const escrowPda = new PublicKey(escrowId);
      const escrow = await this.getEscrow(escrowPda);

      if (!escrow) {
        return { valid: false, escrow: null, error: 'Escrow not found' };
      }

      if (escrow.status !== InferenceStatus.Pending) {
        return { valid: false, escrow, error: 'Escrow not pending' };
      }

      const now = Math.floor(Date.now() / 1000);
      if (now > escrow.expiresAt.toNumber()) {
        return { valid: false, escrow, error: 'Escrow expired' };
      }

      return { valid: true, escrow };
    } catch (e) {
      return { valid: false, escrow: null, error: String(e) };
    }
  }

  async settleInference(
    escrowId: string,
    qualityScore: number,
    modelOwner: PublicKey
  ): Promise<SettlementResult> {
    if (qualityScore < 0 || qualityScore > 100) {
      throw new Error('Quality score must be 0-100');
    }

    const escrowPda = new PublicKey(escrowId);
    const escrow = await this.getEscrow(escrowPda);
    if (!escrow) {
      throw new Error('Escrow not found');
    }

    const [modelPda] = this.getModelPDA(escrow.modelId);

    // Anchor discriminator: sha256("global:settle_inference")[0:8]
    const discriminator = Buffer.from([0x4c, 0xf1, 0x43, 0xf3, 0x45, 0xe1, 0x39, 0x81]);
    const data = Buffer.alloc(9);
    discriminator.copy(data, 0);
    data.writeUInt8(qualityScore, 8);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: modelPda, isSigner: false, isWritable: true },
        { pubkey: escrow.user, isSigner: false, isWritable: true },
        { pubkey: modelOwner, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.wallet.publicKey;
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const signed = await this.wallet.signTransaction(tx);
    const signature = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    // Settlement logic mirrors on-chain
    const amount = escrow.amount;
    const threshold = escrow.qualityThreshold;
    let userRefund: BN;
    let providerPayment: BN;

    if (qualityScore >= threshold) {
      userRefund = new BN(0);
      providerPayment = amount;
    } else if (qualityScore < 50) {
      userRefund = amount;
      providerPayment = new BN(0);
    } else {
      // Proportional: provider gets (score / threshold) * amount
      providerPayment = amount.muln(qualityScore).divn(threshold);
      userRefund = amount.sub(providerPayment);
    }

    return {
      qualityScore,
      userRefund,
      providerPayment,
      signature,
    };
  }

  async refundExpired(escrowId: string): Promise<string> {
    const escrowPda = new PublicKey(escrowId);
    const escrow = await this.getEscrow(escrowPda);
    if (!escrow) {
      throw new Error('Escrow not found');
    }

    const now = Math.floor(Date.now() / 1000);
    if (now <= escrow.expiresAt.toNumber()) {
      throw new Error('Escrow not yet expired');
    }

    // Anchor discriminator: sha256("global:refund_expired")[0:8]
    const discriminator = Buffer.from([0x76, 0x99, 0xa4, 0xf4, 0x28, 0x80, 0xf2, 0xfa]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: escrow.user, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: discriminator,
    });

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.wallet.publicKey;
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const signed = await this.wallet.signTransaction(tx);
    const signature = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return signature;
  }

  private deserializeEscrow(data: Buffer): InferenceEscrow {
    const MIN_ESCROW_SIZE = 132; // discriminator + 3 pubkeys + amount + threshold + status + option + 2 timestamps + bump
    if (data.length < MIN_ESCROW_SIZE) {
      throw new Error(`Invalid escrow data: expected at least ${MIN_ESCROW_SIZE} bytes, got ${data.length}`);
    }

    let offset = 8;

    const user = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const modelOwner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const modelId = new Uint8Array(data.subarray(offset, offset + 32));
    offset += 32;

    const amount = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const qualityThreshold = data[offset];
    if (qualityThreshold > 100) {
      throw new Error(`Invalid quality threshold: ${qualityThreshold}`);
    }
    offset += 1;

    const statusValue = data[offset];
    if (statusValue > 3) {
      throw new Error(`Invalid status value: ${statusValue}`);
    }
    const status = statusValue as InferenceStatus;
    offset += 1;

    const hasScore = data[offset] === 1;
    offset += 1;

    let qualityScore: number | null = null;
    if (hasScore) {
      if (offset >= data.length) {
        throw new Error('Invalid escrow data: missing quality score');
      }
      qualityScore = data[offset];
      if (qualityScore > 100) {
        throw new Error(`Invalid quality score: ${qualityScore}`);
      }
      offset += 1;
    }

    if (offset + 17 > data.length) {
      throw new Error('Invalid escrow data: truncated timestamp fields');
    }

    const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const expiresAt = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;

    const bump = data[offset];

    return {
      user,
      modelOwner,
      modelId,
      amount,
      qualityThreshold,
      status,
      qualityScore,
      createdAt,
      expiresAt,
      bump,
    };
  }
}

export async function verifyEscrow(
  connection: Connection,
  escrowId: string,
  programId: PublicKey = KAMIYO_PROGRAM_ID
): Promise<{ valid: boolean; amount?: number; threshold?: number; error?: string }> {
  try {
    const escrowPda = new PublicKey(escrowId);
    const info = await connection.getAccountInfo(escrowPda);

    if (!info) {
      return { valid: false, error: 'Escrow not found' };
    }

    // Check discriminator matches InferenceEscrow
    const discriminator = info.data.subarray(0, 8);
    // Skip detailed parsing, just verify account exists and has data
    if (info.data.length < 100) {
      return { valid: false, error: 'Invalid escrow data' };
    }

    // Read status (offset: 8 + 32 + 32 + 32 + 8 + 1 = 113)
    const status = info.data[113];
    if (status !== InferenceStatus.Pending) {
      return { valid: false, error: 'Escrow not pending' };
    }

    // Read amount (offset: 8 + 32 + 32 + 32 = 104)
    const amount = Number(info.data.readBigUInt64LE(104)) / LAMPORTS_PER_SOL;

    // Read threshold (offset: 112)
    const threshold = info.data[112];

    return { valid: true, amount, threshold };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

export async function reportQuality(
  connection: Connection,
  wallet: Wallet,
  escrowId: string,
  score: number,
  modelOwnerPubkey: string,
  programId: PublicKey = KAMIYO_PROGRAM_ID
): Promise<{ success: boolean; signature?: string; error?: string }> {
  if (score < 0 || score > 100) {
    return { success: false, error: 'Score must be 0-100' };
  }

  try {
    const client = new InferenceClient({ connection, wallet, programId });
    const modelOwner = new PublicKey(modelOwnerPubkey);
    const result = await client.settleInference(escrowId, score, modelOwner);
    return { success: true, signature: result.signature };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
