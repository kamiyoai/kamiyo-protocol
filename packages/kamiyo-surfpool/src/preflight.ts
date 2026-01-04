/**
 * Pre-flight Validation - Test Kamiyo operations before mainnet execution
 *
 * Validates agent creation, escrow initialization, and dispute resolution
 * in simulation before committing real funds.
 */

import {
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SurfpoolClient, SimulationResult } from "./client";

export interface PreflightResult {
  /** Whether the operation would succeed */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Warning messages (non-fatal issues) */
  warnings: string[];
  /** Simulation details */
  simulation?: SimulationResult;
  /** Estimated cost in lamports */
  estimatedCost: number;
  /** Account state changes */
  stateChanges: StateChange[];
}

export interface StateChange {
  account: PublicKey;
  field: string;
  before: unknown;
  after: unknown;
}

export interface AgentCreationParams {
  owner: PublicKey;
  name: string;
  agentType: number;
  stakeAmount: BN;
}

export interface EscrowCreationParams {
  agent: PublicKey;
  provider: PublicKey;
  amount: BN;
  timeLockSeconds: BN;
  transactionId: string;
  tokenMint?: PublicKey;
}

export interface DisputeParams {
  agent: PublicKey;
  transactionId: string;
}

export interface ReleaseParams {
  agent: PublicKey;
  transactionId: string;
  provider: PublicKey;
}

/**
 * Pre-flight validator for Kamiyo operations
 */
export class PreflightValidator {
  private surfpool: SurfpoolClient;
  private programId: PublicKey;

  constructor(surfpool: SurfpoolClient, programId: PublicKey) {
    this.surfpool = surfpool;
    this.programId = programId;
  }

