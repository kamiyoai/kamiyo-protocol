import fs from 'node:fs';
import { z } from 'zod';

import type { SwarmAgentProfile, SwarmMarketplaceProfile, SwarmRegistry } from './types.js';

const requiredString = z.preprocess(
  v => (typeof v === 'string' ? v.trim() : v),
  z.string().min(1)
);
const optionalString = z.preprocess(
  v => (typeof v === 'string' ? (v.trim() || undefined) : v),
  z.string().min(1).optional()
);
const optionalUrl = z.preprocess(
  v => (typeof v === 'string' ? (v.trim() || undefined) : v),
  z.string().url().optional()
);
const optionalIsoTime = z
  .preprocess(
    v => (typeof v === 'string' ? (v.trim() || undefined) : v),
    z.string().optional()
  )
  .refine(value => value == null || Number.isFinite(Date.parse(value)), {
    message: 'Invalid ISO time',
  });
const swarmJobSourceSchema = z.enum([
  'x402',
  'direct_api',
  'relevance',
  'agent_ai',
  'kore',
  'near_market',
  'internal',
]);
const swarmMarketplaceProfileSchema = z.object({
  source: z.enum(['relevance', 'agent_ai', 'kore', 'near_market']),
  state: z.enum(['not_listed', 'draft', 'submitted', 'approved', 'rejected']).default('not_listed'),
  listingUrl: optionalUrl,
  ownerContact: optionalString,
  notes: optionalString,
  lastUpdatedAt: optionalIsoTime,
});

const swarmAgentSchema = z.object({
  id: requiredString,
  name: requiredString,
  role: requiredString,
  mandate: requiredString,
  mint: requiredString,
  feeVault: optionalString,
  sourceStakingPool: optionalString,
  claimerKeypairPath: optionalString,
  status: z.enum(['active', 'paused', 'retired']).default('active'),
  priority: z.coerce.number().int().min(0).default(100),
  jobSources: z.array(swarmJobSourceSchema).default(['x402', 'direct_api']),
  marketplaceProfiles: z.array(swarmMarketplaceProfileSchema).default([]),
  missionHints: z.array(requiredString).default([]),
});

const swarmRegistrySchema = z.object({
  version: z.coerce.number().int().positive().default(1),
  parent: requiredString.default('kyoshin'),
  agents: z.array(swarmAgentSchema).default([]),
});

type SwarmRegistryRaw = z.infer<typeof swarmRegistrySchema>;

export type LoadSwarmRegistryResult =
  | {
      ok: true;
      registry: SwarmRegistry;
      path: string;
    }
  | {
      ok: false;
      path: string;
      reason: 'registry_missing' | 'registry_invalid';
      error?: string;
    };

function assertUniqueAgents(agents: SwarmAgentProfile[]): void {
  const seenIds = new Set<string>();
  const seenMints = new Set<string>();

  for (const agent of agents) {
    const agentIdKey = agent.id.toLowerCase();
    if (seenIds.has(agentIdKey)) {
      throw new Error(`Duplicate swarm agent id: ${agent.id}`);
    }
    seenIds.add(agentIdKey);

    const mintKey = agent.mint.toLowerCase();
    if (seenMints.has(mintKey)) {
      throw new Error(`Duplicate swarm agent mint: ${agent.mint}`);
    }
    seenMints.add(mintKey);
  }
}

function normalizeMarketplaceProfiles(profiles: SwarmMarketplaceProfile[]): SwarmMarketplaceProfile[] {
  const bySource = new Map<string, SwarmMarketplaceProfile>();
  for (const profile of profiles) {
    bySource.set(profile.source, profile);
  }
  return Array.from(bySource.values());
}

function normalizeRegistry(raw: SwarmRegistryRaw): SwarmRegistry {
  const agents: SwarmAgentProfile[] = raw.agents.map(agent => ({
    ...agent,
    jobSources: Array.from(new Set(agent.jobSources)),
    marketplaceProfiles: normalizeMarketplaceProfiles(agent.marketplaceProfiles),
    missionHints: Array.from(new Set(agent.missionHints)),
  }));
  assertUniqueAgents(agents);

  return {
    version: raw.version,
    parent: raw.parent,
    agents,
  };
}

export function loadSwarmRegistry(registryPath: string): LoadSwarmRegistryResult {
  if (!fs.existsSync(registryPath)) {
    return { ok: false, path: registryPath, reason: 'registry_missing' };
  }

  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = swarmRegistrySchema.parse(parsedJson);
    const registry = normalizeRegistry(parsed);
    return { ok: true, registry, path: registryPath };
  } catch (error) {
    return {
      ok: false,
      path: registryPath,
      reason: 'registry_invalid',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
