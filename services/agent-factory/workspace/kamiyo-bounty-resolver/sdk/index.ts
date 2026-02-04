/**
 * KAMIYO Bounty Resolver SDK
 * TypeScript client for the autonomously-built bounty escrow program
 */

import { Connection, PublicKey, SystemProgram, TransactionInstruction, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, BN, Idl } from '@coral-xyz/anchor';
import * as crypto from 'crypto';

// Program ID deployed to mainnet
export const PROGRAM_ID = new PublicKey('GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF');

// IDL for the program
import idl from '../target/idl/kamiyo_bounty_resolver.json';

export interface BountyAccount {
  creator: PublicKey;
  bountyId: BN;
  rewardAmount: BN;
  description: string;
  deadline: BN;
  status: BountyStatus;
  worker: PublicKey;
  submissionHash: number[];
  createdAt: BN;
}

export enum BountyStatus {
  Open = 'Open',
  WorkSubmitted = 'WorkSubmitted',
  Completed = 'Completed',
  Rejected = 'Rejected',
}

export class BountyResolverClient {
  private program: Program;
  private connection: Connection;

  constructor(provider: AnchorProvider) {
    this.program = new Program(idl as Idl, provider);
    this.connection = provider.connection;
  }

  /**
   * Derive the PDA for a bounty account
   */
  static deriveBountyPda(creator: PublicKey, bountyId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('bounty'),
        creator.toBuffer(),
        bountyId.toArrayLike(Buffer, 'le', 8),
      ],
      PROGRAM_ID
    );
  }

  /**
   * Create a new bounty with SOL reward held in escrow
   */
  async createBounty(
    creator: Keypair,
    bountyId: BN,
    rewardAmount: BN,
    description: string,
    deadline: BN
  ): Promise<string> {
    const [bountyPda] = BountyResolverClient.deriveBountyPda(creator.publicKey, bountyId);

    const tx = await this.program.methods
      .createBounty(bountyId, rewardAmount, description, deadline)
      .accounts({
        bounty: bountyPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    return tx;
  }

  /**
   * Submit work for an open bounty
   */
  async submitWork(
    worker: Keypair,
    bountyPda: PublicKey,
    submissionContent: string | Buffer,
    submissionUri: string
  ): Promise<string> {
    // Hash the submission content
    const hash = crypto.createHash('sha256');
    hash.update(typeof submissionContent === 'string' ? Buffer.from(submissionContent) : submissionContent);
    const submissionHash = Array.from(hash.digest());

    const tx = await this.program.methods
      .submitWork(submissionHash, submissionUri)
      .accounts({
        bounty: bountyPda,
        worker: worker.publicKey,
      })
      .signers([worker])
      .rpc();

    return tx;
  }

  /**
   * Resolve a bounty by accepting or rejecting work
   */
  async resolveBounty(
    creator: Keypair,
    bountyPda: PublicKey,
    workerPubkey: PublicKey,
    acceptWork: boolean
  ): Promise<string> {
    const tx = await this.program.methods
      .resolveBounty(acceptWork)
      .accounts({
        bounty: bountyPda,
        creator: creator.publicKey,
        worker: workerPubkey,
      })
      .signers([creator])
      .rpc();

    return tx;
  }

  /**
   * Fetch a bounty account by PDA
   */
  async getBounty(bountyPda: PublicKey): Promise<BountyAccount | null> {
    try {
      const account = await this.program.account.bounty.fetch(bountyPda);
      return account as unknown as BountyAccount;
    } catch {
      return null;
    }
  }

  /**
   * Fetch all bounties created by a specific address
   */
  async getBountiesByCreator(creator: PublicKey): Promise<{ publicKey: PublicKey; account: BountyAccount }[]> {
    const accounts = await this.program.account.bounty.all([
      {
        memcmp: {
          offset: 8, // After discriminator
          bytes: creator.toBase58(),
        },
      },
    ]);
    return accounts as unknown as { publicKey: PublicKey; account: BountyAccount }[];
  }

  /**
   * Fetch all open bounties
   */
  async getOpenBounties(): Promise<{ publicKey: PublicKey; account: BountyAccount }[]> {
    const accounts = await this.program.account.bounty.all([
      {
        memcmp: {
          offset: 8 + 32 + 8 + 8 + 4 + 500 + 8, // Offset to status field
          bytes: Buffer.from([0]).toString('base64'), // Open = 0
        },
      },
    ]);
    return accounts as unknown as { publicKey: PublicKey; account: BountyAccount }[];
  }
}

// Utility functions for agents
export function lamportsToSol(lamports: BN): number {
  return lamports.toNumber() / 1e9;
}

export function solToLamports(sol: number): BN {
  return new BN(Math.floor(sol * 1e9));
}

export function createDeadline(hoursFromNow: number): BN {
  return new BN(Math.floor(Date.now() / 1000) + hoursFromNow * 3600);
}
