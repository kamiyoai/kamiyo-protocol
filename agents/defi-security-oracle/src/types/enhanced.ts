/**
 * Enhanced Type Definitions for DeFi Security Oracle
 * Phase 1.1: Enhanced Exploit Analytics
 */

export interface EnhancedExploit {
  // Core fields (existing)
  exploit_id: string;
  protocol: string;
  chain: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  loss_usd: number;
  timestamp: string;
  description: string;

  // Enhanced analytics fields
  attack_pattern: AttackPattern;
  vulnerability: VulnerabilityDetails;
  attribution: AttackerAttribution;
  timeline: ExploitTimeline;
  post_mortem: PostMortem;

  // Metadata
  data_quality_score: number;
  verification_status: 'verified' | 'unverified' | 'disputed';
  sources: string[];
}

export interface AttackPattern {
  type: AttackType;
  complexity: number;                    // 1-10 sophistication score
  similar_attacks: string[];             // Related exploit IDs
  exploit_family: string;                // Attack category grouping
  attack_vector: string[];               // Entry points used
  techniques_used: string[];             // MITRE ATT&CK style techniques
}

export enum AttackType {
  FLASH_LOAN = 'flash_loan',
  REENTRANCY = 'reentrancy',
  ORACLE_MANIPULATION = 'oracle_manipulation',
  PRICE_MANIPULATION = 'price_manipulation',
  ACCESS_CONTROL = 'access_control',
  LOGIC_ERROR = 'logic_error',
  FRONT_RUNNING = 'front_running',
  SANDWICH_ATTACK = 'sandwich_attack',
  BRIDGE_EXPLOIT = 'bridge_exploit',
  GOVERNANCE_ATTACK = 'governance_attack',
  INTEGER_OVERFLOW = 'integer_overflow',
  ECONOMIC_ATTACK = 'economic_attack',
  PHISHING = 'phishing',
  PRIVATE_KEY_COMPROMISE = 'private_key_compromise',
  UNKNOWN = 'unknown'
}

export interface VulnerabilityDetails {
  cwe_id: string;                        // Common Weakness Enumeration
  cvss_score: number;                    // 0-10 severity rating
  exploitability: number;                // Ease of exploitation (0-100)
  impact_scope: ImpactScope[];
  affected_components: string[];
  patch_available: boolean;
  patch_url?: string;
}

export enum ImpactScope {
  CONFIDENTIALITY = 'confidentiality',
  INTEGRITY = 'integrity',
  AVAILABILITY = 'availability',
  FINANCIAL = 'financial',
  REPUTATIONAL = 'reputational'
}

export interface AttackerAttribution {
  attacker_address: string;
  attacker_profile: string;              // Known group or actor
  attribution_confidence: number;        // 0-100%
  related_incidents: string[];           // Connected attacks
  attacker_type: 'individual' | 'group' | 'state_actor' | 'unknown';
  motive: string;
  laundering_trail?: LaunderingInfo;
}

export interface LaunderingInfo {
  mixers_used: string[];
  destination_chains: string[];
  recovered_amount_usd: number;
  blacklisted_addresses: string[];
}

export interface ExploitTimeline {
  vulnerability_introduced: string;      // When vuln was added to code
  first_detected: string;                // When exploit was first seen
  exploit_duration: number;              // Seconds until detection
  response_initiated: string;            // When team responded
  patch_deployed: string;                // When fix was deployed
  recovery_complete: string;             // When system fully recovered
  recovery_time: number;                 // Total time to full recovery (seconds)
}

export interface PostMortem {
  root_cause: string;
  contributing_factors: string[];
  mitigation_steps: string[];
  lessons_learned: string[];
  code_fix_url: string;
  audit_findings?: AuditFindings;
  preventability_score: number;          // 0-100 how preventable it was
}

export interface AuditFindings {
  audit_firm: string;
  audit_date: string;
  vulnerability_missed: boolean;
  audit_quality_score: number;
}

// Attack Pattern Analysis
export interface AttackPatternAnalysis {
  pattern_id: string;
  pattern_name: string;
  frequency: number;                     // Times seen in dataset
  avg_loss_usd: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  affected_protocols: string[];
  mitigation_strategies: string[];
  detection_methods: string[];
}

// Exploit Family Classification
export interface ExploitFamily {
  family_id: string;
  family_name: string;
  description: string;
  member_count: number;
  total_loss_usd: number;
  first_seen: string;
  last_seen: string;
  common_characteristics: string[];
  defense_recommendations: string[];
}

// Enhanced Analytics Response
export interface EnhancedAnalyticsResponse {
  exploits: EnhancedExploit[];
  analytics: {
    total_count: number;
    total_loss_usd: number;
    avg_loss_per_exploit: number;
    attack_pattern_distribution: Record<string, number>;
    severity_distribution: Record<string, number>;
    chain_distribution: Record<string, number>;
    temporal_trends: TemporalTrend[];
    attack_families: ExploitFamily[];
  };
  insights: {
    emerging_threats: string[];
    high_risk_patterns: string[];
    recommended_defenses: string[];
  };
}

export interface TemporalTrend {
  period: string;                        // "2025-W01", "2025-Q1", "2025-11"
  exploit_count: number;
  total_loss_usd: number;
  avg_severity: number;
  dominant_attack_type: string;
}
