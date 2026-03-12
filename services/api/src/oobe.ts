const DEFAULT_ALLOWED_TARGET_HOSTS = ['api.kamiyo.ai', 'x402.kamiyo.ai'] as const;

export const OOBE_ALLOWED_TOOL_NAMES = [
  'x402_check_pricing',
  'x402_fetch',
  'create_escrow',
  'check_escrow_status',
] as const;

export type OobeAllowedToolName = (typeof OOBE_ALLOWED_TOOL_NAMES)[number];

function normalizeHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//, '');
  const host = withoutScheme.split('/')[0]?.split(':')[0]?.trim();
  return host || null;
}

export function getOobePartnerBearerToken(): string {
  return process.env.OOBE_PARTNER_BEARER_TOKEN?.trim() || '';
}

export function getOobeAllowedTargetHosts(): string[] {
  const configured = (process.env.OOBE_ALLOWED_TARGET_HOSTS || '')
    .split(/[,\n]/)
    .map((value) => normalizeHost(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set([...DEFAULT_ALLOWED_TARGET_HOSTS, ...configured])];
}
