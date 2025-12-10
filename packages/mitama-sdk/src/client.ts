/**
 * Mitama Client - Main entry point for SDK
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  MITAMA_PROGRAM_ID,
  AgentIdentity,
  Agreement,
  OracleRegistry,
  EntityReputation,
  CreateAgentParams,
  CreateAgreementParams,
  AgentType,
} from "./types";

export interface MitamaClientConfig {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;
}

/**
 * Mitama Client - Interact with the Mitama protocol
 */
export class MitamaClient {
  public readonly connection: Connection;
  public readonly wallet: Wallet;
  public readonly programId: PublicKey;
  private provider: AnchorProvider;

  constructor(config: MitamaClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId ?? MITAMA_PROGRAM_ID;
    this.provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: "confirmed",
    });
  }

  // ========================================================================
  // PDA Derivations
  // ========================================================================

  /**
   * Derive the agent PDA for an owner
   */
  getAgentPDA(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), owner.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive the agreement (escrow) PDA for a transaction ID
   */
  getAgreementPDA(transactionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(transactionId)],
      this.programId
    );
  }

  /**
   * Alias for getAgreementPDA for backward compatibility
   */
  deriveAgreementAddress(transactionId: string): [PublicKey, number] {
    return this.getAgreementPDA(transactionId);
  }

  /**
   * Derive the oracle registry PDA
   */
  getOracleRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_registry")],
      this.programId
    );
  }

  /**
   * Derive the reputation PDA for an entity
   */
  getReputationPDA(entity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), entity.toBuffer()],
      this.programId
    );
  }

  // ========================================================================
  // Account Fetching
  // ========================================================================

  /**
   * Fetch an agent identity account
   */
  async getAgent(agentPDA: PublicKey): Promise<AgentIdentity | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(agentPDA);
      if (!accountInfo) return null;
      // Deserialize account data (simplified - in production use IDL)
      return this.deserializeAgent(accountInfo.data);
    } catch {
      return null;
    }
  }

  /**
   * Fetch an agent by owner
   */
  async getAgentByOwner(owner: PublicKey): Promise<AgentIdentity | null> {
    const [agentPDA] = this.getAgentPDA(owner);
    return this.getAgent(agentPDA);
  }

  /**
   * Fetch an agreement (escrow) account
   */
  async getAgreement(agreementPDA: PublicKey): Promise<Agreement | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(agreementPDA);
      if (!accountInfo) return null;
      return this.deserializeAgreement(accountInfo.data);
    } catch {
      return null;
    }
  }

  /**
   * Fetch agreement by transaction ID
   */
  async getAgreementByTransactionId(
    transactionId: string
  ): Promise<Agreement | null> {
    const [agreementPDA] = this.getAgreementPDA(transactionId);
    return this.getAgreement(agreementPDA);
  }

  /**
   * Fetch entity reputation
   */
  async getReputation(entity: PublicKey): Promise<EntityReputation | null> {
    const [reputationPDA] = this.getReputationPDA(entity);
    try {
      const accountInfo = await this.connection.getAccountInfo(reputationPDA);
      if (!accountInfo) return null;
      return this.deserializeReputation(accountInfo.data);
    } catch {
      return null;
    }
  }

  /**
   * Fetch oracle registry
   */
  async getOracleRegistry(): Promise<OracleRegistry | null> {
    const [registryPDA] = this.getOracleRegistryPDA();
    try {
      const accountInfo = await this.connection.getAccountInfo(registryPDA);
      if (!accountInfo) return null;
      return this.deserializeOracleRegistry(accountInfo.data);
    } catch {
      return null;
    }
  }

  // ========================================================================
  // Instruction Builders
  // ========================================================================

  /**
   * Build create agent instruction
   */
  buildCreateAgentInstruction(
    owner: PublicKey,
    params: CreateAgentParams
  ): TransactionInstruction {
    const [agentPDA] = this.getAgentPDA(owner);

    // Build instruction data
    // Discriminator (8 bytes) + name (4 + name.length) + agent_type (1) + stake_amount (8)
    const nameBytes = Buffer.from(params.name);
    const discriminator = Buffer.from([
      0x48, 0x6c, 0x5e, 0x9e, 0x29, 0x8b, 0x91, 0x2a,
    ]); // create_agent discriminator

    const data = Buffer.concat([
      discriminator,
      Buffer.from([nameBytes.length, 0, 0, 0]), // name length (u32)
      nameBytes,
      Buffer.from([params.agentType]),
      params.stakeAmount.toArrayLike(Buffer, "le", 8),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });
  }

  /**
   * Build create agreement instruction
   */
  buildCreateAgreementInstruction(
    agent: PublicKey,
    params: CreateAgreementParams
  ): TransactionInstruction {
    const [agreementPDA] = this.getAgreementPDA(params.transactionId);

    // Build instruction data
    const discriminator = Buffer.from([
      0x3d, 0x2c, 0x1e, 0x4f, 0x5a, 0x6b, 0x7c, 0x8d,
    ]); // initialize_escrow discriminator
    const transactionIdBytes = Buffer.from(params.transactionId);

    const data = Buffer.concat([
      discriminator,
      params.amount.toArrayLike(Buffer, "le", 8),
      params.timeLockSeconds.toArrayLike(Buffer, "le", 8),
      Buffer.from([transactionIdBytes.length, 0, 0, 0]),
      transactionIdBytes,
      Buffer.from([params.tokenMint ? 1 : 0]), // use_spl_token
    ]);

    const keys = [
      { pubkey: agreementPDA, isSigner: false, isWritable: true },
      { pubkey: agent, isSigner: true, isWritable: true },
      { pubkey: params.provider, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * Build release funds instruction
   */
  buildReleaseFundsInstruction(
    agent: PublicKey,
    transactionId: string,
    provider: PublicKey
  ): TransactionInstruction {
    const [agreementPDA] = this.getAgreementPDA(transactionId);

    const discriminator = Buffer.from([
      0x8a, 0x9b, 0xac, 0xbd, 0xce, 0xdf, 0xe0, 0xf1,
    ]); // release_funds discriminator

    return new TransactionInstruction({
      keys: [
        { pubkey: agreementPDA, isSigner: false, isWritable: true },
        { pubkey: agent, isSigner: true, isWritable: true },
        { pubkey: provider, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: discriminator,
    });
  }

  /**
   * Build mark disputed instruction
   */
  buildMarkDisputedInstruction(
    agent: PublicKey,
    transactionId: string
  ): TransactionInstruction {
    const [agreementPDA] = this.getAgreementPDA(transactionId);
    const [reputationPDA] = this.getReputationPDA(agent);

    const discriminator = Buffer.from([
      0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
    ]); // mark_disputed discriminator

    return new TransactionInstruction({
      keys: [
        { pubkey: agreementPDA, isSigner: false, isWritable: true },
        { pubkey: reputationPDA, isSigner: false, isWritable: true },
        { pubkey: agent, isSigner: true, isWritable: true },
      ],
      programId: this.programId,
      data: discriminator,
    });
  }

  // ========================================================================
  // High-Level Operations
  // ========================================================================

  /**
   * Create a new agent identity
   */
  async createAgent(params: CreateAgentParams): Promise<string> {
    const instruction = this.buildCreateAgentInstruction(
      this.wallet.publicKey,
      params
    );

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = this.wallet.publicKey;
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;

    const signed = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(
      signed.serialize()
    );
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  /**
   * Create a new agreement (escrow)
   */
  async createAgreement(params: CreateAgreementParams): Promise<string> {
    const instruction = this.buildCreateAgreementInstruction(
      this.wallet.publicKey,
      params
    );

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = this.wallet.publicKey;
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;

    const signed = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(
      signed.serialize()
    );
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  /**
   * Release funds to provider (happy path)
   */
  async releaseFunds(
    transactionId: string,
    provider: PublicKey
  ): Promise<string> {
    const instruction = this.buildReleaseFundsInstruction(
      this.wallet.publicKey,
      transactionId,
      provider
    );

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = this.wallet.publicKey;
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;

    const signed = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(
      signed.serialize()
    );
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  /**
   * Mark agreement as disputed
   */
  async markDisputed(transactionId: string): Promise<string> {
    const instruction = this.buildMarkDisputedInstruction(
      this.wallet.publicKey,
      transactionId
    );

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = this.wallet.publicKey;
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;

    const signed = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(
      signed.serialize()
    );
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private deserializeAgent(data: Buffer): AgentIdentity {
    // Skip 8-byte discriminator
    let offset = 8;

    const owner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLen).toString();
    offset += nameLen;

    const agentType = data[offset] as AgentType;
    offset += 1;

    const reputation = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const stakeAmount = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const isActive = data[offset] === 1;
    offset += 1;

    const createdAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const lastActive = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const totalEscrows = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const successfulEscrows = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const disputedEscrows = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const bump = data[offset];

    return {
      owner,
      name,
      agentType,
      reputation,
      stakeAmount,
      isActive,
      createdAt,
      lastActive,
      totalEscrows,
      successfulEscrows,
      disputedEscrows,
      bump,
    };
  }

  private deserializeAgreement(data: Buffer): Agreement {
    // Simplified deserialization - in production use generated IDL types
    let offset = 8;

    const agent = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const api = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const amount = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const status = data[offset];
    offset += 1;

    const createdAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const expiresAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const transactionIdLen = data.readUInt32LE(offset);
    offset += 4;
    const transactionId = data.slice(offset, offset + transactionIdLen).toString();
    offset += transactionIdLen;

    const bump = data[offset];
    offset += 1;

    const hasQualityScore = data[offset] === 1;
    offset += 1;
    const qualityScore = hasQualityScore ? data[offset] : null;
    if (hasQualityScore) offset += 1;

    const hasRefundPercentage = data[offset] === 1;
    offset += 1;
    const refundPercentage = hasRefundPercentage ? data[offset] : null;

    return {
      agent,
      api,
      amount,
      status,
      createdAt,
      expiresAt,
      transactionId,
      bump,
      qualityScore,
      refundPercentage,
      oracleSubmissions: [],
      tokenMint: null,
      escrowTokenAccount: null,
      tokenDecimals: 9,
    };
  }

  private deserializeReputation(data: Buffer): EntityReputation {
    let offset = 8;

    const entity = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const entityType = data[offset];
    offset += 1;

    const totalTransactions = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const disputesFiled = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const disputesWon = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const disputesPartial = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const disputesLost = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const averageQualityReceived = data[offset];
    offset += 1;

    const reputationScore = data.readUInt16LE(offset);
    offset += 2;

    const createdAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const lastUpdated = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const bump = data[offset];

    return {
      entity,
      entityType,
      totalTransactions,
      disputesFiled,
      disputesWon,
      disputesPartial,
      disputesLost,
      averageQualityReceived,
      reputationScore,
      createdAt,
      lastUpdated,
      bump,
    };
  }

  private deserializeOracleRegistry(data: Buffer): OracleRegistry {
    let offset = 8;

    const admin = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // Skip oracles vector for now
    const oraclesLen = data.readUInt32LE(offset);
    offset += 4;

    const oracles = [];
    for (let i = 0; i < oraclesLen; i++) {
      const pubkey = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      const oracleType = data[offset];
      offset += 1;
      const weight = data.readUInt16LE(offset);
      offset += 2;
      oracles.push({ pubkey, oracleType, weight });
    }

    const minConsensus = data[offset];
    offset += 1;

    const maxScoreDeviation = data[offset];
    offset += 1;

    const createdAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const updatedAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const bump = data[offset];

    return {
      admin,
      oracles,
      minConsensus,
      maxScoreDeviation,
      createdAt,
      updatedAt,
      bump,
    };
  }
}
