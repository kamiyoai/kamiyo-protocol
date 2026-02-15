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

/** Matches plugin-trust's TrustEvidenceType enum values (uppercase). */
export type TrustEvidenceType =
  | 'PROMISE_KEPT'
  | 'PROMISE_BROKEN'
  | 'HELPFUL_ACTION'
  | 'HARMFUL_ACTION'
  | 'CONSISTENT_BEHAVIOR'
  | 'VERIFIED_IDENTITY'
  | 'COMMUNITY_CONTRIBUTION'
  | 'SUCCESSFUL_TRANSACTION'
  | 'INCONSISTENT_BEHAVIOR'
  | 'SUSPICIOUS_ACTIVITY'
  | 'FAILED_VERIFICATION'
  | 'SPAM_BEHAVIOR'
  | 'SECURITY_VIOLATION'
  | 'IDENTITY_CHANGE'
  | 'ROLE_CHANGE'
  | 'CONTEXT_SWITCH';

export interface TrustContext {
  evaluatorId: string;
  roomId?: string;
  worldId?: string;
  platform?: string;
  action?: string;
  [key: string]: unknown;
}

/** Minimal TrustInteraction shape for plugin-trust recordInteraction(). */
export interface TrustInteraction {
  sourceEntityId: string;
  targetEntityId: string;
  type: TrustEvidenceType;
  timestamp: number;
  impact: number;
  details?: {
    description?: string;
    messageId?: string;
    roomId?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
  context?: TrustContext;
}

/** Minimal TrustEngine service interface (what we call on it) */
export interface TrustEngineService {
  recordInteraction(interaction: TrustInteraction): Promise<void>;
  calculateTrust?(entityId: string, context: TrustContext): Promise<TrustProfile | null>;
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
  escrow_released:  { type: 'PROMISE_KEPT',        impact: 15,  dimension: 'reliability',   description: 'Escrow funds released — delivery honored' },
  escrow_disputed:  { type: 'PROMISE_BROKEN',      impact: -10, dimension: 'reliability',   description: 'Escrow disputed — delivery contested' },
  dispute_won:      { type: 'CONSISTENT_BEHAVIOR', impact: 10,  dimension: 'integrity',     description: 'Dispute resolved in favor — legitimate claim' },
  dispute_lost:     { type: 'INCONSISTENT_BEHAVIOR', impact: -15, dimension: 'integrity',   description: 'Dispute lost — frivolous or invalid claim' },
  oracle_correct:   { type: 'CONSISTENT_BEHAVIOR', impact: 10,  dimension: 'competence',    description: 'Oracle vote aligned with consensus' },
  oracle_slashed:   { type: 'INCONSISTENT_BEHAVIOR', impact: -20, dimension: 'competence',  description: 'Oracle slashed — vote deviated from consensus' },
  agent_slashed:    { type: 'HARMFUL_ACTION',      impact: -20, dimension: 'integrity',     description: 'Agent stake slashed for violation' },
  stake_increased:  { type: 'HELPFUL_ACTION',      impact: 8,   dimension: 'benevolence',   description: 'Stake increased — more skin in the game' },
  stake_decreased:  { type: 'SUSPICIOUS_ACTIVITY', impact: -5,  dimension: 'benevolence',   description: 'Stake decreased — reduced commitment' },
  agent_registered: { type: 'VERIFIED_IDENTITY',   impact: 8,   dimension: 'transparency',  description: 'Agent registered on-chain with verifiable identity' },
};

export type KamiyoNetwork = 'mainnet' | 'devnet' | 'localnet';

export const NETWORKS: Record<KamiyoNetwork, { rpcUrl: string; programId: string }> = {
  mainnet: { rpcUrl: 'https://api.mainnet-beta.solana.com', programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM' },
  devnet:  { rpcUrl: 'https://api.devnet.solana.com',       programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM' },
  localnet:{ rpcUrl: 'http://127.0.0.1:8899',               programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM' },
};
