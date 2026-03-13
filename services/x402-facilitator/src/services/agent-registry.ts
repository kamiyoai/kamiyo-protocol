import { PublicKey } from '@solana/web3.js';
import { getConfig } from '../config';

type RegistryModule = typeof import('8004-solana');

export type AgentRegistryService = {
  type: string;
  value: string;
  meta?: Record<string, unknown>;
};

export type AgentRegistryFeedbackSummary = {
  averageScore: number;
  totalFeedbacks: number;
  positiveCount: number;
  negativeCount: number;
  nextFeedbackIndex: number;
};

export type ResolvedAgentRegistryIdentity = {
  globalId: string;
  name: string | null;
  description: string | null;
  imageUri: string | null;
  ownerWallet: string;
  operationalWallet: string | null;
  agentUri: string | null;
  active: boolean;
  services: AgentRegistryService[];
  supportedTrust: string[];
  feedbackSummary: AgentRegistryFeedbackSummary;
  syncSource: string;
  syncedAt: Date;
};

export type StoredAgentRegistryIdentity = {
  agent_id?: string | null;
  payer_wallet?: string | null;
  registry_global_id?: string | null;
  registry_name?: string | null;
  registry_description?: string | null;
  registry_image_uri?: string | null;
  registry_owner_wallet?: string | null;
  registry_operational_wallet?: string | null;
  registry_agent_uri?: string | null;
  registry_active?: boolean | null;
  registry_services?: unknown;
  registry_supported_trust?: unknown;
  registry_feedback_summary?: unknown;
  registry_sync_source?: string | null;
  registry_synced_at?: Date | string | null;
};

export type KizunaIdentityPayload = {
  mode: 'registry' | 'legacy';
  synced: boolean;
  globalId: string | null;
  name: string | null;
  description: string | null;
  imageUri: string | null;
  ownerWallet: string | null;
  operationalWallet: string | null;
  authorizedWallet: string | null;
  payerWallet: string | null;
  agentUri: string | null;
  active: boolean | null;
  services: AgentRegistryService[];
  supportedTrust: string[];
  feedbackSummary: AgentRegistryFeedbackSummary | null;
  syncSource: string | null;
  syncedAt: string | null;
  compatibleMetadata: {
    registrationFile: Record<string, unknown>;
    x402DiscoveryUrl: string | null;
    publicProfileUrl: string | null;
  } | null;
};

let registryModulePromise: Promise<RegistryModule> | null = null;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const item of value) {
    const parsed = asString(item);
    if (parsed) out.add(parsed);
  }
  return Array.from(out);
}

function normalizeServiceType(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === 'wallet') return 'wallet';
  return trimmed.toUpperCase();
}

