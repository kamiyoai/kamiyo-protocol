import { Hono } from 'hono';
import { agentService } from '../services/agents.js';

export const reputationRouter = new Hono();

reputationRouter.get('/agent/:agentId', (c) => {
  const agentId = c.req.param('agentId');

  const agent = agentService.getById(agentId);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const qualityComponent = agent.avgQuality * 0.4;
  const reliabilityComponent = Math.min(agent.tasksCompleted / 10, 1) * 20;
  const disputeRate = agent.tasksCompleted > 0 ? agent.disputeCount / agent.tasksCompleted : 0;
  const disputeComponent = (1 - disputeRate) * 15;
  const trustComponent = 7.5;
  const tenureComponent = Math.min(agent.tenureDays / 30, 1) * 10;

  const reputation = {
    agentId: agent.id,
    globalId: agent.globalId,
    creditScore: agent.creditScore,
    tier: agent.tier,
    components: {
      taskQuality: {
        score: Math.round(qualityComponent),
        weight: 40,
        raw: agent.avgQuality,
        description: 'Average quality rating from completed tasks',
      },
      reliability: {
        score: Math.round(reliabilityComponent),
        weight: 20,
        raw: agent.tasksCompleted,
        description: 'Task completion consistency',
      },
      disputeRecord: {
        score: Math.round(disputeComponent),
        weight: 15,
        raw: disputeRate,
        description: 'Low dispute rate = higher score',
      },
      peerTrust: {
        score: Math.round(trustComponent),
        weight: 15,
        raw: 0.5,
        description: 'Trust attestations from other agents',
      },
      tenure: {
        score: Math.round(tenureComponent),
        weight: 10,
        raw: agent.tenureDays,
        description: 'Days active on the network',
      },
    },
    stats: {
      tasksCompleted: agent.tasksCompleted,
      disputeCount: agent.disputeCount,
      tenureDays: agent.tenureDays,
      avgQuality: agent.avgQuality,
    },
    tierProgress: getTierProgress(agent.creditScore, agent.tier),
  };

  return c.json({ reputation });
});

reputationRouter.get('/tiers', (c) => {
  const tiers = {
    unverified: {
      minScore: 0,
      maxScore: 19,
      benefits: ['Access to basic jobs', 'Build initial reputation'],
    },
    bronze: {
      minScore: 20,
      maxScore: 39,
      benefits: ['Higher paying jobs', 'Trusted status indicator'],
    },
    silver: {
      minScore: 40,
      maxScore: 59,
      benefits: ['Premium job access', 'Priority matching', 'Lower dispute rate threshold'],
    },
    gold: {
      minScore: 60,
      maxScore: 79,
      benefits: ['Exclusive high-value jobs', 'Oracle eligibility', 'Reputation badges'],
    },
    platinum: {
      minScore: 80,
      maxScore: 100,
      benefits: ['Maximum earning potential', 'Network governance rights', 'Featured agent status'],
    },
  };

  return c.json({ tiers });
});

function getTierProgress(creditScore: number, currentTier: string) {
  const thresholds: Record<string, { current: number; next: number | null; nextTier: string | null }> = {
    unverified: { current: 0, next: 20, nextTier: 'bronze' },
    bronze: { current: 20, next: 40, nextTier: 'silver' },
    silver: { current: 40, next: 60, nextTier: 'gold' },
    gold: { current: 60, next: 80, nextTier: 'platinum' },
    platinum: { current: 80, next: null, nextTier: null },
  };

  const tier = thresholds[currentTier];
  if (!tier || !tier.next) {
    return {
      currentTier,
      nextTier: null,
      pointsToNext: 0,
      progress: 100,
    };
  }

  const range = tier.next - tier.current;
  const progress = creditScore - tier.current;
  const percentage = Math.min(100, Math.max(0, (progress / range) * 100));

  return {
    currentTier,
    nextTier: tier.nextTier,
    pointsToNext: Math.max(0, tier.next - creditScore),
    progress: Math.round(percentage),
  };
}
