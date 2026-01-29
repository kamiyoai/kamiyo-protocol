import {
  AgentProfile,
  AgentType,
  AgentEndpoints,
  KamiyoTier,
  AGENT_PROFILE_CONTEXT,
  createAgentProfile,
} from '../types';

/**
 * Utilities for working with ERC-8004 Agent Profile JSON
 */

/**
 * Validate an agent profile JSON object
 */
export function validateAgentProfile(profile: unknown): profile is AgentProfile {
  if (typeof profile !== 'object' || profile === null) {
    return false;
  }

  const p = profile as Record<string, unknown>;

  if (p['@context'] !== AGENT_PROFILE_CONTEXT) {
    return false;
  }

  if (typeof p.name !== 'string' || p.name.length === 0) {
    return false;
  }

  if (typeof p.agentWallet !== 'string' || !p.agentWallet.startsWith('0x')) {
    return false;
  }

  if (typeof p.owner !== 'string' || !p.owner.startsWith('0x')) {
    return false;
  }

  const validTypes = Object.values(AgentType);
  if (!validTypes.includes(p.type as AgentType)) {
    return false;
  }

  return true;
}

/**
 * Parse agent profile from JSON string
 */
export function parseAgentProfile(json: string): AgentProfile {
  const parsed = JSON.parse(json);

  if (!validateAgentProfile(parsed)) {
    throw new Error('Invalid agent profile format');
  }

  return parsed;
}

/**
 * Serialize agent profile to JSON string
 */
export function serializeAgentProfile(profile: AgentProfile): string {
  return JSON.stringify(profile, null, 2);
}

/**
 * Create a minimal agent profile
 */
export function createMinimalProfile(
  name: string,
  wallet: string,
  owner: string,
  type: AgentType = AgentType.Custom
): AgentProfile {
  return createAgentProfile({ name, wallet, owner, type });
}

/**
 * Create a trading agent profile
 */
export function createTradingProfile(params: {
  name: string;
  wallet: string;
  owner: string;
  description?: string;
  tier?: KamiyoTier;
  stakeAmount?: string;
  stakeToken?: string;
  stakeChain?: string;
  webEndpoint?: string;
  a2aEndpoint?: string;
}): AgentProfile {
  return createAgentProfile({
    name: params.name,
    wallet: params.wallet,
    owner: params.owner,
    type: AgentType.Trading,
    description: params.description,
    tier: params.tier,
    endpoints: {
      web: params.webEndpoint,
      a2a: params.a2aEndpoint,
    },
    stake:
      params.stakeAmount && params.stakeToken && params.stakeChain
        ? {
            amount: params.stakeAmount,
            token: params.stakeToken,
            chain: params.stakeChain,
          }
        : undefined,
  });
}

/**
 * Update profile endpoints
 */
export function updateProfileEndpoints(
  profile: AgentProfile,
  endpoints: Partial<AgentEndpoints>
): AgentProfile {
  return {
    ...profile,
    endpoints: {
      ...profile.endpoints,
      ...endpoints,
    },
  };
}

/**
 * Update profile tier
 */
export function updateProfileTier(
  profile: AgentProfile,
  tier: KamiyoTier,
  commitment?: string
): AgentProfile {
  return {
    ...profile,
    reputation: {
      ...profile.reputation,
      kamiyo_tier: KamiyoTier[tier].toLowerCase(),
      verification: {
        type: 'zk_proof',
        commitment,
      },
    },
  };
}

/**
 * Get tier from profile
 */
export function getTierFromProfile(profile: AgentProfile): KamiyoTier {
  const tierStr = profile.reputation?.kamiyo_tier?.toLowerCase();
  if (!tierStr) return KamiyoTier.Unverified;

  switch (tierStr) {
    case 'platinum':
      return KamiyoTier.Platinum;
    case 'gold':
      return KamiyoTier.Gold;
    case 'silver':
      return KamiyoTier.Silver;
    case 'bronze':
      return KamiyoTier.Bronze;
    default:
      return KamiyoTier.Unverified;
  }
}

/**
 * Build profile URI for IPFS or HTTP
 */
export function buildProfileURI(
  profile: AgentProfile,
  baseURI: string
): string {
  const json = serializeAgentProfile(profile);
  const hash = simpleHash(json);
  return `${baseURI}/${hash}.json`;
}

/**
 * Simple hash for profile URI generation
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export { createAgentProfile };
