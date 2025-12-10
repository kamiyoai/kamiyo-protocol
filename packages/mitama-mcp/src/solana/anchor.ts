import { AnchorProvider, BN, Program, Wallet, Idl, utils } from '@coral-xyz/anchor';
import {  Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { PDADeriver } from './pdas.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as borsh from 'borsh';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load IDL dynamically and convert discriminators to Buffers
const idlPath = path.join(__dirname, '../idl/naori_escrow.json');
const idlContent = fs.readFileSync(idlPath, 'utf-8');
const rawIdl = JSON.parse(idlContent);

// Convert discriminator arrays to Buffers for Anchor v0.30+
function convertDiscriminators(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertDiscriminators);
  } else if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'discriminator' && Array.isArray(value)) {
        result[key] = Buffer.from(value as number[]);
      } else {
        result[key] = convertDiscriminators(value);
      }
    }
    return result;
  }
  return obj;
}

const idl = convertDiscriminators(rawIdl);

// Instruction discriminators (sha256 hash of "global:instruction_name")
const INSTRUCTION_DISCRIMINATORS = {
  initializeEscrow: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]),
  releaseFunds: Buffer.from([228, 229, 200, 177, 109, 146, 126, 217]),
  markDisputed: Buffer.from([89, 70, 152, 79, 226, 36, 217, 220]),
  initReputation: Buffer.from([171, 196, 186, 130, 154, 13, 170, 157]),
};

// Solana system program IDs
const INSTRUCTIONS_SYSVAR = new PublicKey('Sysvar1nstructions1111111111111111111111111');

/**
 * X402Escrow program types (auto-generated from IDL)
 */
export type X402EscrowProgram = Program;

export interface EscrowAccount {
  agent: PublicKey;
  api: PublicKey;
  amount: bigint;
  status: { active: {} } | { released: {} } | { disputed: {} } | { resolved: {} };
  createdAt: bigint;
  expiresAt: bigint;
  transactionId: string;
  bump: number;
  qualityScore: number | null;
  refundPercentage: number | null;
}

export interface EntityReputationAccount {
  entity: PublicKey;
  entityType: { agent: {} } | { provider: {} };
  totalTransactions: bigint;
  disputesFiled: bigint;
  disputesWon: bigint;
  disputesPartial: bigint;
  disputesLost: bigint;
  averageQualityReceived: number;
  reputationScore: number;
  createdAt: bigint;
  lastUpdated: bigint;
  bump: number;
}

/**
 * Wrapper for Naori Anchor program
 * Provides type-safe methods for all program instructions
 */
export class X402Program {
  public program: X402EscrowProgram;
  public pda: PDADeriver;
  private wallet: Keypair;

