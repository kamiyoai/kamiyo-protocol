import { useAgentStore, AgentTier } from '../stores/agent';
import { TIER_THRESHOLDS } from '../lib/constants';

export function useAgent() {
  const store = useAgentStore();

  const tierFromScore = (score: number): AgentTier => {
    if (score >= TIER_THRESHOLDS.platinum) return 'platinum';
    if (score >= TIER_THRESHOLDS.gold) return 'gold';
    if (score >= TIER_THRESHOLDS.silver) return 'silver';
    if (score >= TIER_THRESHOLDS.bronze) return 'bronze';
    return 'unverified';
  };

  const pointsToNextTier = (): number | null => {
    if (!store.agent) return null;

    const { creditScore, tier } = store.agent;
    const tiers: AgentTier[] = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];
    const currentIndex = tiers.indexOf(tier);

    if (currentIndex >= tiers.length - 1) return null;

    const nextTier = tiers[currentIndex + 1];
    const threshold = TIER_THRESHOLDS[nextTier];

    return Math.max(0, threshold - creditScore);
  };

  const tierLabel = (tier: AgentTier): string => {
    const labels: Record<AgentTier, string> = {
      unverified: 'Unverified',
      bronze: 'Bronze',
      silver: 'Silver',
      gold: 'Gold',
      platinum: 'Platinum',
    };
    return labels[tier];
  };

  const tierColor = (tier: AgentTier): string => {
    const colors: Record<AgentTier, string> = {
      unverified: '#6b7280',
      bronze: '#cd7f32',
      silver: '#c0c0c0',
      gold: '#ffd700',
      platinum: '#e5e4e2',
    };
    return colors[tier];
  };

  return {
    ...store,
    tierFromScore,
    pointsToNextTier,
    tierLabel,
    tierColor,
    hasAgent: !!store.agent,
  };
}
