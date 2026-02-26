import { CDP_ENV } from './constants.js';

export type CdpEnv = {
  apiKeyId: string;
  apiKeySecret: string;
  walletSecret: string;
};

type CdpEnvField = keyof CdpEnv;

type ResolvedField = {
  value: string | null;
  source: string | null;
  aliases: readonly string[];
};

const CDP_ENV_SOURCES: Record<CdpEnvField, readonly string[]> = {
  apiKeyId: [CDP_ENV.apiKeyId, 'COINBASE_CDP_API_KEY_ID', 'COINBASE_API_KEY_ID'],
  apiKeySecret: [CDP_ENV.apiKeySecret, 'COINBASE_CDP_API_KEY_SECRET', 'COINBASE_API_KEY_SECRET'],
  walletSecret: [CDP_ENV.walletSecret, 'COINBASE_CDP_WALLET_SECRET', 'COINBASE_WALLET_SECRET'],
};

export type CdpEnvFieldStatus = {
  key: string;
  configured: boolean;
  source: string | null;
  aliases: readonly string[];
};

export type CdpEnvInspection = {
  ok: boolean;
  fields: Record<CdpEnvField, CdpEnvFieldStatus>;
  missing: string[];
};

function resolveFirst(keys: readonly string[]): { value: string; source: string } | null {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const value = raw.trim();
    if (!value) continue;
    return { value, source: key };
  }

  return null;
}

function resolveField(field: CdpEnvField): ResolvedField {
  const aliases = CDP_ENV_SOURCES[field];
  const resolved = resolveFirst(aliases);
  return {
    value: resolved?.value ?? null,
    source: resolved?.source ?? null,
    aliases,
  };
}

function formatMissing(field: CdpEnvField): string {
  return `${field} (${CDP_ENV_SOURCES[field].join(' | ')})`;
}

function resolveAll(): Record<CdpEnvField, ResolvedField> {
  return {
    apiKeyId: resolveField('apiKeyId'),
    apiKeySecret: resolveField('apiKeySecret'),
    walletSecret: resolveField('walletSecret'),
  };
}

export function inspectCdpEnv(): CdpEnvInspection {
  const resolved = resolveAll();
  const fields: Record<CdpEnvField, CdpEnvFieldStatus> = {
    apiKeyId: {
      key: CDP_ENV.apiKeyId,
      configured: resolved.apiKeyId.value !== null,
      source: resolved.apiKeyId.source,
      aliases: resolved.apiKeyId.aliases,
    },
    apiKeySecret: {
      key: CDP_ENV.apiKeySecret,
      configured: resolved.apiKeySecret.value !== null,
      source: resolved.apiKeySecret.source,
      aliases: resolved.apiKeySecret.aliases,
    },
    walletSecret: {
      key: CDP_ENV.walletSecret,
      configured: resolved.walletSecret.value !== null,
      source: resolved.walletSecret.source,
      aliases: resolved.walletSecret.aliases,
    },
  };

  const missing: string[] = [];
  if (!fields.apiKeyId.configured) missing.push(formatMissing('apiKeyId'));
  if (!fields.apiKeySecret.configured) missing.push(formatMissing('apiKeySecret'));
  if (!fields.walletSecret.configured) missing.push(formatMissing('walletSecret'));

  return {
    ok: missing.length === 0,
    fields,
    missing,
  };
}

export function readCdpEnv(): CdpEnv {
  const resolved = resolveAll();
  const missing: string[] = [];
  if (!resolved.apiKeyId.value) missing.push(formatMissing('apiKeyId'));
  if (!resolved.apiKeySecret.value) missing.push(formatMissing('apiKeySecret'));
  if (!resolved.walletSecret.value) missing.push(formatMissing('walletSecret'));

  if (missing.length > 0) {
    throw new Error(`Missing required CDP env vars: ${missing.join(', ')}`);
  }

  return {
    apiKeyId: resolved.apiKeyId.value as string,
    apiKeySecret: resolved.apiKeySecret.value as string,
    walletSecret: resolved.walletSecret.value as string,
  };
}
