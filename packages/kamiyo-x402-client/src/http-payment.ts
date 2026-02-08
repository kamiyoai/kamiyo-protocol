import { toCAIP2 } from './v2/networks';

const USDC_DECIMALS = 6;
const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const BASE_MAINNET_CAIP2 = 'eip155:8453';
const BASE_SEPOLIA_CAIP2 = 'eip155:84532';

const NETWORK_ALIAS: Record<string, string> = {
  'solana:mainnet': SOLANA_MAINNET_CAIP2,
  'solana:mainnet-beta': SOLANA_MAINNET_CAIP2,
  'solana:devnet': SOLANA_DEVNET_CAIP2,
  'base:mainnet': BASE_MAINNET_CAIP2,
  'base:sepolia': BASE_SEPOLIA_CAIP2,
};

export type FacilitatorPolicy =
  | 'auto'
  | 'prefer-kamiyo'
  | 'force-kamiyo'
  | 'disable-kamiyo';

export interface RequirementLike {
  network: string;
  amount?: string | number;
  maxAmountRequired?: string | number;
}

export interface FacilitatorPolicyDecision {
  policy: FacilitatorPolicy;
  facilitator?: string;
  isKamiyo: boolean;
  allowed: boolean;
  reason?: string;
}

function normalizeNetwork(network: string): string {
  const trimmed = network.trim();
  const lowered = trimmed.toLowerCase();
  const alias = NETWORK_ALIAS[lowered];
  if (alias) return alias;

  try {
    return toCAIP2(trimmed);
  } catch {
    return trimmed;
  }
}

export function selectPreferredRequirement<T extends RequirementLike>(
  requirements: readonly T[],
  preferredNetwork?: string
): T {
  if (!requirements.length) {
    throw new Error('No payment requirements available');
  }

  if (!preferredNetwork) {
    return requirements[0];
  }

  const normalizedPreferred = normalizeNetwork(preferredNetwork);
  const byCanonical = requirements.find(
    (requirement) => normalizeNetwork(requirement.network) === normalizedPreferred
  );
  if (byCanonical) {
    return byCanonical;
  }

  const byString = requirements.find(
    (requirement) =>
      requirement.network === preferredNetwork ||
      requirement.network.includes(preferredNetwork) ||
      preferredNetwork.includes(requirement.network)
  );
  return byString || requirements[0];
}

export function getRequirementAmountRaw(requirement: RequirementLike): string | null {
  const raw = requirement.amount ?? requirement.maxAmountRequired;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw.toString() : null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

export function parseUsdcAmountUsd(amountRaw: string): number | null {
  const trimmed = amountRaw.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const units = Number(trimmed);
    if (!Number.isFinite(units)) return null;
    return units / 10 ** USDC_DECIMALS;
  }

  const decimal = Number(trimmed);
  if (!Number.isFinite(decimal)) return null;
  return decimal;
}

export function normalizeFacilitatorPolicy(value?: string | null): FacilitatorPolicy {
  if (!value) return 'auto';

  const normalized = value.toLowerCase().trim();
  if (normalized === 'prefer-kamiyo' || normalized === 'prefer') return 'prefer-kamiyo';
  if (
    normalized === 'force-kamiyo' ||
    normalized === 'require-kamiyo' ||
    normalized === 'kamiyo-only'
  ) {
    return 'force-kamiyo';
  }
  if (
    normalized === 'disable-kamiyo' ||
    normalized === 'exclude-kamiyo' ||
    normalized === 'non-kamiyo'
  ) {
    return 'disable-kamiyo';
  }
  return 'auto';
}

export function isKamiyoFacilitator(facilitator?: string | null): boolean {
  if (!facilitator) return false;
  const trimmed = facilitator.trim().toLowerCase();
  if (!trimmed) return false;

  try {
    const host = new URL(trimmed).host.toLowerCase();
    return host.includes('kamiyo.ai');
  } catch {
    return trimmed.includes('kamiyo.ai');
  }
}

export function evaluateFacilitatorPolicy(
  facilitator: string | undefined,
  policyInput?: FacilitatorPolicy | string | null
): FacilitatorPolicyDecision {
  const policy =
    typeof policyInput === 'string'
      ? normalizeFacilitatorPolicy(policyInput)
      : policyInput || 'auto';
  const isKamiyo = isKamiyoFacilitator(facilitator);

  if (policy === 'force-kamiyo') {
    if (isKamiyo) {
      return { policy, facilitator, isKamiyo, allowed: true };
    }

    return {
      policy,
      facilitator,
      isKamiyo,
      allowed: false,
      reason: 'Facilitator policy requires Kamiyo facilitator',
    };
  }

  if (policy === 'disable-kamiyo' && isKamiyo) {
    return {
      policy,
      facilitator,
      isKamiyo,
      allowed: false,
      reason: 'Facilitator policy excludes Kamiyo facilitator',
    };
  }

  return { policy, facilitator, isKamiyo, allowed: true };
}

export function withPaymentHeaders(
  paymentHeader: string,
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    ...headers,
    'PAYMENT-SIGNATURE': paymentHeader,
    'X-PAYMENT': paymentHeader,
    'X-PAYMENT-SIGNATURE': paymentHeader,
  };
}
