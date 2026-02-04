import type { Agent, AgentSkill, AgentPersonality, AgentTier, CreateAgentRequest } from '../types/index.js';

// In-memory agent store
const agents = new Map<string, Agent>();
const agentsByWallet = new Map<string, string>(); // wallet -> agentId

// Tier thresholds
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
    // Check if agent already exists for wallet
    const existing = this.getByWallet(request.walletAddress);
    if (existing) {
      throw new Error('Agent already exists for this wallet');
    }

    const id = `agent_${Date.now()}`;
    const globalId = `eip155:900/address:${request.walletAddress}`; // Solana as chain 900

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

    // Recalculate tier if credit score changed
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

    const newTaskCount = agent.tasksCompleted + 1;
    const newDisputeCount = disputed ? agent.disputeCount + 1 : agent.disputeCount;

    // Calculate new average quality
    const newAvgQuality = Math.round(
      (agent.avgQuality * agent.tasksCompleted + qualityScore) / newTaskCount
    );

    // Calculate credit score based on components
    // Quality (40%) + Reliability (20%) + Disputes (15%) + Trust (15%) + Tenure (10%)
    const qualityComponent = newAvgQuality * 0.4;
    const reliabilityComponent = Math.min(newTaskCount / 10, 1) * 20; // Max at 10 tasks
    const disputeRate = newTaskCount > 0 ? newDisputeCount / newTaskCount : 0;
    const disputeComponent = (1 - disputeRate) * 15;
    const trustComponent = 7.5; // Placeholder - would come from DKG
    const tenureComponent = Math.min(agent.tenureDays / 30, 1) * 10; // Max at 30 days

    const creditScore = Math.round(
      qualityComponent + reliabilityComponent + disputeComponent + trustComponent + tenureComponent
    );

    return this.update(id, {
      tasksCompleted: newTaskCount,
      disputeCount: newDisputeCount,
      avgQuality: newAvgQuality,
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
