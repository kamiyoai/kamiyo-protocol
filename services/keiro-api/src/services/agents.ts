import type { Agent, AgentSkill, AgentPersonality, AgentTier, CreateAgentRequest } from '../types/index.js';

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

    const id = `agent_${Date.now()}`;
    const globalId = `eip155:900/address:${request.walletAddress}`;

    const agent: Agent = {
      id,
      walletAddress: request.walletAddress,
      name: request.name,
      personality: request.personality,
      skills: request.skills,
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
    const agent = agents.get(id);
    if (!agent) return null;

    const updatedAgent: Agent = {
      ...agent,
      ...updates,
      id: agent.id, // Prevent id override
      walletAddress: agent.walletAddress, // Prevent wallet override
    };

    if (updates.creditScore !== undefined) {
      updatedAgent.tier = calculateTier(updatedAgent.creditScore);
    }

    agents.set(id, updatedAgent);
    return updatedAgent;
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

    const taskCount = agent.tasksCompleted + 1;
    const disputes = disputed ? agent.disputeCount + 1 : agent.disputeCount;
    const avgQuality = Math.round((agent.avgQuality * agent.tasksCompleted + qualityScore) / taskCount);

    // Quality 40%, reliability 20%, disputes 15%, trust 15%, tenure 10%
    const creditScore = Math.round(
      avgQuality * 0.4 +
      Math.min(taskCount / 10, 1) * 20 +
      (1 - (taskCount > 0 ? disputes / taskCount : 0)) * 15 +
      7.5 + // trust placeholder
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

  // Get leaderboard by credit score
  getLeaderboard(limit: number = 10): Agent[] {
    return this.getAll()
      .filter(a => a.isActive)
      .sort((a, b) => b.creditScore - a.creditScore)
      .slice(0, limit);
  },
};
