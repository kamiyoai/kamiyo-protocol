/**
 * Kamiyo Client - Main entry point for SDK
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
  KAMIYO_PROGRAM_ID,
  AgentIdentity,
  Agreement,
  OracleRegistry,
  EntityReputation,
  ProtocolConfig,
  BlacklistRegistry,
  CreateAgentParams,
  CreateAgreementParams,
  UpdateProtocolConfigParams,
  AgentType,
} from "./types";

export interface KamiyoClientConfig {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;
}

/**
 * Kamiyo Client - Interact with the Kamiyo protocol
 */
export class KamiyoClient {
  public readonly connection: Connection;
  public readonly wallet: Wallet;
  public readonly programId: PublicKey;
  private provider: AnchorProvider;

  constructor(config: KamiyoClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId ?? KAMIYO_PROGRAM_ID;
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
   * Derive the agreement (escrow) PDA for an agent and transaction ID
   */
  getAgreementPDA(agent: PublicKey, transactionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), agent.toBuffer(), Buffer.from(transactionId)],
      this.programId
    );
  }

  /**
   * Alias for getAgreementPDA for backward compatibility
   */
  deriveAgreementAddress(agent: PublicKey, transactionId: string): [PublicKey, number] {
    return this.getAgreementPDA(agent, transactionId);
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

  /**
   * Derive the protocol config PDA
   */
  getProtocolConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_config")],
      this.programId
    );
  }

  /**
   * Derive the fee vault PDA
   */
  getFeeVaultPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("fee_vault")],
      this.programId
    );
  }

  /**
   * Derive the blacklist registry PDA
   */
  getBlacklistRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist_registry")],
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
    } catch (error) {
      console.error(`Failed to fetch agent at ${agentPDA.toBase58()}:`, error);
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
    } catch (error) {
      console.error(`Failed to fetch agreement at ${agreementPDA.toBase58()}:`, error);
      return null;
    }
  }

  /**
   * Fetch agreement by agent and transaction ID
   */
  async getAgreementByTransactionId(
    agent: PublicKey,
    transactionId: string
  ): Promise<Agreement | null> {
    const [agreementPDA] = this.getAgreementPDA(agent, transactionId);
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
    } catch (error) {
      console.error(`Failed to fetch reputation for ${entity.toBase58()}:`, error);
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
    } catch (error) {
      console.error("Failed to fetch oracle registry:", error);
      return null;
    }
  }

  /**
   * Fetch protocol configuration
   */
  async getProtocolConfig(): Promise<ProtocolConfig | null> {
    const [configPDA] = this.getProtocolConfigPDA();
    try {
      const accountInfo = await this.connection.getAccountInfo(configPDA);
      if (!accountInfo) return null;
      return this.deserializeProtocolConfig(accountInfo.data);
    } catch (error) {
      console.error("Failed to fetch protocol config:", error);
      return null;
    }
  }

  /**
   * Get current protocol fees
   */
  async getProtocolFees(): Promise<{
    agreementFeeBps: number;
    disputeFeeBps: number;
    disputeBaseFee: BN;
    identityFee: BN;
  } | null> {
    const config = await this.getProtocolConfig();
    if (!config) return null;
    return {
      agreementFeeBps: config.agreementFeeBps,
      disputeFeeBps: config.disputeFeeBps,
      disputeBaseFee: config.disputeBaseFee,
      identityFee: config.identityFee,
    };
  }

  /**
   * Fetch blacklist registry
   */
  async getBlacklistRegistry(): Promise<BlacklistRegistry | null> {
    const [registryPDA] = this.getBlacklistRegistryPDA();
    try {
      const accountInfo = await this.connection.getAccountInfo(registryPDA);
      if (!accountInfo) return null;
      return this.deserializeBlacklistRegistry(accountInfo.data);
    } catch (error) {
      console.error("Failed to fetch blacklist registry:", error);
      return null;
    }
  }

  /**
   * Get current blacklist root as hex string
   */
  async getBlacklistRoot(): Promise<string | null> {
    const registry = await this.getBlacklistRegistry();
    if (!registry) return null;
    return Buffer.from(registry.root).toString("hex");
  }

  /**
   * Calculate agreement fee for a given amount
   */
  async calculateAgreementFee(amount: BN): Promise<BN> {
    const config = await this.getProtocolConfig();
    if (!config) return new BN(0);
    return amount.mul(new BN(config.agreementFeeBps)).div(new BN(10000));
  }

  /**
   * Calculate dispute fee for a given amount
   */
  async calculateDisputeFee(amount: BN): Promise<BN> {
    const config = await this.getProtocolConfig();
    if (!config) return new BN(0);
    const percentageFee = amount.mul(new BN(config.disputeFeeBps)).div(new BN(10000));
    return config.disputeBaseFee.add(percentageFee);
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
    const [protocolConfigPDA] = this.getProtocolConfigPDA();
    const [feeVaultPDA] = this.getFeeVaultPDA();

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
        { pubkey: protocolConfigPDA, isSigner: false, isWritable: true },
        { pubkey: feeVaultPDA, isSigner: false, isWritable: true },
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
    const [agreementPDA] = this.getAgreementPDA(agent, params.transactionId);
    const [protocolConfigPDA] = this.getProtocolConfigPDA();
    const [feeVaultPDA] = this.getFeeVaultPDA();

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
      { pubkey: protocolConfigPDA, isSigner: false, isWritable: true },
      { pubkey: feeVaultPDA, isSigner: false, isWritable: true },
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
    const [agreementPDA] = this.getAgreementPDA(agent, transactionId);

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
    const [agreementPDA] = this.getAgreementPDA(agent, transactionId);
    const [reputationPDA] = this.getReputationPDA(agent);
    const [protocolConfigPDA] = this.getProtocolConfigPDA();
    const [feeVaultPDA] = this.getFeeVaultPDA();

    const discriminator = Buffer.from([
      0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
    ]); // mark_disputed discriminator

    return new TransactionInstruction({
      keys: [
        { pubkey: agreementPDA, isSigner: false, isWritable: true },
        { pubkey: reputationPDA, isSigner: false, isWritable: true },
        { pubkey: agent, isSigner: true, isWritable: true },
        { pubkey: protocolConfigPDA, isSigner: false, isWritable: true },
        { pubkey: feeVaultPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: discriminator,
    });
  }

  /**
   * Build deactivate agent instruction (closes PDA, returns stake + rent)
   */
  buildDeactivateAgentInstruction(owner: PublicKey): TransactionInstruction {
    const [agentPDA] = this.getAgentPDA(owner);

    // sha256("global:deactivate_agent")[0..8]
    const discriminator = Buffer.from([
      0x79, 0x64, 0x04, 0x47, 0x57, 0xd9, 0xd0, 0x8d,
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
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

  /**
   * Deactivate agent (closes PDA, returns stake + rent)
   */
  async deactivateAgent(): Promise<string> {
    const instruction = this.buildDeactivateAgentInstruction(
      this.wallet.publicKey
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
    // Minimum size: 8 (discriminator) + 32 (owner) + 4 (name len) = 44 bytes
    const MIN_AGENT_SIZE = 44;
    if (data.length < MIN_AGENT_SIZE) {
      throw new Error(`Agent data too short: ${data.length} bytes, expected at least ${MIN_AGENT_SIZE}`);
    }

    // Skip 8-byte discriminator
    let offset = 8;

    const owner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const nameLen = data.readUInt32LE(offset);
    offset += 4;

    // Validate name length before reading
    if (offset + nameLen > data.length) {
      throw new Error(`Agent name length ${nameLen} exceeds buffer bounds at offset ${offset}`);
    }
    const name = data.slice(offset, offset + nameLen).toString();
    offset += nameLen;

    // Remaining fixed fields: 1 + 8 + 8 + 1 + 8 + 8 + 8 + 8 + 8 + 1 = 59 bytes
    const REMAINING_SIZE = 59;
    if (offset + REMAINING_SIZE > data.length) {
      throw new Error(`Agent data truncated: need ${offset + REMAINING_SIZE} bytes, have ${data.length}`);
    }

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
    // Minimum size: 8 (discriminator) + 32 (agent) + 32 (api) + 8 (amount) + 1 (status) +
    // 8 (createdAt) + 8 (expiresAt) + 4 (txId len) = 101 bytes
    const MIN_AGREEMENT_SIZE = 101;
    if (data.length < MIN_AGREEMENT_SIZE) {
      throw new Error(`Agreement data too short: ${data.length} bytes, expected at least ${MIN_AGREEMENT_SIZE}`);
    }

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

    // Validate transaction ID length before reading
    if (offset + transactionIdLen > data.length) {
      throw new Error(`Transaction ID length ${transactionIdLen} exceeds buffer bounds at offset ${offset}`);
    }
    const transactionId = data.slice(offset, offset + transactionIdLen).toString();
    offset += transactionIdLen;

    // Remaining fields: bump (1) + hasQualityScore (1) + optional qualityScore (1) +
    // hasRefundPercentage (1) + optional refundPercentage (1)
    // Minimum remaining: 3 bytes (bump + hasQuality + hasRefund)
    if (offset + 3 > data.length) {
      throw new Error(`Agreement data truncated: need ${offset + 3} bytes, have ${data.length}`);
    }

    const bump = data[offset];
    offset += 1;

    const hasQualityScore = data[offset] === 1;
    offset += 1;

    let qualityScore: number | null = null;
    if (hasQualityScore) {
      if (offset >= data.length) {
        throw new Error(`Quality score missing at offset ${offset}`);
      }
      qualityScore = data[offset];
      offset += 1;
    }

    if (offset >= data.length) {
      throw new Error(`Refund percentage flag missing at offset ${offset}`);
    }
    const hasRefundPercentage = data[offset] === 1;
    offset += 1;

    let refundPercentage: number | null = null;
    if (hasRefundPercentage) {
      if (offset >= data.length) {
        throw new Error(`Refund percentage missing at offset ${offset}`);
      }
      refundPercentage = data[offset];
    }

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

  private deserializeProtocolConfig(data: Buffer): ProtocolConfig {
    let offset = 8; // Skip discriminator

    const admin = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const treasury = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const agreementFeeBps = data.readUInt16LE(offset);
    offset += 2;

    const disputeFeeBps = data.readUInt16LE(offset);
    offset += 2;

    const disputeBaseFee = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const identityFee = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const totalFeesCollected = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const isActive = data[offset] === 1;
    offset += 1;

    const createdAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const updatedAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const bump = data[offset];

    return {
      admin,
      treasury,
      agreementFeeBps,
      disputeFeeBps,
      disputeBaseFee,
      identityFee,
      totalFeesCollected,
      isActive,
      createdAt,
      updatedAt,
      bump,
    };
  }

  private deserializeBlacklistRegistry(data: Buffer): BlacklistRegistry {
    let offset = 8; // Skip discriminator

    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const root = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;

    const leafCount = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const lastUpdated = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const bump = data[offset];

    return {
      authority,
      root,
      leafCount,
      lastUpdated,
      bump,
    };
  }
}
