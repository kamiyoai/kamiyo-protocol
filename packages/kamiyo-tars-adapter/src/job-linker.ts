import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  TARS_PROGRAM_ID,
  LinkedPayment,
  TarsJobRecord,
  TarsFeedbackRecord,
  TarsAgentAccount,
} from './types';

const AGENT_SEED = Buffer.from('agent');
const JOB_SEED = Buffer.from('job');
const FEEDBACK_SEED = Buffer.from('feedback');

export function deriveAgentPda(walletAddress: PublicKey, programId = TARS_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([AGENT_SEED, walletAddress.toBuffer()], programId);
}

export function deriveJobPda(paymentTx: PublicKey, programId = TARS_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([JOB_SEED, paymentTx.toBuffer()], programId);
}

export function deriveFeedbackPda(jobRecord: PublicKey, programId = TARS_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([FEEDBACK_SEED, jobRecord.toBuffer()], programId);
}

export interface JobEscrowLinkerConfig {
  connection: Connection;
  tarsProgramId?: PublicKey;
}

export class JobEscrowLinker {
  private connection: Connection;
  private tarsProgramId: PublicKey;
  private linkedPayments: Map<string, LinkedPayment> = new Map();

  constructor(config: JobEscrowLinkerConfig) {
    this.connection = config.connection;
    this.tarsProgramId = config.tarsProgramId || TARS_PROGRAM_ID;
  }

  linkJobToEscrow(kamiyoEscrowPda: PublicKey, tarsJobPda: PublicKey, paymentAmount: number): void {
    const link: LinkedPayment = {
      kamiyoEscrowPda,
      tarsJobPda,
      paymentAmount,
      linkedAt: Date.now(),
    };
    this.linkedPayments.set(kamiyoEscrowPda.toBase58(), link);
    this.linkedPayments.set(tarsJobPda.toBase58(), link);
  }

  getLinkByEscrow(kamiyoEscrowPda: PublicKey): LinkedPayment | undefined {
    return this.linkedPayments.get(kamiyoEscrowPda.toBase58());
  }

  getLinkByJob(tarsJobPda: PublicKey): LinkedPayment | undefined {
    return this.linkedPayments.get(tarsJobPda.toBase58());
  }

  async fetchTarsAgent(walletAddress: PublicKey): Promise<TarsAgentAccount | null> {
    const [agentPda] = deriveAgentPda(walletAddress, this.tarsProgramId);
    const accountInfo = await this.connection.getAccountInfo(agentPda);
    if (!accountInfo) return null;

    return this.parseAgentAccount(accountInfo.data);
  }

  async fetchTarsJob(jobPda: PublicKey): Promise<TarsJobRecord | null> {
    const accountInfo = await this.connection.getAccountInfo(jobPda);
    if (!accountInfo) return null;

    return this.parseJobRecord(accountInfo.data);
  }

  async fetchTarsFeedback(jobPda: PublicKey): Promise<TarsFeedbackRecord | null> {
    const [feedbackPda] = deriveFeedbackPda(jobPda, this.tarsProgramId);
    const accountInfo = await this.connection.getAccountInfo(feedbackPda);
    if (!accountInfo) return null;

    return this.parseFeedbackRecord(accountInfo.data);
  }

  private parseAgentAccount(data: Buffer): TarsAgentAccount {
    const discriminator = data.slice(0, 8);
    let offset = 8;

    const wallet = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const metadataUriLen = data.readUInt32LE(offset);
    offset += 4;
    const metadataUri = data.slice(offset, offset + metadataUriLen).toString('utf8');
    offset += metadataUriLen;

    const createdAt = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const active = data.readUInt8(offset) === 1;
    offset += 1;

    const autoCreated = data.readUInt8(offset) === 1;
    offset += 1;

    const totalWeightedRating = new BN(data.slice(offset, offset + 16), 'le');
    offset += 16;

    const totalWeight = new BN(data.slice(offset, offset + 16), 'le');
    offset += 16;

    const avgRating = data.readFloatLE(offset);
    offset += 4;

    const lastUpdate = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const jobCount = data.readUInt32LE(offset);
    offset += 4;

    const feedbackCount = data.readUInt32LE(offset);

    return {
      wallet,
      metadataUri,
      createdAt,
      active,
      autoCreated,
      totalWeightedRating,
      totalWeight,
      avgRating,
      lastUpdate,
      jobCount,
      feedbackCount,
    };
  }

  private parseJobRecord(data: Buffer): TarsJobRecord {
    let offset = 8;

    const clientWallet = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const agentWallet = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const paymentAmount = data.readUInt32LE(offset);
    offset += 4;

    const createdAt = new BN(data.slice(offset, offset + 8), 'le');

    return {
      clientWallet,
      agentWallet,
      paymentAmount,
      createdAt,
    };
  }

  private parseFeedbackRecord(data: Buffer): TarsFeedbackRecord {
    let offset = 8;

    const jobId = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const rating = data.readUInt8(offset);
    offset += 1;

    const hasCommentUri = data.readUInt8(offset) === 1;
    offset += 1;

    let commentUri: string | null = null;
    if (hasCommentUri) {
      const commentUriLen = data.readUInt32LE(offset);
      offset += 4;
      commentUri = data.slice(offset, offset + commentUriLen).toString('utf8');
      offset += commentUriLen;
    }

    const timestamp = new BN(data.slice(offset, offset + 8), 'le');

    return {
      jobId,
      rating,
      commentUri,
      timestamp,
    };
  }

  getAllLinkedPayments(): LinkedPayment[] {
    const seen = new Set<string>();
    const payments: LinkedPayment[] = [];

    for (const link of this.linkedPayments.values()) {
      const key = `${link.kamiyoEscrowPda.toBase58()}-${link.tarsJobPda.toBase58()}`;
      if (!seen.has(key)) {
        seen.add(key);
        payments.push(link);
      }
    }

    return payments;
  }

  clearLinks(): void {
    this.linkedPayments.clear();
  }
}

export function createJobEscrowLinker(config: JobEscrowLinkerConfig): JobEscrowLinker {
  return new JobEscrowLinker(config);
}
