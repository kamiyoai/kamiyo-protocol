import { resolveAllowedTargetHosts } from './allowed-target-hosts';

const DEFAULT_ALLOWED_TARGET_HOSTS = ['api.kamiyo.ai', 'x402.kamiyo.ai'] as const;

export const OOBE_ALLOWED_TOOL_NAMES = [
  'x402_check_pricing',
  'x402_fetch',
  'create_escrow',
  'check_escrow_status',
] as const;

export type OobeAllowedToolName = (typeof OOBE_ALLOWED_TOOL_NAMES)[number];

export function getOobePartnerApiKey(): string {
  return process.env.OOBE_PARTNER_API_KEY?.trim() || process.env.OOBE_PARTNER_BEARER_TOKEN?.trim() || '';
}

export function getOobeAllowedTargetHosts(): string[] {
  return resolveAllowedTargetHosts(DEFAULT_ALLOWED_TARGET_HOSTS, process.env.OOBE_ALLOWED_TARGET_HOSTS);
}