function parseServices(value: unknown): AgentRegistryService[] {
  if (!Array.isArray(value)) return [];

  const out: AgentRegistryService[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;

    const type = asString(record.type) || asString(record.name);
    const rawValue =
      asString(record.value) ||
      asString(record.endpoint) ||
      asString(record.target);

    if (!type || !rawValue) continue;

    const normalizedType = normalizeServiceType(type);
    if (!normalizedType) continue;

    const dedupeKey = `${normalizedType}:${rawValue}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const meta = asRecord(record.meta) || undefined;
    out.push({ type: normalizedType, value: rawValue, ...(meta ? { meta } : {}) });
  }

  return out;
}

function parseFeedbackSummary(value: unknown): AgentRegistryFeedbackSummary | null {
  const record = asRecord(value);
  if (!record) return null;

  const averageScore =
    typeof record.averageScore === 'number' && Number.isFinite(record.averageScore)
      ? record.averageScore
      : null;
  const totalFeedbacks =
    typeof record.totalFeedbacks === 'number' && Number.isFinite(record.totalFeedbacks)
      ? record.totalFeedbacks
      : null;
  const positiveCount =
    typeof record.positiveCount === 'number' && Number.isFinite(record.positiveCount)
      ? record.positiveCount
      : null;
  const negativeCount =
    typeof record.negativeCount === 'number' && Number.isFinite(record.negativeCount)
      ? record.negativeCount
      : null;
  const nextFeedbackIndex =
    typeof record.nextFeedbackIndex === 'number' && Number.isFinite(record.nextFeedbackIndex)
      ? record.nextFeedbackIndex
      : null;

  if (
    averageScore == null ||
    totalFeedbacks == null ||
    positiveCount == null ||
    negativeCount == null ||
    nextFeedbackIndex == null
  ) {
    return null;
  }

  return {
    averageScore,
    totalFeedbacks,
    positiveCount,
    negativeCount,
    nextFeedbackIndex,
  };
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function toJsonValue(value: unknown): unknown {
  if (value == null) return value;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const converted = toJsonValue(item);
      if (converted !== undefined) out[key] = converted;
    }
    return out;
  }
  return String(value);
}

function mapServiceType(
  module: RegistryModule,
  type: string
): import('8004-solana').ServiceType | null {
  const serviceType = normalizeServiceType(type);
  switch (serviceType) {
    case 'MCP':
      return module.ServiceType.MCP;
    case 'A2A':
      return module.ServiceType.A2A;
    case 'OASF':
      return module.ServiceType.OASF;
    case 'ENS':
      return module.ServiceType.ENS;
    case 'SNS':
      return module.ServiceType.SNS;
    case 'DID':
      return module.ServiceType.DID;
    case 'WALLET':
    case 'wallet':
      return module.ServiceType.WALLET;
    default:
      return null;
  }
}

function defaultFeedbackSummary(): AgentRegistryFeedbackSummary {
  return {
    averageScore: 0,
    totalFeedbacks: 0,
    positiveCount: 0,
    negativeCount: 0,
    nextFeedbackIndex: 0,
  };
}

async function getRegistryModule(): Promise<RegistryModule> {
  registryModulePromise ??= import('8004-solana');
  return registryModulePromise;
}

async function createRegistrySdk(module: RegistryModule): Promise<InstanceType<RegistryModule['SolanaSDK']>> {
  const config = getConfig();

  return new module.SolanaSDK({
    cluster: config.KIZUNA_AGENT_REGISTRY_CLUSTER,
    rpcUrl: config.KIZUNA_AGENT_REGISTRY_RPC_URL || config.SOLANA_RPC_URL,
    ...(config.KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL
      ? { indexerGraphqlUrl: config.KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL }
      : {}),
  });
}

function toMetadataUrl(agentUri: string): string {
  if (/^https?:\/\//i.test(agentUri)) return agentUri;
  if (!agentUri.startsWith('ipfs://')) {
    throw new Error('unsupported_agent_uri');
  }

  const config = getConfig();
  const base = withTrailingSlash(config.KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL);
  const withoutScheme = agentUri.slice('ipfs://'.length).replace(/^ipfs\//, '');
  return new URL(withoutScheme, base).toString();
}

async function fetchRegistrationMetadata(agentUri: string | null): Promise<Record<string, unknown> | null> {
  if (!agentUri) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(toMetadataUrl(agentUri), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return asRecord(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeSupportedTrust(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  return asStringArray(
    metadata.trustModels ?? metadata.supportedTrust ?? metadata.supportedTrusts
  );
}

function resolveCompatibilityUrls(): {
  x402DiscoveryUrl: string | null;
  publicProfileUrl: string | null;
  mcpUrl: string | null;
  a2aUrl: string | null;
} {
  const config = getConfig();
  const x402Base = asString(config.KIZUNA_PUBLIC_X402_BASE_URL);

  return {
    x402DiscoveryUrl: x402Base
      ? new URL('/.well-known/x402', withTrailingSlash(x402Base)).toString()
      : null,
    publicProfileUrl: asString(config.KIZUNA_PUBLIC_WEB_URL),
    mcpUrl: asString(config.KIZUNA_PUBLIC_MCP_URL),
    a2aUrl: asString(config.KIZUNA_PUBLIC_A2A_URL),
  };
}

function mergeServices(
  services: AgentRegistryService[],
  compatibilityUrls: ReturnType<typeof resolveCompatibilityUrls>
): AgentRegistryService[] {
  const merged = [...services];
  const seen = new Set(services.map((service) => `${normalizeServiceType(service.type)}:${service.value}`));

  for (const service of [
    compatibilityUrls.mcpUrl ? { type: 'MCP', value: compatibilityUrls.mcpUrl } : null,
    compatibilityUrls.a2aUrl ? { type: 'A2A', value: compatibilityUrls.a2aUrl } : null,
  ]) {
    if (!service) continue;
    const key = `${service.type}:${service.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(service);
  }

  return merged;
}

export function isLegacyIdentityAllowed(): boolean {
  return getConfig().KIZUNA_ALLOW_LEGACY_AGENT_IDS;
}

export function getAuthorizedRegistryWallet(identity: Pick<ResolvedAgentRegistryIdentity, 'ownerWallet' | 'operationalWallet'> | StoredAgentRegistryIdentity): string | null {
  const operationalWallet =
    'operationalWallet' in identity
      ? identity.operationalWallet
      : identity.registry_operational_wallet ?? null;
  const ownerWallet =
    'ownerWallet' in identity ? identity.ownerWallet : identity.registry_owner_wallet ?? null;
  return operationalWallet || ownerWallet;
}

export async function resolveAgentRegistryIdentity(agentId: string): Promise<ResolvedAgentRegistryIdentity | null> {
  let asset: PublicKey;
  try {
    asset = new PublicKey(agentId);
  } catch {
    return null;
  }

  const module = await getRegistryModule();
  const sdk = await createRegistrySdk(module);
  const agent = await sdk.loadAgent(asset);
  if (!agent) return null;

  const metadata = await fetchRegistrationMetadata(asString(agent.agent_uri));
  const services = parseServices(metadata?.services);
  const feedbackSummary = await sdk
    .getSummary(asset)
    .then((summary) => ({
      averageScore: summary.averageScore,
      totalFeedbacks: summary.totalFeedbacks,
      positiveCount: summary.positiveCount,
      negativeCount: summary.negativeCount,
      nextFeedbackIndex: summary.nextFeedbackIndex,
    }))
    .catch(() => defaultFeedbackSummary());

  return {
    globalId: asset.toBase58(),
    name: asString(metadata?.name) || asString(agent.nft_name),
    description: asString(metadata?.description),
    imageUri: asString(metadata?.image),
    ownerWallet: agent.getOwnerPublicKey().toBase58(),
    operationalWallet: agent.getAgentWalletPublicKey()?.toBase58() || null,
    agentUri: asString(agent.agent_uri),
    active: asBoolean(metadata?.active) ?? true,
    services,
    supportedTrust: normalizeSupportedTrust(metadata),
    feedbackSummary,
    syncSource: '8004-solana',
    syncedAt: new Date(),
  };
}

export async function buildKizunaIdentityPayload(
  identity: StoredAgentRegistryIdentity
): Promise<KizunaIdentityPayload | null> {
  const syncSource = identity.registry_sync_source ?? null;
  if (!syncSource && !identity.registry_global_id) return null;

  const services = parseServices(identity.registry_services);
  const feedbackSummary = parseFeedbackSummary(identity.registry_feedback_summary);
  const compatibilityUrls = resolveCompatibilityUrls();
  const module = await getRegistryModule();

  const registrationServices = mergeServices(services, compatibilityUrls)
    .map((service) => {
      const type = mapServiceType(module, service.type);
      return type ? { type, value: service.value } : null;
    })
    .filter((service) => service !== null) as import('8004-solana').Service[];

  const registrationFile = module.buildRegistrationFileJson({
    name: identity.registry_name || identity.agent_id || 'Kamiyo agent',
    description: identity.registry_description || 'Kizuna agent identity snapshot',
    ...(identity.registry_image_uri ? { image: identity.registry_image_uri } : {}),
    services: registrationServices,
    trustModels: asStringArray(identity.registry_supported_trust),
    ...(identity.registry_owner_wallet ? { owners: [identity.registry_owner_wallet] } : {}),
    ...(identity.registry_operational_wallet
      ? { operators: [identity.registry_operational_wallet] }
      : {}),
    active: identity.registry_active ?? true,
    x402Support: Boolean(compatibilityUrls.x402DiscoveryUrl),
    metadata: toJsonValue({
      kamiyo: {
        x402DiscoveryUrl: compatibilityUrls.x402DiscoveryUrl,
        publicProfileUrl: compatibilityUrls.publicProfileUrl,
      },
    }) as Record<string, unknown>,
  });

  const authorizedWallet = getAuthorizedRegistryWallet(identity);
  const syncedAt =
    identity.registry_synced_at instanceof Date
      ? identity.registry_synced_at.toISOString()
      : asString(identity.registry_synced_at);

  return {
    mode: syncSource === 'legacy' ? 'legacy' : 'registry',
    synced: Boolean(identity.registry_global_id && syncSource && syncSource !== 'legacy'),
    globalId: identity.registry_global_id ?? null,
    name: identity.registry_name ?? null,
    description: identity.registry_description ?? null,
    imageUri: identity.registry_image_uri ?? null,
    ownerWallet: identity.registry_owner_wallet ?? null,
    operationalWallet: identity.registry_operational_wallet ?? null,
    authorizedWallet,
    payerWallet: identity.payer_wallet ?? null,
    agentUri: identity.registry_agent_uri ?? null,
    active: identity.registry_active ?? null,
    services,
    supportedTrust: asStringArray(identity.registry_supported_trust),
    feedbackSummary,
    syncSource,
    syncedAt,
    compatibleMetadata: {
      registrationFile,
      x402DiscoveryUrl: compatibilityUrls.x402DiscoveryUrl,
      publicProfileUrl: compatibilityUrls.publicProfileUrl,
    },
  };
}
