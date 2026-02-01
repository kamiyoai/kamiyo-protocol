// Shared utilities for KAMIYO Agent Paranet

// Global ID format: eip155:chainId:registryAddress:agentId
export const GLOBAL_ID_REGEX = /^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/;

// Validate ERC-8004 global ID format
export function isValidGlobalId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 100 && GLOBAL_ID_REGEX.test(id);
}

// SPARQL escape to prevent injection
export function escapeSparql(str: string): string {
  if (typeof str !== 'string') return '';
  // Strip null bytes first (critical for injection prevention)
  const clean = str.replace(/\0/g, '');
  return clean
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>{}|^`]/g, '') // Strip SPARQL special chars
    .slice(0, 256);
}

// Task type taxonomy
export const TASK_TYPES = [
  'code_review',
  'security_audit',
  'smart_contract_audit',
  'code_generation',
  'documentation',
  'research',
  'data_analysis',
  'translation',
  'content_creation',
  'api_integration',
  'testing',
  'deployment',
  'monitoring',
  'custom',
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

// KAMIYO tier names
export const TIER_NAMES = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'] as const;

export type TierName = (typeof TIER_NAMES)[number];

// Tier thresholds (score required to reach each tier)
export const TIER_THRESHOLDS = {
  Bronze: 25,
  Silver: 50,
  Gold: 75,
  Platinum: 90,
} as const;

// Convert numeric score to tier index (0-4)
export function scoreToTierIndex(score: number): number {
  const s = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  if (s >= TIER_THRESHOLDS.Platinum) return 4;
  if (s >= TIER_THRESHOLDS.Gold) return 3;
  if (s >= TIER_THRESHOLDS.Silver) return 2;
  if (s >= TIER_THRESHOLDS.Bronze) return 1;
  return 0;
}

// Convert tier index to name
export function tierIndexToName(tier: number): TierName {
  return TIER_NAMES[Math.max(0, Math.min(4, tier))] || 'Unverified';
}

// Convert score directly to tier name
export function scoreToTierName(score: number): TierName {
  return tierIndexToName(scoreToTierIndex(score));
}

// Numeric clamping helper
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

// Safe integer parsing with bounds
export function safeInt(value: unknown, defaultVal: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return defaultVal;
  return clamp(Math.floor(parsed), min, max);
}

// Score weights for credit calculation
export const SCORE_WEIGHTS = {
  taskQuality: 0.40,
  reliability: 0.20,
  disputeRecord: 0.15,
  peerTrust: 0.15,
  tenure: 0.10,
} as const;

// Dispute outcome types
export const DISPUTE_OUTCOMES = ['none', 'provider_won', 'client_won', 'split'] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

// Attestation types
export const ATTESTATION_TYPES = ['self', 'peer', 'validator', 'oracle'] as const;
export type AttestationType = (typeof ATTESTATION_TYPES)[number];

// Trust types
export const TRUST_TYPES = ['general', 'capability_specific', 'delegated'] as const;
export type TrustType = (typeof TRUST_TYPES)[number];

// Schema context URLs
export const SCHEMA_CONTEXTS = {
  schemaOrg: 'https://schema.org/',
  kamiyoParanet: 'https://kamiyo.ai/paranet/v1',
  erc8004: 'https://eips.ethereum.org/EIPS/eip-8004',
} as const;

// Maximum limits for safety
// Note: maxCacheSize increased to 5000 to reduce LRU eviction frequency
// (eviction is O(N) on full cache, so larger cache = fewer evictions under load)
export const LIMITS = {
  maxQueryResults: 100,
  maxCacheSize: 5000,
  maxStringLength: 256,
  maxDescriptionLength: 1000,
  maxArrayItems: 50,
  maxCapabilities: 10,
  maxEvidenceUALs: 10,
} as const;

// Extract global ID from text
export function extractGlobalId(text: string): string | null {
  const match = text.match(GLOBAL_ID_REGEX);
  return match ? match[0] : null;
}

// Extract task type from text
export function extractTaskType(text: string): TaskType | null {
  const lower = text.toLowerCase();
  return TASK_TYPES.find(t => lower.includes(t.replace('_', ' '))) || null;
}

// Extract number following keywords
export function extractNumber(text: string, keywords: string[]): number | null {
  for (const kw of keywords) {
    const pattern = new RegExp(`${kw}[:\\s]*(\\d+(?:\\.\\d+)?)`);
    const match = text.match(pattern);
    if (match) return parseFloat(match[1]);
  }
  return null;
}
