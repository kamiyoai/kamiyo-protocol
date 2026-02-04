import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram, 
  Transaction,
  Connection,
  Commitment
} from "@solana/web3.js";
import { KamiyoBountyResolver } from "../target/types/kamiyo_bounty_resolver";

export interface BountyData {
  creator: PublicKey;
  bountyId: anchor.BN;
  rewardAmount: anchor.BN;
  description: string;
  deadline: anchor.BN;
  status: any;
  worker: PublicKey;
  submissionHash: number[];
  createdAt: anchor.BN;
}

export interface CreateBountyParams {
  bountyId: number;
  rewardAmount: number; // in lamports
  description: string;
  deadline: number; // unix timestamp
}

export interface SubmitWorkParams {
  bountyPda: PublicKey;
  submissionHash: number[]; // 32-byte array
  submissionUri: string;
}

export class KamiyoBountyClient {
  program: Program<KamiyoBountyResolver>;
  provider: AnchorProvider;

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId?: PublicKey,
    commitment?: Commitment
  ) {
    this.provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: commitment || "confirmed" }
    );
    
    // You'll need to update this with the actual deployed program ID
    const pid = programId || new PublicKey("BountyRes1ver1111111111111111111111111111111");
    
    // Load the program from IDL (this assumes IDL is available)
    this.program = anchor.workspace.KamiyoBountyResolver as Program<KamiyoBountyResolver>;
  }

  /**
   * Derive the PDA for a bounty
   */
  getBountyPda(creator: PublicKey, bountyId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("bounty"),
        creator.toBuffer(),
        new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8),
      ],
      this.program.programId
    );
  }

  /**
   * Create a new bounty
   */
  async createBounty(params: CreateBountyParams): Promise<string> {
    const creator = this.provider.wallet.publicKey;
    const [bountyPda] = this.getBountyPda(creator, params.bountyId);

    const tx = await this.program.methods
      .createBounty(
        new anchor.BN(params.bountyId),
        new anchor.BN(params.rewardAmount),
        params.description,
        new anchor.BN(params.deadline)
      )
      .accounts({
        bounty: bountyPda,
        creator: creator,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Submit work for a bounty
   */
  async submitWork(params: SubmitWorkParams): Promise<string> {
    const worker = this.provider.wallet.publicKey;

    const tx = await this.program.methods
      .submitWork(params.submissionHash, params.submissionUri)
      .accounts({
        bounty: params.bountyPda,
        worker: worker,
      })
      .rpc();

    return tx;
  }

  /**
   * Resolve a bounty (accept or reject work)
   */
  async resolveBounty(
    bountyPda: PublicKey,
    workerPubkey: PublicKey,
    acceptWork: boolean
  ): Promise<string> {
    const creator = this.provider.wallet.publicKey;

    const tx = await this.program.methods
      .resolveBounty(acceptWork)
      .accounts({
        bounty: bountyPda,
        creator: creator,
        worker: workerPubkey,
      })
      .rpc();

    return tx;
  }

  /**
   * Fetch bounty data
   */
  async getBounty(bountyPda: PublicKey): Promise<BountyData> {
    return await this.program.account.bounty.fetch(bountyPda);
  }

  /**
   * Get all bounties created by a specific creator
   */
  async getBountiesByCreator(creator: PublicKey): Promise<{ pubkey: PublicKey; account: BountyData }[]> {
    return await this.program.account.bounty.all([
      {
        memcmp: {
          offset: 8, // Discriminator is 8 bytes
          bytes: creator.toBase58(),
        },
      },
    ]);
  }

  /**
   * Get all open bounties
   */
  async getOpenBounties(): Promise<{ pubkey: PublicKey; account: BountyData }[]> {
    const allBounties = await this.program.account.bounty.all();
    return allBounties.filter(bounty => 
      Object.keys(bounty.account.status)[0] === 'open'
    );
  }

  /**
   * Create submission hash from content
   */
  static createSubmissionHash(content: string): number[] {
    const hash = anchor.utils.sha256.hash(content);
    return Array.from(hash);
  }

  /**
   * Listen to bounty events
   */
  addEventListener(
    eventName: "BountyCreated" | "WorkSubmitted" | "BountyResolved",
    callback: (event: any, slot: number) => void
  ): number {
    return this.program.addEventListener(eventName, callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listenerId: number): Promise<void> {
    return this.program.removeEventListener(listenerId);
  }
}

// Helper function to create a client instance
export function createBountyClient(
  connection: Connection,
  wallet: Wallet,
  programId?: PublicKey
): KamiyoBountyClient {
  return new KamiyoBountyClient(connection, wallet, programId);
}

// Export types for external use
export { KamiyoBountyResolver };
export type BountyStatus = "open" | "workSubmitted" | "completed" | "rejected";