/**
 * Event handling for Kamiyo protocol
 */

import { PublicKey } from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";

/**
 * Agent Created Event
 */
export interface AgentCreatedEvent {
  agentPda: PublicKey;
  owner: PublicKey;
  name: string;
  agentType: number;
  stakeAmount: BN;
}

/**
 * Agent Deactivated Event
 */
export interface AgentDeactivatedEvent {
  agentPda: PublicKey;
  owner: PublicKey;
  refundedStake: BN;
}

/**
 * Agreement Initialized Event
 */
export interface AgreementInitializedEvent {
  escrow: PublicKey;
  agent: PublicKey;
  api: PublicKey;
  amount: BN;
  expiresAt: BN;
  transactionId: string;
  isToken: boolean;
  tokenMint: PublicKey | null;
  creationFee: BN;
}

/**
 * Dispute Marked Event
 */
export interface DisputeMarkedEvent {
  escrow: PublicKey;
  agent: PublicKey;
  transactionId: string;
  timestamp: BN;
}

/**
 * Dispute Resolved Event
 */
export interface DisputeResolvedEvent {
  escrow: PublicKey;
  transactionId: string;
  qualityScore: number;
  refundPercentage: number;
  refundAmount: BN;
  paymentAmount: BN;
  verifier: PublicKey;
}

/**
 * Funds Released Event
 */
export interface FundsReleasedEvent {
  escrow: PublicKey;
  transactionId: string;
  amount: BN;
  api: PublicKey;
  timestamp: BN;
}

/**
 * Oracle Registry Initialized Event
 */
export interface OracleRegistryInitializedEvent {
  registry: PublicKey;
  admin: PublicKey;
  minConsensus: number;
  maxScoreDeviation: number;
}

/**
 * Oracle Added Event
 */
export interface OracleAddedEvent {
  registry: PublicKey;
  oracle: PublicKey;
  oracleTypeIndex: number;
  weight: number;
}

/**
 * Oracle Removed Event
 */
export interface OracleRemovedEvent {
  registry: PublicKey;
  oracle: PublicKey;
  reason: string;
  violationCount: number;
}

/**
 * Oracle Slashed Event
 */
export interface OracleSlashedEvent {
  oracle: PublicKey;
  slashAmount: BN;
  violationCount: number;
  reason: string;
}

/**
 * Oracle Rewarded Event
 */
export interface OracleRewardedEvent {
  oracle: PublicKey;
  rewardAmount: BN;
  escrow: PublicKey;
}

/**
 * Oracle Rewards Claimed Event
 */
export interface OracleRewardsClaimedEvent {
  oracle: PublicKey;
  amount: BN;
}

/**
 * Agent Slashed Event
 */
export interface AgentSlashedEvent {
  agent: PublicKey;
  slashAmount: BN;
  reason: string;
}

/**
 * Treasury Deposit Event
 */
export interface TreasuryDepositEvent {
  amount: BN;
  source: string;
  escrow: PublicKey;
}

/**
 * Expired Escrow Claimed Event
 */
export interface ExpiredEscrowClaimedEvent {
  escrow: PublicKey;
  claimer: PublicKey;
  amount: BN;
  claimType: string;
}

/**
 * Multi-Oracle Dispute Resolved Event
 */
export interface MultiOracleDisputeResolvedEvent {
  escrow: PublicKey;
  transactionId: string;
  oracleCount: number;
  individualScores: number[];
  oracles: PublicKey[];
  consensusScore: number;
  refundPercentage: number;
  refundAmount: BN;
  paymentAmount: BN;
}

/**
 * Event callbacks interface
 */
export interface KamiyoEventCallbacks {
  onAgentCreated?: (event: AgentCreatedEvent) => void;
  onAgentDeactivated?: (event: AgentDeactivatedEvent) => void;
  onAgentSlashed?: (event: AgentSlashedEvent) => void;
  onAgreementInitialized?: (event: AgreementInitializedEvent) => void;
  onDisputeMarked?: (event: DisputeMarkedEvent) => void;
  onDisputeResolved?: (event: DisputeResolvedEvent) => void;
  onFundsReleased?: (event: FundsReleasedEvent) => void;
  onExpiredEscrowClaimed?: (event: ExpiredEscrowClaimedEvent) => void;
  onOracleRegistryInitialized?: (event: OracleRegistryInitializedEvent) => void;
  onOracleAdded?: (event: OracleAddedEvent) => void;
  onOracleRemoved?: (event: OracleRemovedEvent) => void;
  onOracleSlashed?: (event: OracleSlashedEvent) => void;
  onOracleRewarded?: (event: OracleRewardedEvent) => void;
  onOracleRewardsClaimed?: (event: OracleRewardsClaimedEvent) => void;
  onMultiOracleDisputeResolved?: (event: MultiOracleDisputeResolvedEvent) => void;
  onTreasuryDeposit?: (event: TreasuryDepositEvent) => void;
}

