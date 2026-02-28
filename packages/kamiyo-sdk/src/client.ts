/**
 * Kamiyo Client - Main entry point for the SDK.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { BN, Wallet } from "@coral-xyz/anchor";
import {
  KAMIYO_PROGRAM_ID,
  AgentIdentity,
  Agreement,
  OracleRegistry,
  OracleConfig,
  EntityReputation,
  ProtocolConfig,
  BlacklistRegistry,
  CreateAgentParams,
  CreateAgreementParams,
  InitializeOracleRegistryParams,
  AgentType,
  PoCHActionCheck,
  PoCHChallenge,
  PoCHChallengeRequest,
  PoCHGateDecision,
  PoCHXContributionInput,
  PoCHXContributionPublished,
  PoCHOracleRound,
  PoCHOracleCommitInput,
  PoCHOracleRevealInput,
  PoCHOpenDisputeInput,
  PoCHOpenDisputeResponse,
  PoCHPublished,
  PoCHProofSubmission,
  PoCHXReferralClaimInput,
  PoCHXReferralClaimResponse,
  PoCHXReferralCreateInput,
  PoCHXReferralCreateResponse,
  PoCHRollbackInput,
  PoCHRollbackReceipt,
  PoCHRolloutStageInput,
  PoCHRolloutStatus,
  PoCHResolveDisputeInput,
  PoCHResolveDisputeResponse,
  PoCHStatus,
  PoCHSubmissionReceipt,
  PoCHContributionInput,
} from "./types";
import { DISCRIMINATORS } from "./discriminators";

function isUuid36(value: string): boolean {
  if (value.length !== 36) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      if (c !== 45) return false;
      continue;
    }
    const isDigit = c >= 48 && c <= 57;
    const isLowerHex = c >= 97 && c <= 102;
    const isUpperHex = c >= 65 && c <= 70;
    if (!isDigit && !isLowerHex && !isUpperHex) return false;
  }
  return true;
}

export interface KamiyoClientConfig {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;
  apiBaseUrl?: string;
  apiAdminSecret?: string;
}

/**
 * Kamiyo Client - Interact with the Kamiyo protocol
 */
export class KamiyoClient {
  public readonly connection: Connection;
  public readonly wallet: Wallet;
  public readonly programId: PublicKey;
  private readonly apiBaseUrl?: string;
  private readonly apiAdminSecret?: string;

  constructor(config: KamiyoClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId ?? KAMIYO_PROGRAM_ID;
    this.apiBaseUrl = config.apiBaseUrl;
    this.apiAdminSecret = config.apiAdminSecret;
  }

  private getApiBaseUrl(): string {
    const raw = this.apiBaseUrl || process.env.KAMIYO_API_URL || "http://localhost:3001";
    return raw.endsWith("/") ? raw.slice(0, -1) : raw;
  }

