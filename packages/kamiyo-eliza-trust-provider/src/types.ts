/**
 * Minimal ElizaOS interfaces — avoids hard dependency on @elizaos/core at compile time.
 * Compatible with ElizaOS v1.0+ Plugin/Provider/Service interfaces.
 */

export interface IAgentRuntime {
  agentId: string;
  getSetting(key: string): string | undefined;
  getState?(key: string): Promise<unknown>;
  setState?(key: string, value: unknown): Promise<void>;
  getService?(name: string): unknown;
}

export interface Memory {
  userId: string;
  agentId: string;
  roomId: string;
  content: { text: string; [key: string]: unknown };
}

export interface State {
  agentId?: string;
  [key: string]: unknown;
}

export interface Provider {
  get: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<string>;
}

export interface Service {
  name: string;
  description?: string;
  start?: (runtime: IAgentRuntime) => Promise<void>;
  stop?: () => Promise<void>;
}

export interface Plugin {
  name: string;
  description: string;
  actions?: unknown[];
  providers?: Provider[];
  evaluators?: unknown[];
  services?: Service[];
}

// ---------------------------------------------------------------------------
// plugin-trust TrustEngine interface (subset we interact with)
// ---------------------------------------------------------------------------

/** Maps to plugin-trust's TrustEvidenceType enum */
export type TrustEvidenceType =
  | 'promise_kept'
  | 'promise_broken'
  | 'helpful_action'
  | 'consistent_behavior'
  | 'verified_identity'
  | 'harmful_action'
  | 'inconsistency'
  | 'suspicious_activity'
  | 'failed_verification'
  | 'security_violation';

/** Minimal TrustEvidence shape for recordInteraction() */
export interface TrustEvidenceRecord {
  sourceEntityId: string;
  targetEntityId: string;
  type: TrustEvidenceType;
  impact: number;
  weight?: number;
  description?: string;
  verified?: boolean;
  context?: Record<string, unknown>;
}

/** Minimal TrustEngine service interface (what we call on it) */
export interface TrustEngineService {
  recordInteraction(evidence: TrustEvidenceRecord): Promise<void>;
  calculateTrust?(entityId: string, evaluatorId: string, context?: unknown): Promise<TrustProfile | null>;
}

/** Minimal TrustProfile for read-back */
export interface TrustProfile {
  entityId: string;
  overallTrust: number;
  confidence: number;
  dimensions: {
    reliability: number;
    competence: number;
    integrity: number;
    benevolence: number;
    transparency: number;
  };
}

// ---------------------------------------------------------------------------
// KAMIYO → TrustEvidence mapping
// ---------------------------------------------------------------------------

export type KamiyoEventType =
  | 'escrow_released'
  | 'escrow_disputed'
  | 'dispute_won'
  | 'dispute_lost'
  | 'oracle_correct'
  | 'oracle_slashed'
  | 'agent_slashed'
  | 'stake_increased'
  | 'stake_decreased'
  | 'agent_registered';

export interface EvidenceMapping {
  type: TrustEvidenceType;
  impact: number;
  dimension: string;
  description: string;
}

/**
 * Maps KAMIYO on-chain events to plugin-trust TrustEvidence records.
 *
 * Positive:
 *   escrow_released  → promise_kept (+15 reliability)
 *   dispute_won      → consistent_behavior (+10 integrity)
 *   oracle_correct   → consistent_behavior (+10 competence)
 *   stake_increased  → helpful_action (+8 benevolence)
 *   agent_registered → verified_identity (+8 transparency)
 *
 * Negative:
 *   escrow_disputed  → promise_broken (-10 reliability)
 *   dispute_lost     → inconsistency (-15 integrity)
 *   oracle_slashed   → inconsistency (-20 competence)
 *   agent_slashed    → harmful_action (-20 integrity)
 *   stake_decreased  → suspicious_activity (-5 benevolence)
 */
export const EVIDENCE_MAP: Record<KamiyoEventType, EvidenceMapping> = {
  escrow_released:  { type: 'promise_kept',        impact: 15,  dimension: 'reliability',   description: 'Escrow funds released — delivery honored' },
  escrow_disputed:  { type: 'promise_broken',      impact: -10, dimension: 'reliability',   description: 'Escrow disputed — delivery contested' },
  dispute_won:      { type: 'consistent_behavior', impact: 10,  dimension: 'integrity',     description: 'Dispute resolved in favor — legitimate claim' },
  dispute_lost:     { type: 'inconsistency',       impact: -15, dimension: 'integrity',     description: 'Dispute lost — frivolous or invalid claim' },
  oracle_correct:   { type: 'consistent_behavior', impact: 10,  dimension: 'competence',    description: 'Oracle vote aligned with consensus' },
  oracle_slashed:   { type: 'inconsistency',       impact: -20, dimension: 'competence',    description: 'Oracle slashed — vote deviated from consensus' },
  agent_slashed:    { type: 'harmful_action',       impact: -20, dimension: 'integrity',     description: 'Agent stake slashed for violation' },
  stake_increased:  { type: 'helpful_action',       impact: 8,   dimension: 'benevolence',   description: 'Stake increased — more skin in the game' },
  stake_decreased:  { type: 'suspicious_activity',  impact: -5,  dimension: 'benevolence',   description: 'Stake decreased — reduced commitment' },
  agent_registered: { type: 'verified_identity',    impact: 8,   dimension: 'transparency',  description: 'Agent registered on-chain with verifiable identity' },
};

export type KamiyoNetwork = 'mainnet' | 'devnet' | 'localnet';

export const NETWORKS: Record<KamiyoNetwork, { rpcUrl: string; programId: string }> = {
  mainnet: { rpcUrl: 'https://api.mainnet-beta.solana.com', programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM' },
  devnet:  { rpcUrl: 'https://api.devnet.solana.com',       programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM' },
  localnet:{ rpcUrl: 'http://127.0.0.1:8899',               programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM' },
};
