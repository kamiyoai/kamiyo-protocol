import type { Agent, AgentSkill, AgentPersonality, AgentTier, CreateAgentRequest } from '../types/index.js';
import { normalizeSkillTag } from './skill-tags.js';

const agents = new Map<string, Agent>();
const agentsByWallet = new Map<string, string>();

const TIER_THRESHOLDS: Record<AgentTier, number> = {
  unverified: 0,
  bronze: 20,
  silver: 40,
  gold: 60,
  platinum: 80,
};

function calculateTier(creditScore: number): AgentTier {
  if (creditScore >= TIER_THRESHOLDS.platinum) return 'platinum';
  if (creditScore >= TIER_THRESHOLDS.gold) return 'gold';
  if (creditScore >= TIER_THRESHOLDS.silver) return 'silver';
  if (creditScore >= TIER_THRESHOLDS.bronze) return 'bronze';
  return 'unverified';
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const agentService = {
  getAll(): Agent[] {
    return Array.from(agents.values());
  },

  getById(id: string): Agent | undefined {
    return agents.get(id);
  },

  getByWallet(walletAddress: string): Agent | undefined {
    const agentId = agentsByWallet.get(walletAddress);
    if (!agentId) return undefined;
    return agents.get(agentId);
  },

  create(request: CreateAgentRequest): Agent {
    if (this.getByWallet(request.walletAddress)) {
      throw new Error('Agent already exists for this wallet');
    }

    const id = newId('agent');
    const skills = Array.from(
      new Set(
        request.skills.map(normalizeSkillTag).filter(Boolean)
      )
    );
    const globalId = `solana:${request.walletAddress}`;

    const agent: Agent = {
      id,
      walletAddress: request.walletAddress,
      name: request.name.trim(),
      personality: request.personality,
      skills,
      tier: 'unverified',
      creditScore: 0,
      tasksCompleted: 0,
      disputeCount: 0,
      tenureDays: 0,
      avgQuality: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      globalId,
    };

    agents.set(id, agent);
    agentsByWallet.set(request.walletAddress, id);

    return agent;
  },

  update(id: string, updates: Partial<Agent>): Agent | null {
    const current = agents.get(id);
    if (!current) return null;

    const updated: Agent = {
      ...current,
      ...updates,
      id: current.id,
      walletAddress: current.walletAddress,
    };

    if (updates.creditScore !== undefined) {
      updated.tier = calculateTier(updated.creditScore);
    }

    agents.set(id, updated);
    return updated;
  },

  setActive(id: string, isActive: boolean): Agent | null {
    return this.update(id, { isActive });
  },

  recordTaskCompletion(
    id: string,
    qualityScore: number,
    disputed: boolean = false
  ): Agent | null {
    const agent = agents.get(id);
    if (!agent) return null;

    const clampedQuality = Math.max(0, Math.min(100, qualityScore));
    const taskCount = agent.tasksCompleted + 1;
    const disputes = disputed ? agent.disputeCount + 1 : agent.disputeCount;
    const avgQuality = Math.round((agent.avgQuality * agent.tasksCompleted + clampedQuality) / taskCount);

    const creditScore = Math.round(
      avgQuality * 0.4 +
        Math.min(taskCount / 10, 1) * 20 +
        (1 - (taskCount > 0 ? disputes / taskCount : 0)) * 15 +
        7.5 +
        Math.min(agent.tenureDays / 30, 1) * 10
    );

    return this.update(id, {
      tasksCompleted: taskCount,
      disputeCount: disputes,
      avgQuality,
      creditScore: Math.min(100, creditScore),
    });
  },

  incrementTenure(id: string): Agent | null {
    const agent = agents.get(id);
    if (!agent) return null;
    return this.update(id, { tenureDays: agent.tenureDays + 1 });
  },

  delete(id: string): boolean {
    const agent = agents.get(id);
    if (!agent) return false;

    agentsByWallet.delete(agent.walletAddress);
    agents.delete(id);
    return true;
  },

  getLeaderboard(limit: number = 10): Agent[] {
    return this.getAll()
      .filter((a) => a.isActive)
      .sort((a, b) => b.creditScore - a.creditScore)
      .slice(0, limit);
  },
};
