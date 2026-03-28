import { resolveAllowedTargetHosts } from './allowed-target-hosts';

const DEFAULT_ALLOWED_TARGET_HOSTS = ['api.kamiyo.ai', 'x402.kamiyo.ai'] as const;

export const OOBE_ALLOWED_TOOL_NAMES = [
  'meishi_verify_agent',
  'meishi_get_passport',
  'meishi_get_mandate',
  'meishi_get_audit',
  'x402_check_pricing',
  'x402_fetch',
  'create_escrow',
  'check_escrow_status',
  'get_api_reputation',
  'assess_data_quality',
  'estimate_refund',
] as const;

export type OobeAllowedToolName = (typeof OOBE_ALLOWED_TOOL_NAMES)[number];

export function getOobePartnerApiKey(): string {
  return process.env.OOBE_PARTNER_API_KEY?.trim() || process.env.OOBE_PARTNER_BEARER_TOKEN?.trim() || '';
}

export function getOobeAllowedTargetHosts(): string[] {
  return resolveAllowedTargetHosts(DEFAULT_ALLOWED_TARGET_HOSTS, process.env.OOBE_ALLOWED_TARGET_HOSTS);
}