/**
 * Event listener for Kamiyo protocol events
 */
export class KamiyoEventListener {
  private listeners: number[] = [];

  constructor(private program: Program<any>) {}

  /**
   * Subscribe to Kamiyo events
   */
  subscribe(callbacks: KamiyoEventCallbacks): void {
    if (callbacks.onAgentCreated) {
      this.listeners.push(
        this.program.addEventListener("AgentCreated", callbacks.onAgentCreated)
      );
    }

    if (callbacks.onAgentDeactivated) {
      this.listeners.push(
        this.program.addEventListener(
          "AgentDeactivated",
          callbacks.onAgentDeactivated
        )
      );
    }

    if (callbacks.onAgreementInitialized) {
      this.listeners.push(
        this.program.addEventListener(
          "EscrowInitialized",
          callbacks.onAgreementInitialized
        )
      );
    }

    if (callbacks.onDisputeMarked) {
      this.listeners.push(
        this.program.addEventListener("DisputeMarked", callbacks.onDisputeMarked)
      );
    }

    if (callbacks.onDisputeResolved) {
      this.listeners.push(
        this.program.addEventListener(
          "DisputeResolved",
          callbacks.onDisputeResolved
        )
      );
    }

    if (callbacks.onFundsReleased) {
      this.listeners.push(
        this.program.addEventListener("FundsReleased", callbacks.onFundsReleased)
      );
    }

    if (callbacks.onOracleRegistryInitialized) {
      this.listeners.push(
        this.program.addEventListener(
          "OracleRegistryInitialized",
          callbacks.onOracleRegistryInitialized
        )
      );
    }

    if (callbacks.onOracleAdded) {
      this.listeners.push(
        this.program.addEventListener("OracleAdded", callbacks.onOracleAdded)
      );
    }

    if (callbacks.onOracleRemoved) {
      this.listeners.push(
        this.program.addEventListener("OracleRemoved", callbacks.onOracleRemoved)
      );
    }

    if (callbacks.onMultiOracleDisputeResolved) {
      this.listeners.push(
        this.program.addEventListener(
          "MultiOracleDisputeResolved",
          callbacks.onMultiOracleDisputeResolved
        )
      );
    }

    if (callbacks.onAgentSlashed) {
      this.listeners.push(
        this.program.addEventListener("AgentSlashed", callbacks.onAgentSlashed)
      );
    }

    if (callbacks.onOracleSlashed) {
      this.listeners.push(
        this.program.addEventListener("OracleSlashed", callbacks.onOracleSlashed)
      );
    }

    if (callbacks.onOracleRewarded) {
      this.listeners.push(
        this.program.addEventListener("OracleRewarded", callbacks.onOracleRewarded)
      );
    }

    if (callbacks.onOracleRewardsClaimed) {
      this.listeners.push(
        this.program.addEventListener(
          "OracleRewardsClaimed",
          callbacks.onOracleRewardsClaimed
        )
      );
    }

    if (callbacks.onTreasuryDeposit) {
      this.listeners.push(
        this.program.addEventListener("TreasuryDeposit", callbacks.onTreasuryDeposit)
      );
    }

    if (callbacks.onExpiredEscrowClaimed) {
      this.listeners.push(
        this.program.addEventListener(
          "ExpiredEscrowClaimed",
          callbacks.onExpiredEscrowClaimed
        )
      );
    }
  }

  /**
   * Unsubscribe from all events
   */
  unsubscribeAll(): void {
    for (const listener of this.listeners) {
      this.program.removeEventListener(listener);
    }
    this.listeners = [];
  }

  /**
   * Get number of active listeners
   */
  getListenerCount(): number {
    return this.listeners.length;
  }
}
