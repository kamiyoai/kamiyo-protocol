export interface ComplianceYieldBand {
  minScore: number;
  maxScore: number;
  multiplier: number;
  label: string;
}

export const DEFAULT_COMPLIANCE_YIELD_BANDS: ComplianceYieldBand[] = [
  { minScore: 90, maxScore: 100, multiplier: 1.5, label: 'elite' },
  { minScore: 80, maxScore: 89, multiplier: 1.3, label: 'strong' },
  { minScore: 70, maxScore: 79, multiplier: 1.15, label: 'good' },
  { minScore: 50, maxScore: 69, multiplier: 1.0, label: 'base' },
  { minScore: 30, maxScore: 49, multiplier: 0.8, label: 'watch' },
  { minScore: 0, maxScore: 29, multiplier: 0.5, label: 'penalized' },
];

export interface ComplianceRewardOutcome {
  multiplier: number;
  band: string;
}

export function complianceRewardMultiplier(
  score: number,
  bands: ComplianceYieldBand[] = DEFAULT_COMPLIANCE_YIELD_BANDS
): ComplianceRewardOutcome {
  const bounded = Math.max(0, Math.min(100, score));
  for (const band of bands) {
    if (bounded >= band.minScore && bounded <= band.maxScore) {
      return { multiplier: band.multiplier, band: band.label };
    }
  }
  return { multiplier: 1, band: 'base' };
}
