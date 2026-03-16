import type { ParanetConfig } from '@kamiyo/agent-paranet';

export type DkgBlockchainId = 'base:8453' | 'gnosis:100' | 'otp:2043';

export function firstNonEmpty(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const value = raw.trim();
    if (value) return value;
  }
  return undefined;
}

export function normalizeDkgEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  if (!value) return value;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) return value;
  return `http://${value}`;
}

export function resolveDkgEndpoint(): string | undefined {
  const endpoint = firstNonEmpty([
    'DKG_ENDPOINT',
    'KAMIYO_DKG_ENDPOINT',
    'PARANET_DKG_ENDPOINT',
    'OT_NODE_ENDPOINT',
  ]);
  return endpoint ? normalizeDkgEndpoint(endpoint) : undefined;
}

export function resolveDkgBlockchain(): DkgBlockchainId {
  const value = firstNonEmpty(['DKG_BLOCKCHAIN', 'KAMIYO_DKG_BLOCKCHAIN', 'PARANET_BLOCKCHAIN']);
  if (value === 'gnosis:100' || value === 'otp:2043') return value;
  return 'base:8453';
}

export function resolveDkgPort(): number {
  const raw = firstNonEmpty(['DKG_PORT', 'KAMIYO_DKG_PORT', 'PARANET_DKG_PORT']);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) return parsed;
  return 8900;
}

export function resolveDkgPrivateKey(): string | undefined {
  return firstNonEmpty(['DKG_PRIVATE_KEY', 'KAMIYO_DKG_PRIVATE_KEY', 'PARANET_PRIVATE_KEY']);
}

export function resolveDkgRpc(): string | undefined {
  return firstNonEmpty(['DKG_RPC_URL', 'KAMIYO_DKG_RPC_URL', 'PARANET_DKG_RPC_URL']);
}

export function resolveDkgEpochs(): number {
  const raw = firstNonEmpty(['DKG_EPOCHS', 'KAMIYO_DKG_EPOCHS', 'PARANET_EPOCHS']);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 12;
}

export function resolveParanetUAL(): string | undefined {
  return firstNonEmpty([
    'MEISHI_PARANET_UAL',
    'PARANET_UAL',
    'DKG_PARANET_UAL',
    'KAMIYO_DKG_PARANET_UAL',
  ]);
}

export function resolveMeishiRepository(): string {
  return firstNonEmpty(['MEISHI_DKG_REPOSITORY']) || 'publicCurrent';
}

export function resolveMeishiRepositories(): string[] {
  const configured = resolveMeishiRepository();
  return [...new Set([configured, 'publicCurrent', 'publicKnowledgeAssets'])];
}

export function getParanetConfig(): ParanetConfig {
  const endpoint = resolveDkgEndpoint();
  if (!endpoint) {
    throw new Error('DKG endpoint missing. Set DKG_ENDPOINT or KAMIYO_DKG_ENDPOINT');
  }

  return {
    dkgEndpoint: endpoint,
    dkgPort: resolveDkgPort(),
    blockchain: resolveDkgBlockchain(),
    privateKey: resolveDkgPrivateKey(),
    epochs: resolveDkgEpochs(),
    paranetUAL: resolveParanetUAL(),
  };
}