  constructor(connection: Connection, wallet: Keypair, programId: PublicKey) {
    this.wallet = wallet;

    // Create Anchor provider
    const anchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: any) => {
        tx.sign([wallet]);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        txs.forEach((tx) => tx.sign([wallet]));
        return txs;
      },
      payer: wallet,
    } as any;

    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: 'confirmed',
    });

    // Initialize program with provider, then manually set programId
    this.program = new Program(idl as Idl, provider);
    // Override programId since IDL contains address
    Object.defineProperty(this.program, 'programId', {
      value: programId,
      writable: false,
    });

    this.pda = new PDADeriver(programId);
  }

  /**
   * Initialize a new escrow
   *
   * @param params - Escrow parameters
   * @returns Transaction signature and escrow PDA
   */
  async initializeEscrow(params: {
    api: PublicKey;
    amount: number; // Amount in lamports
    timeLock: number; // Time lock in seconds
    transactionId: string;
  }): Promise<{ signature: string; escrowPDA: PublicKey }> {
    const [escrowPDA] = this.pda.deriveEscrowPDA(params.transactionId);

    const tx = await this.program.methods
      .initializeEscrow(BigInt(params.amount), BigInt(params.timeLock), params.transactionId)
      .accounts({
        escrow: escrowPDA,
        agent: this.wallet.publicKey,
        api: params.api,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      signature: tx,
      escrowPDA,
    };
  }

  /**
   * Release funds to API (happy path - no dispute)
   *
   * @param transactionId - Transaction ID of the escrow
   * @returns Transaction signature
   */
  async releaseFunds(transactionId: string): Promise<string> {
    const [escrowPDA] = this.pda.deriveEscrowPDA(transactionId);
    const escrow = await this.getEscrowAccount(escrowPDA);

    const tx = await this.program.methods
      .releaseFunds()
      .accounts({
        escrow: escrowPDA,
        agent: this.wallet.publicKey,
        api: escrow.api,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Mark escrow as disputed
   *
   * @param transactionId - Transaction ID of the escrow
   * @returns Transaction signature
   */
  async markDisputed(transactionId: string): Promise<string> {
    const [escrowPDA] = this.pda.deriveEscrowPDA(transactionId);
    const [reputationPDA] = this.pda.deriveReputationPDA(this.wallet.publicKey);

    const tx = await this.program.methods
      .markDisputed()
      .accounts({
        escrow: escrowPDA,
        reputation: reputationPDA,
        agent: this.wallet.publicKey,
      })
      .rpc();

    return tx;
  }

  /**
   * Resolve dispute with verifier oracle signature
   *
   * @param params - Dispute resolution parameters
   * @returns Transaction signature
   */
  async resolveDispute(params: {
    transactionId: string;
    qualityScore: number;
    refundPercentage: number;
    signature: Buffer; // Ed25519 signature (64 bytes)
    verifier: PublicKey;
  }): Promise<string> {
    const [escrowPDA] = this.pda.deriveEscrowPDA(params.transactionId);
    const escrow = await this.getEscrowAccount(escrowPDA);

    const [agentReputationPDA] = this.pda.deriveReputationPDA(escrow.agent);
    const [apiReputationPDA] = this.pda.deriveReputationPDA(escrow.api);

    // Convert Buffer to array for Anchor
    const signatureArray = Array.from(params.signature);

    const tx = await this.program.methods
      .resolveDispute(params.qualityScore, params.refundPercentage, signatureArray as any)
      .accounts({
        escrow: escrowPDA,
        agent: escrow.agent,
        api: escrow.api,
        verifier: params.verifier,
        instructionsSysvar: INSTRUCTIONS_SYSVAR,
        agentReputation: agentReputationPDA,
        apiReputation: apiReputationPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Initialize reputation account for an entity
   *
   * @param entity - Entity public key (defaults to wallet)
   * @returns Transaction signature and reputation PDA
   */
  async initReputation(entity?: PublicKey): Promise<{ signature: string; reputationPDA: PublicKey }> {
    const entityPubkey = entity || this.wallet.publicKey;
    const [reputationPDA] = this.pda.deriveReputationPDA(entityPubkey);

    const tx = await this.program.methods
      .initReputation()
      .accounts({
        reputation: reputationPDA,
        entity: entityPubkey,
        payer: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      signature: tx,
      reputationPDA,
    };
  }

  /**
   * Fetch escrow account data
   *
   * @param escrowPDA - Escrow PDA address
   * @returns Escrow account data
   */
  async getEscrowAccount(escrowPDA: PublicKey): Promise<EscrowAccount> {
    const accountData = await this.program.account['escrow'].fetch(escrowPDA);
    return accountData as any;
  }

  /**
   * Fetch reputation account data
   *
   * @param reputationPDA - Reputation PDA address
   * @returns Reputation account data
   */
  async getReputationAccount(reputationPDA: PublicKey): Promise<EntityReputationAccount> {
    const accountData = await this.program.account['entityReputation'].fetch(reputationPDA);
    return accountData as any;
  }

  /**
   * Check if escrow account exists
   *
   * @param transactionId - Transaction ID
   * @returns True if escrow exists
   */
  async escrowExists(transactionId: string): Promise<boolean> {
    try {
      const [escrowPDA] = this.pda.deriveEscrowPDA(transactionId);
      await this.getEscrowAccount(escrowPDA);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if reputation account exists
   *
   * @param entity - Entity public key
   * @returns True if reputation exists
   */
  async reputationExists(entity: PublicKey): Promise<boolean> {
    try {
      const [reputationPDA] = this.pda.deriveReputationPDA(entity);
      await this.getReputationAccount(reputationPDA);
      return true;
    } catch {
      return false;
    }
  }
}