  private async postJson<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const fetchImpl = (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
    if (!fetchImpl) {
      throw new Error("Global fetch is unavailable in this runtime");
    }

    const response = await fetchImpl(`${this.getApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API request failed (${response.status}): ${text || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private getAdminHeaders(overrideSecret?: string): Record<string, string> {
    const secret = overrideSecret
      || this.apiAdminSecret
      || process.env.POCH_ADMIN_SECRET
      || process.env.KAMIYO_API_ADMIN_SECRET;
    if (!secret) {
      throw new Error("PoCH admin secret is required for rollout admin endpoints");
    }
    return { authorization: `Bearer ${secret}` };
  }

  private async getJson<T>(path: string): Promise<T> {
    const fetchImpl = (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
    if (!fetchImpl) {
      throw new Error("Global fetch is unavailable in this runtime");
    }

    const response = await fetchImpl(`${this.getApiBaseUrl()}${path}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API request failed (${response.status}): ${text || response.statusText}`);
    }
    return response.json() as Promise<T>;
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
   * Derive the treasury PDA
   */
  getTreasuryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      this.programId
    );
  }

  /**
   * Alias for getTreasuryPDA for backward compatibility
   */
  getFeeVaultPDA(): [PublicKey, number] {
    return this.getTreasuryPDA();
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

  /**
   * Derive the launch record PDA for an agent and mint
   */
  getLaunchRecordPDA(agent: PublicKey, mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("launch"), agent.toBuffer(), mint.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive the launch rate limit PDA for an agent
   */
  getLaunchRateLimitPDA(agent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("launch_rate"), agent.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive the trader session PDA for an agent and Elfa session ID
   */
  getTraderSessionPDA(
    agent: PublicKey,
    elfaSessionId: string
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("trader_session"),
        agent.toBuffer(),
        Buffer.from(elfaSessionId),
      ],
      this.programId
    );
  }

  /**
   * Derive the trade escrow PDA for a session and trade ID
   */
  getTradeEscrowPDA(
    session: PublicKey,
    tradeId: string
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("trade_escrow"), session.toBuffer(), Buffer.from(tradeId)],
      this.programId
    );
  }

  getPoCHSubmissionPDA(owner: PublicKey, chain: "solana" | "base"): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("poch_submission"), owner.toBuffer(), Buffer.from(chain)],
      this.programId
    );
  }

  getPoCHStatusPDA(owner: PublicKey, chain: "solana" | "base"): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("poch_status"), owner.toBuffer(), Buffer.from(chain)],
      this.programId
    );
  }

  getPoCHCommitmentPDA(owner: PublicKey, chain: "solana" | "base"): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("poch_commitment"), owner.toBuffer(), Buffer.from(chain)],
      this.programId
    );
  }

  getPoCHPenaltyPDA(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("poch_penalty"), owner.toBuffer()],
      this.programId
    );
  }

  // ========================================================================
  // PoCH API
  // ========================================================================

  async publishPoCHContribution(
    input: PoCHContributionInput
  ): Promise<PoCHPublished> {
    return this.postJson<PoCHPublished>("/api/poch/contributions", input);
  }

  async submitPoCHXContribution(
    input: PoCHXContributionInput
  ): Promise<PoCHXContributionPublished> {
    return this.postJson<PoCHXContributionPublished>("/api/poch/x/contributions", input);
  }

  async createPoCHXReferralInvite(
    input: PoCHXReferralCreateInput
  ): Promise<PoCHXReferralCreateResponse> {
    return this.postJson<PoCHXReferralCreateResponse>("/api/poch/x/referrals/create", input);
  }

  async claimPoCHXReferralInvite(
    input: PoCHXReferralClaimInput
  ): Promise<PoCHXReferralClaimResponse> {
    return this.postJson<PoCHXReferralClaimResponse>("/api/poch/x/referrals/claim", input);
  }

  async requestPoCHChallenge(
    input: PoCHChallengeRequest
  ): Promise<PoCHChallenge> {
    return this.postJson<PoCHChallenge>("/api/poch/challenges", input);
  }

  async submitPoCHProof(
    input: PoCHProofSubmission
  ): Promise<PoCHSubmissionReceipt> {
    return this.postJson<PoCHSubmissionReceipt>("/api/poch/proofs", input);
  }

  async submitPoCHOracleCommit(
    input: PoCHOracleCommitInput
  ): Promise<{ accepted: boolean; challengeId: string; oracleId: string; weight: number }> {
    return this.postJson<{ accepted: boolean; challengeId: string; oracleId: string; weight: number }>(
      "/api/poch/oracle/commit",
      input
    );
  }

  async submitPoCHOracleReveal(
    input: PoCHOracleRevealInput
  ): Promise<{
    accepted: boolean;
    finalized: boolean;
    acceptedDecision?: boolean;
    finalizeReason?: string;
    oracleRoundId?: string;
  }> {
    return this.postJson<{
      accepted: boolean;
      finalized: boolean;
      acceptedDecision?: boolean;
      finalizeReason?: string;
      oracleRoundId?: string;
    }>("/api/poch/oracle/reveal", input);
  }

  async getPoCHOracleRound(challengeId: string): Promise<PoCHOracleRound> {
    return this.getJson<PoCHOracleRound>(`/api/poch/oracle/round/${encodeURIComponent(challengeId)}`);
  }

  async openPoCHDispute(input: PoCHOpenDisputeInput): Promise<PoCHOpenDisputeResponse> {
    return this.postJson<PoCHOpenDisputeResponse>("/api/poch/disputes", input);
  }

  async resolvePoCHDispute(
    disputeId: number,
    input: PoCHResolveDisputeInput
  ): Promise<PoCHResolveDisputeResponse> {
    return this.postJson<PoCHResolveDisputeResponse>(`/api/poch/disputes/${disputeId}/resolve`, input);
  }

  async getPoCHStatus(input: {
    identity: string;
    chain: "solana" | "base";
  }): Promise<PoCHStatus> {
    const identity = encodeURIComponent(input.identity);
    const chain = encodeURIComponent(input.chain);
    return this.getJson<PoCHStatus>(`/api/poch/status/${identity}?chain=${chain}`);
  }

  async verifyPoCHForAction(
    input: PoCHActionCheck
  ): Promise<PoCHGateDecision> {
    return this.postJson<PoCHGateDecision>("/api/poch/verify-action", input);
  }

  async getPoCHRolloutStatus(): Promise<PoCHRolloutStatus> {
    return this.getJson<PoCHRolloutStatus>("/api/poch/rollout/status");
  }

  async setPoCHRolloutStage(
    input: PoCHRolloutStageInput,
    adminSecret?: string
  ): Promise<PoCHRolloutStatus> {
    return this.postJson<PoCHRolloutStatus>(
      "/api/poch/rollout/stage",
      input,
      this.getAdminHeaders(adminSecret)
    );
  }

  async triggerPoCHRollback(
    input: PoCHRollbackInput,
    adminSecret?: string
  ): Promise<PoCHRollbackReceipt> {
    return this.postJson<PoCHRollbackReceipt>(
      "/api/poch/rollout/rollback",
      input,
      this.getAdminHeaders(adminSecret)
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

    const nameBytes = Buffer.from(params.name);
    const data = Buffer.concat([
      DISCRIMINATORS.createAgent,
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
   * Build initialize reputation instruction
   */
  buildInitReputationInstruction(
    payer: PublicKey,
    entity: PublicKey = payer
  ): TransactionInstruction {
    const [reputationPDA] = this.getReputationPDA(entity);

    return new TransactionInstruction({
      keys: [
        { pubkey: reputationPDA, isSigner: false, isWritable: true },
        { pubkey: entity, isSigner: false, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.initReputation,
    });
  }

  /**
   * Build create agreement instruction
   */
  buildCreateAgreementInstruction(
    agent: PublicKey,
    params: CreateAgreementParams
  ): TransactionInstruction {
    if (params.tokenMint) {
      throw new Error(
        "SPL-token escrow path is not yet supported by buildCreateAgreementInstruction; omit tokenMint for SOL escrow."
      );
    }

    const [agreementPDA] = this.getAgreementPDA(agent, params.transactionId);
    const [protocolConfigPDA] = this.getProtocolConfigPDA();
    const [feeVaultPDA] = this.getFeeVaultPDA();

    const transactionIdBytes = Buffer.from(params.transactionId);
    const data = Buffer.concat([
      DISCRIMINATORS.initializeEscrow,
      params.amount.toArrayLike(Buffer, "le", 8),
      params.timeLockSeconds.toArrayLike(Buffer, "le", 8),
      Buffer.from([transactionIdBytes.length, 0, 0, 0]),
      transactionIdBytes,
      Buffer.from([params.tokenMint ? 1 : 0]), // use_spl_token
    ]);

    const keys = [
      { pubkey: protocolConfigPDA, isSigner: false, isWritable: false },
      { pubkey: feeVaultPDA, isSigner: false, isWritable: true },
      { pubkey: agreementPDA, isSigner: false, isWritable: true },
      { pubkey: agent, isSigner: true, isWritable: true },
      { pubkey: params.provider, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: this.programId, isSigner: false, isWritable: false }, // token_mint (optional)
      { pubkey: this.programId, isSigner: false, isWritable: true },  // escrow_token_account (optional)
      { pubkey: this.programId, isSigner: false, isWritable: true },  // agent_token_account (optional)
      { pubkey: this.programId, isSigner: false, isWritable: false }, // token_program (optional)
      { pubkey: this.programId, isSigner: false, isWritable: false }, // associated_token_program (optional)
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
    const [protocolConfigPDA] = this.getProtocolConfigPDA();

    return new TransactionInstruction({
      keys: [
        { pubkey: protocolConfigPDA, isSigner: false, isWritable: false },
        { pubkey: agreementPDA, isSigner: false, isWritable: true },
        { pubkey: agent, isSigner: true, isWritable: true },
        { pubkey: provider, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.programId, isSigner: false, isWritable: true },  // escrow_token_account (optional)
        { pubkey: this.programId, isSigner: false, isWritable: true },  // api_token_account (optional)
        { pubkey: this.programId, isSigner: false, isWritable: false }, // token_program (optional)
      ],
      programId: this.programId,
      data: DISCRIMINATORS.releaseFunds,
    });
  }

  /**
   * Build initialize oracle registry instruction
   */
  buildInitializeOracleRegistryInstruction(
    admin: PublicKey,
    params: InitializeOracleRegistryParams
  ): TransactionInstruction {
    const [oracleRegistryPDA] = this.getOracleRegistryPDA();

    const data = Buffer.concat([
      DISCRIMINATORS.initializeOracleRegistry,
      Buffer.from([params.minConsensus]),
      Buffer.from([params.maxScoreDeviation]),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: oracleRegistryPDA, isSigner: false, isWritable: true },
        { pubkey: admin, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
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

    return new TransactionInstruction({
      keys: [
        { pubkey: protocolConfigPDA, isSigner: false, isWritable: false },
        { pubkey: agreementPDA, isSigner: false, isWritable: true },
        { pubkey: reputationPDA, isSigner: false, isWritable: true },
        { pubkey: agent, isSigner: true, isWritable: true },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.markDisputed,
    });
  }

  /**
   * Build deactivate agent instruction (closes PDA, returns stake + rent)
   */
  buildDeactivateAgentInstruction(owner: PublicKey): TransactionInstruction {
    const [agentPDA] = this.getAgentPDA(owner);

    return new TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.deactivateAgent,
    });
  }

  /**
   * Build create trusted launch instruction
   */
  buildCreateTrustedLaunchInstruction(
    owner: PublicKey,
    params: {
      mint: PublicKey;
      fundryCoinId: string;
      configType: string;
      escrowAmount: BN;
      migrationTargetSol: BN;
      creatorAllocationBps: number;
    }
  ): TransactionInstruction {
    if (!isUuid36(params.fundryCoinId)) {
      throw new Error("fundryCoinId must be a 36-char UUID");
    }

    if (!params.configType || params.configType.length > 16) {
      throw new Error("configType is required and must be <= 16 chars");
    }

    if (
      !Number.isInteger(params.creatorAllocationBps) ||
      params.creatorAllocationBps < 0 ||
      params.creatorAllocationBps > 10_000
    ) {
      throw new Error("creatorAllocationBps must be an integer between 0 and 10000");
    }

    const [agentPDA] = this.getAgentPDA(owner);
    const [protocolConfigPDA] = this.getProtocolConfigPDA();
    const [feeVaultPDA] = this.getFeeVaultPDA();
    const [launchRecordPDA] = this.getLaunchRecordPDA(agentPDA, params.mint);
    const [launchRateLimitPDA] = this.getLaunchRateLimitPDA(agentPDA);

    const coinIdBytes = Buffer.from(params.fundryCoinId);
    const configTypeBytes = Buffer.from(params.configType);
    const coinIdLen = Buffer.alloc(4);
    coinIdLen.writeUInt32LE(coinIdBytes.length, 0);
    const configTypeLen = Buffer.alloc(4);
    configTypeLen.writeUInt32LE(configTypeBytes.length, 0);
    const data = Buffer.concat([
      DISCRIMINATORS.createTrustedLaunch,
      coinIdLen,
      coinIdBytes,
      configTypeLen,
      configTypeBytes,
      params.escrowAmount.toArrayLike(Buffer, "le", 8),
      params.migrationTargetSol.toArrayLike(Buffer, "le", 8),
      new BN(params.creatorAllocationBps).toArrayLike(Buffer, "le", 2),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: protocolConfigPDA, isSigner: false, isWritable: false },
        { pubkey: feeVaultPDA, isSigner: false, isWritable: true },
        { pubkey: agentPDA, isSigner: false, isWritable: false },
        { pubkey: launchRecordPDA, isSigner: false, isWritable: true },
        { pubkey: launchRateLimitPDA, isSigner: false, isWritable: true },
        { pubkey: params.mint, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });
  }

  /**
   * Create a trusted launch on-chain
   */
  async createTrustedLaunch(params: {
    mint: PublicKey;
    fundryCoinId: string;
    configType: string;
    escrowAmount: BN;
    migrationTargetSol: BN;
    creatorAllocationBps: number;
  }): Promise<string> {
    const instruction = this.buildCreateTrustedLaunchInstruction(
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

  // ========================================================================
  // Trusted Trader Instructions (Elfa × Hyperliquid)
  // ========================================================================

  /**
   * Build create trader session instruction
   */
  buildCreateTraderSessionInstruction(
    owner: PublicKey,
    params: { elfaSessionId: string }
  ): TransactionInstruction {
    const [agentPDA] = this.getAgentPDA(owner);
    const [protocolConfigPDA] = this.getProtocolConfigPDA();
    const [sessionPDA] = this.getTraderSessionPDA(
      agentPDA,
      params.elfaSessionId
    );

    const sessionIdBytes = Buffer.from(params.elfaSessionId);
    const data = Buffer.concat([
      DISCRIMINATORS.createTraderSession,
      Buffer.from([sessionIdBytes.length, 0, 0, 0]),
      sessionIdBytes,
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: protocolConfigPDA, isSigner: false, isWritable: false },
        { pubkey: agentPDA, isSigner: false, isWritable: false },
        { pubkey: sessionPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      programId: this.programId,
      data,
    });
  }

  /**
   * Create a trader session on-chain
   */
  async createTraderSession(params: {
    elfaSessionId: string;
  }): Promise<string> {
    const instruction = this.buildCreateTraderSessionInstruction(
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
   * Build create trade escrow instruction
   */
  buildCreateTradeEscrowInstruction(
    trader: PublicKey,
    params: {
      sessionPda: PublicKey;
      elfaSessionId: string;
      agentPda: PublicKey;
      tradeId: string;
      collateralUsdc: BN;
      timeLock: BN;
    }
  ): TransactionInstruction {
    const [protocolConfigPDA] = this.getProtocolConfigPDA();
    const [tradeEscrowPDA] = this.getTradeEscrowPDA(
      params.sessionPda,
      params.tradeId
    );

    const tradeIdBytes = Buffer.from(params.tradeId);
    const data = Buffer.concat([
      DISCRIMINATORS.createTradeEscrow,
      Buffer.from([tradeIdBytes.length, 0, 0, 0]),
      tradeIdBytes,
      params.collateralUsdc.toArrayLike(Buffer, "le", 8),
      params.timeLock.toArrayLike(Buffer, "le", 8),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: protocolConfigPDA, isSigner: false, isWritable: false },
        { pubkey: params.sessionPda, isSigner: false, isWritable: true },
        { pubkey: tradeEscrowPDA, isSigner: false, isWritable: true },
        { pubkey: trader, isSigner: true, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      programId: this.programId,
      data,
    });
  }

  /**
   * Create a trade escrow on-chain
   */
  async createTradeEscrow(params: {
    sessionPda: PublicKey;
    elfaSessionId: string;
    agentPda: PublicKey;
    tradeId: string;
    collateralUsdc: BN;
    timeLock: BN;
  }): Promise<string> {
    const instruction = this.buildCreateTradeEscrowInstruction(
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
   * Build close trader session instruction
   */
  buildCloseTraderSessionInstruction(
    owner: PublicKey,
    params: {
      sessionPda: PublicKey;
      elfaSessionId: string;
      agentPda: PublicKey;
    }
  ): TransactionInstruction {
    return new TransactionInstruction({
      keys: [
        { pubkey: params.sessionPda, isSigner: false, isWritable: true },
        { pubkey: params.agentPda, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.closeTraderSession,
    });
  }

  /**
   * Close a trader session on-chain
   */
  async closeTraderSession(params: {
    sessionPda: PublicKey;
    elfaSessionId: string;
    agentPda: PublicKey;
  }): Promise<string> {
    const instruction = this.buildCloseTraderSessionInstruction(
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
   * Initialize reputation account for an entity
   */
  async initReputation(entity: PublicKey = this.wallet.publicKey): Promise<string> {
    const instruction = this.buildInitReputationInstruction(
      this.wallet.publicKey,
      entity
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

  /**
   * Initialize oracle registry (admin only, one-time setup)
   */
  async initializeOracleRegistry(
    params: InitializeOracleRegistryParams
  ): Promise<string> {
    const instruction = this.buildInitializeOracleRegistryInstruction(
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
      oracleCommitments: [],
      tokenMint: null,
      escrowTokenAccount: null,
      tokenDecimals: 9,
      disputedAt: null,
      commitPhaseEndsAt: null,
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

    // Deserialize oracles vector
    const oraclesLen = data.readUInt32LE(offset);
    offset += 4;

    const oracles: OracleConfig[] = [];
    for (let i = 0; i < oraclesLen; i++) {
      const pubkey = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      const oracleType = data[offset];
      offset += 1;
      const weight = data.readUInt16LE(offset);
      offset += 2;
      const stakeAmount = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
      const violationCount = data[offset];
      offset += 1;
      const totalRewards = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
      const disputesParticipated = data.readUInt32LE(offset);
      offset += 4;
      const consensusVotes = data.readUInt32LE(offset);
      offset += 4;
      const registeredAt = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
      const withdrawalRequestedAt = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
      const status = data[offset];
      offset += 1;

      oracles.push({
        pubkey,
        oracleType,
        weight,
        stakeAmount,
        violationCount,
        totalRewards,
        disputesParticipated,
        consensusVotes,
        registeredAt,
        withdrawalRequestedAt,
        status,
      });
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
    offset += 1;

    const publicRegistration = data[offset] === 1;
    offset += 1;

    const totalStake = new BN(data.slice(offset, offset + 8), "le");

    return {
      admin,
      oracles,
      minConsensus,
      maxScoreDeviation,
      createdAt,
      updatedAt,
      bump,
      publicRegistration,
      totalStake,
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