  /**
   * Validate agent creation before execution
   */
  async validateAgentCreation(
    params: AgentCreationParams,
    ownerKeypair: Keypair
  ): Promise<PreflightResult> {
    const warnings: string[] = [];
    const stateChanges: StateChange[] = [];

    // Check owner balance
    const ownerBalance = await this.surfpool.getBalance(params.owner);
    const requiredBalance =
      params.stakeAmount.toNumber() + 10_000_000; // stake + rent + fees

    if (ownerBalance < requiredBalance) {
      return {
        valid: false,
        error: `Insufficient balance. Required: ${requiredBalance / LAMPORTS_PER_SOL} SOL, Available: ${ownerBalance / LAMPORTS_PER_SOL} SOL`,
        warnings,
        estimatedCost: requiredBalance,
        stateChanges,
      };
    }

    // Check stake amount
    const MIN_STAKE = 100_000_000; // 0.1 SOL
    if (params.stakeAmount.toNumber() < MIN_STAKE) {
      return {
        valid: false,
        error: `Stake amount too low. Minimum: ${MIN_STAKE / LAMPORTS_PER_SOL} SOL`,
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Check name length
    if (params.name.length === 0 || params.name.length > 32) {
      return {
        valid: false,
        error: `Invalid agent name length. Must be 1-32 characters.`,
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Check if agent already exists
    const [agentPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), params.owner.toBuffer()],
      this.programId
    );

    const existingAgent = await this.surfpool
      .getConnection()
      .getAccountInfo(agentPDA);
    if (existingAgent) {
      return {
        valid: false,
        error: "Agent already exists for this owner",
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Warnings
    if (params.stakeAmount.toNumber() < LAMPORTS_PER_SOL) {
      warnings.push(
        "Low stake amount may limit agent reputation and dispute capabilities"
      );
    }

    stateChanges.push({
      account: agentPDA,
      field: "created",
      before: null,
      after: true,
    });

    stateChanges.push({
      account: params.owner,
      field: "balance",
      before: ownerBalance,
      after: ownerBalance - params.stakeAmount.toNumber() - 5_000_000,
    });

    return {
      valid: true,
      warnings,
      estimatedCost: params.stakeAmount.toNumber() + 5_000_000,
      stateChanges,
    };
  }

  /**
   * Validate escrow creation before execution
   */
  async validateEscrowCreation(
    params: EscrowCreationParams,
    agentKeypair: Keypair
  ): Promise<PreflightResult> {
    const warnings: string[] = [];
    const stateChanges: StateChange[] = [];

    // Check agent exists
    const [agentPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), params.agent.toBuffer()],
      this.programId
    );

    const agentAccount = await this.surfpool
      .getConnection()
      .getAccountInfo(agentPDA);
    if (!agentAccount) {
      return {
        valid: false,
        error: "Agent does not exist. Create agent first.",
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Check protocol is not paused
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_config")],
      this.programId
    );
    const configAccount = await this.surfpool
      .getConnection()
      .getAccountInfo(configPDA);
    if (configAccount) {
      // Check paused flag (offset after discriminator + pubkey + bool)
      const paused = configAccount.data[8 + 32] === 1;
      if (paused) {
        return {
          valid: false,
          error: "Protocol is paused. Escrow creation disabled.",
          warnings,
          estimatedCost: 0,
          stateChanges,
        };
      }
    }

    // Check agent balance
    const agentBalance = await this.surfpool.getBalance(params.agent);
    const requiredBalance = params.amount.toNumber() + 10_000_000;

    if (agentBalance < requiredBalance) {
      return {
        valid: false,
        error: `Insufficient agent balance. Required: ${requiredBalance / LAMPORTS_PER_SOL} SOL`,
        warnings,
        estimatedCost: requiredBalance,
        stateChanges,
      };
    }

    // Validate amount
    const MIN_AMOUNT = 1_000_000; // 0.001 SOL
    const MAX_AMOUNT = 1_000_000_000_000; // 1000 SOL
    if (
      params.amount.toNumber() < MIN_AMOUNT ||
      params.amount.toNumber() > MAX_AMOUNT
    ) {
      return {
        valid: false,
        error: `Invalid amount. Must be between ${MIN_AMOUNT / LAMPORTS_PER_SOL} and ${MAX_AMOUNT / LAMPORTS_PER_SOL} SOL`,
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Validate time lock
    const MIN_LOCK = 3600; // 1 hour
    const MAX_LOCK = 2_592_000; // 30 days
    if (
      params.timeLockSeconds.toNumber() < MIN_LOCK ||
      params.timeLockSeconds.toNumber() > MAX_LOCK
    ) {
      return {
        valid: false,
        error: `Invalid time lock. Must be between 1 hour and 30 days`,
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Validate transaction ID
    if (
      params.transactionId.length === 0 ||
      params.transactionId.length > 64
    ) {
      return {
        valid: false,
        error: `Invalid transaction ID length. Must be 1-64 characters`,
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Check escrow doesn't already exist
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        params.agent.toBuffer(),
        Buffer.from(params.transactionId),
      ],
      this.programId
    );

    const existingEscrow = await this.surfpool
      .getConnection()
      .getAccountInfo(escrowPDA);
    if (existingEscrow) {
      return {
        valid: false,
        error: "Escrow with this transaction ID already exists",
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Warnings
    if (params.timeLockSeconds.toNumber() < 86400) {
      warnings.push("Short time lock may not allow sufficient time for disputes");
    }

    if (params.amount.toNumber() > 10 * LAMPORTS_PER_SOL) {
      warnings.push("Large escrow amount - ensure provider is trusted");
    }

    stateChanges.push({
      account: escrowPDA,
      field: "created",
      before: null,
      after: true,
    });

    stateChanges.push({
      account: params.agent,
      field: "balance",
      before: agentBalance,
      after: agentBalance - params.amount.toNumber(),
    });

    return {
      valid: true,
      warnings,
      estimatedCost: params.amount.toNumber() + 5_000_000,
      stateChanges,
    };
  }

  /**
   * Validate dispute marking before execution
   */
  async validateDispute(
    params: DisputeParams,
    agentKeypair: Keypair
  ): Promise<PreflightResult> {
    const warnings: string[] = [];
    const stateChanges: StateChange[] = [];

    // Check escrow exists
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        params.agent.toBuffer(),
        Buffer.from(params.transactionId),
      ],
      this.programId
    );

    const escrowAccount = await this.surfpool
      .getConnection()
      .getAccountInfo(escrowPDA);
    if (!escrowAccount) {
      return {
        valid: false,
        error: "Escrow not found",
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Check escrow status (simplified - assumes offset 8 + 32 + 32 + 8 = 80)
    const statusOffset = 8 + 32 + 32 + 8;
    const status = escrowAccount.data[statusOffset];

    if (status !== 0) {
      // 0 = Active
      return {
        valid: false,
        error: "Escrow is not in active status",
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Check expiry (simplified)
    const connection = this.surfpool.getConnection();
    const slot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(slot);

    // Read expires_at from escrow (offset = 8 + 32 + 32 + 8 + 1 + 8 = 89)
    const expiresAtOffset = 8 + 32 + 32 + 8 + 1 + 8;
    const expiresAt = escrowAccount.data.readBigInt64LE(expiresAtOffset);

    if (blockTime && BigInt(blockTime) >= expiresAt) {
      return {
        valid: false,
        error: "Dispute window has expired",
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    stateChanges.push({
      account: escrowPDA,
      field: "status",
      before: "Active",
      after: "Disputed",
    });

    return {
      valid: true,
      warnings,
      estimatedCost: 5_000_000,
      stateChanges,
    };
  }

  /**
   * Validate fund release before execution
   */
  async validateRelease(
    params: ReleaseParams,
    agentKeypair: Keypair
  ): Promise<PreflightResult> {
    const warnings: string[] = [];
    const stateChanges: StateChange[] = [];

    // Check escrow exists
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        params.agent.toBuffer(),
        Buffer.from(params.transactionId),
      ],
      this.programId
    );

    const escrowAccount = await this.surfpool
      .getConnection()
      .getAccountInfo(escrowPDA);
    if (!escrowAccount) {
      return {
        valid: false,
        error: "Escrow not found",
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Check status
    const statusOffset = 8 + 32 + 32 + 8;
    const status = escrowAccount.data[statusOffset];

    if (status !== 0) {
      return {
        valid: false,
        error: "Escrow is not in active status",
        warnings,
        estimatedCost: 0,
        stateChanges,
      };
    }

    // Read amount
    const amountOffset = 8 + 32 + 32;
    const amount = Number(escrowAccount.data.readBigUInt64LE(amountOffset));

    stateChanges.push({
      account: escrowPDA,
      field: "status",
      before: "Active",
      after: "Released",
    });

    stateChanges.push({
      account: params.provider,
      field: "balance",
      before: "current",
      after: `+${amount / LAMPORTS_PER_SOL} SOL`,
    });

    return {
      valid: true,
      warnings,
      estimatedCost: 5_000_000,
      stateChanges,
    };
  }

  /**
   * Run full pre-flight check for an escrow flow
   */
  async validateFullFlow(
    agentParams: AgentCreationParams,
    escrowParams: Omit<EscrowCreationParams, "agent">,
    agentKeypair: Keypair
  ): Promise<{
    agentCreation: PreflightResult;
    escrowCreation: PreflightResult;
    release: PreflightResult;
    totalCost: number;
    flowValid: boolean;
  }> {
    // Validate agent creation
    const agentResult = await this.validateAgentCreation(
      agentParams,
      agentKeypair
    );

    // Validate escrow creation (assuming agent exists)
    const escrowResult = await this.validateEscrowCreation(
      {
        ...escrowParams,
        agent: agentParams.owner,
      },
      agentKeypair
    );

    // Validate release
    const releaseResult = await this.validateRelease(
      {
        agent: agentParams.owner,
        transactionId: escrowParams.transactionId,
        provider: escrowParams.provider,
      },
      agentKeypair
    );

    const totalCost =
      agentResult.estimatedCost +
      escrowResult.estimatedCost +
      releaseResult.estimatedCost;

    return {
      agentCreation: agentResult,
      escrowCreation: escrowResult,
      release: releaseResult,
      totalCost,
      flowValid:
        agentResult.valid && escrowResult.valid && releaseResult.valid,
    };
  }
}
