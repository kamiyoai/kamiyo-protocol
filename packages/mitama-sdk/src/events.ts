/**
 * Event handling for Mitama protocol
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
export interface MitamaEventCallbacks {
  onAgentCreated?: (event: AgentCreatedEvent) => void;
  onAgentDeactivated?: (event: AgentDeactivatedEvent) => void;
  onAgreementInitialized?: (event: AgreementInitializedEvent) => void;
  onDisputeMarked?: (event: DisputeMarkedEvent) => void;
  onDisputeResolved?: (event: DisputeResolvedEvent) => void;
  onFundsReleased?: (event: FundsReleasedEvent) => void;
  onOracleRegistryInitialized?: (event: OracleRegistryInitializedEvent) => void;
  onOracleAdded?: (event: OracleAddedEvent) => void;
  onOracleRemoved?: (event: OracleRemovedEvent) => void;
  onMultiOracleDisputeResolved?: (event: MultiOracleDisputeResolvedEvent) => void;
}

/**
 * Event listener for Mitama protocol events
 */
export class MitamaEventListener {
  private listeners: number[] = [];

  constructor(private program: Program<any>) {}

  /**
   * Subscribe to Mitama events
   */
  subscribe(callbacks: MitamaEventCallbacks): void {
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
