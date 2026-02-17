import type { MeishiMandate } from '@kamiyo/meishi';

export function microUsdToCents(microUsd: bigint): number {
  if (microUsd < 0n) throw new Error('microUsd must be >= 0');
  const cents = microUsd / 10_000n;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('microUsd too large to convert safely');
  }
  return Number(cents);
}

export function mandateSingleSpendLimitMicroUsd(mandate: MeishiMandate): bigint {
  const value = mandate.spendingLimitUsd.toString(10);
  try {
    return BigInt(value);
  } catch {
    throw new Error('Invalid mandate.spendingLimitUsd');
  }
}

export function mandateSingleSpendLimitCents(mandate: MeishiMandate): number {
  return microUsdToCents(mandateSingleSpendLimitMicroUsd(mandate));
}

export function mandateHumanApprovalThresholdCents(mandate: MeishiMandate): number {
  const value = mandate.requiresHumanApprovalAbove.toString(10);
  try {
    return microUsdToCents(BigInt(value));
  } catch {
    throw new Error('Invalid mandate.requiresHumanApprovalAbove');
  }
}
