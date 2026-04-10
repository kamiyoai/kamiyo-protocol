import type {
  Agent,
  AgentSkill,
  AgentPersonality,
  AgentTier,
  CreateAgentRequest,
} from '../types/index.js';
import {
  keiroUsePostgres,
  newEntityId,
  normalizeBoolean,
  parseJsonArray,
  queryKeiro,
  queryKeiroOne,
  toIsoString,
} from './store.js';
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

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    walletAddress: String(row.wallet_address),
    name: String(row.name),
    personality: row.personality as AgentPersonality,
    skills: parseJsonArray(row.skills),
    tier: row.tier as AgentTier,
    creditScore: Number(row.credit_score ?? 0),
    tasksCompleted: Number(row.tasks_completed ?? 0),
    disputeCount: Number(row.dispute_count ?? 0),
    tenureDays: Number(row.tenure_days ?? 0),
    avgQuality: Number(row.avg_quality ?? 0),
    isActive: normalizeBoolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    globalId: typeof row.global_id === 'string' ? row.global_id : undefined,
  };
}

function persistInMemory(agent: Agent) {
  agents.set(agent.id, agent);
  agentsByWallet.set(agent.walletAddress, agent.id);
}

function normalizeSkills(skills: string[]): string[] {
  return Array.from(new Set(skills.map(normalizeSkillTag).filter(Boolean)));
}

export const agentService = {
  async getAll(): Promise<Agent[]> {
    if (!keiroUsePostgres) {
      return Array.from(agents.values());
    }

    const rows = await queryKeiro<Record<string, unknown>>(
      `SELECT *
       FROM keiro_agents
       ORDER BY created_at DESC`
    );
    return rows.map(rowToAgent);
  },

  async getById(id: string): Promise<Agent | undefined> {
    if (!keiroUsePostgres) {
      return agents.get(id);
    }

    const row = await queryKeiroOne<Record<string, unknown>>(
      `SELECT *
       FROM keiro_agents
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return row ? rowToAgent(row) : undefined;
  },

  async getByWallet(walletAddress: string): Promise<Agent | undefined> {
    if (!keiroUsePostgres) {
      const agentId = agentsByWallet.get(walletAddress);
      return agentId ? agents.get(agentId) : undefined;
    }

    const row = await queryKeiroOne<Record<string, unknown>>(
      `SELECT *
       FROM keiro_agents
       WHERE wallet_address = $1
       LIMIT 1`,
      [walletAddress]
    );
    return row ? rowToAgent(row) : undefined;
  },

  async create(request: CreateAgentRequest): Promise<Agent> {
    const existing = await this.getByWallet(request.walletAddress);
    if (existing) {
      throw new Error('Agent already exists for this wallet');
    }

    const agent: Agent = {
      id: newEntityId('agent'),
      walletAddress: request.walletAddress,
      name: request.name.trim(),
      personality: request.personality,
      skills: normalizeSkills(request.skills),
      tier: 'unverified',
      creditScore: 0,
      tasksCompleted: 0,
      disputeCount: 0,
      tenureDays: 0,
      avgQuality: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      globalId: `solana:${request.walletAddress}`,
    };

    if (!keiroUsePostgres) {
      persistInMemory(agent);
      return agent;
    }

    await queryKeiro(
      `INSERT INTO keiro_agents (
         id, wallet_address, name, personality, skills, tier, credit_score,
         tasks_completed, dispute_count, tenure_days, avg_quality, is_active,
         global_id, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5::jsonb, $6, $7,
         $8, $9, $10, $11, $12,
         $13, $14::timestamptz, $14::timestamptz
       )`,
      [
        agent.id,
        agent.walletAddress,
        agent.name,
        agent.personality,
        JSON.stringify(agent.skills),
        agent.tier,
        agent.creditScore,
        agent.tasksCompleted,
        agent.disputeCount,
        agent.tenureDays,
        agent.avgQuality,
        agent.isActive,
        agent.globalId ?? null,
        agent.createdAt,
      ]
    );

    return agent;
  },

  async update(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    const current = await this.getById(id);
    if (!current) return null;

    const normalizedSkills = updates.skills ? normalizeSkills(updates.skills) : current.skills;
    const creditScore =
      updates.creditScore !== undefined ? Math.max(0, Math.min(100, Math.round(updates.creditScore))) : current.creditScore;

    const updated: Agent = {
      ...current,
      ...updates,
      id: current.id,
      walletAddress: current.walletAddress,
      skills: normalizedSkills,
      creditScore,
      tier: calculateTier(creditScore),
      name: updates.name?.trim() || current.name,
    };

    if (!keiroUsePostgres) {
      persistInMemory(updated);
      return updated;
    }

    await queryKeiro(
      `UPDATE keiro_agents
       SET
         name = $2,
         personality = $3,
         skills = $4::jsonb,
         tier = $5,
         credit_score = $6,
         tasks_completed = $7,
         dispute_count = $8,
         tenure_days = $9,
         avg_quality = $10,
         is_active = $11,
         global_id = $12,
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        updated.name,
        updated.personality,
        JSON.stringify(updated.skills),
        updated.tier,
        updated.creditScore,
        updated.tasksCompleted,
        updated.disputeCount,
        updated.tenureDays,
        updated.avgQuality,
        updated.isActive,
        updated.globalId ?? null,
      ]
    );

    return updated;
  },

  async setActive(id: string, isActive: boolean): Promise<Agent | null> {
    return this.update(id, { isActive });
  },

  async recordTaskCompletion(
    id: string,
    qualityScore: number,
    disputed = false
  ): Promise<Agent | null> {
    const agent = await this.getById(id);
    if (!agent) return null;

    const clampedQuality = Math.max(0, Math.min(100, qualityScore));
    const taskCount = agent.tasksCompleted + 1;
    const disputes = disputed ? agent.disputeCount + 1 : agent.disputeCount;
    const avgQuality = Math.round(
      (agent.avgQuality * agent.tasksCompleted + clampedQuality) / taskCount
    );

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

  async incrementTenure(id: string): Promise<Agent | null> {
    const agent = await this.getById(id);
    if (!agent) return null;
    return this.update(id, { tenureDays: agent.tenureDays + 1 });
  },

  async delete(id: string): Promise<boolean> {
    const agent = await this.getById(id);
    if (!agent) return false;

    if (!keiroUsePostgres) {
      agentsByWallet.delete(agent.walletAddress);
      agents.delete(id);
      return true;
    }

    await queryKeiro(`DELETE FROM keiro_agents WHERE id = $1`, [id]);
    return true;
  },

  async getLeaderboard(limit = 10): Promise<Agent[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));

    if (!keiroUsePostgres) {
      return Array.from(agents.values())
        .filter((agent) => agent.isActive)
        .sort((a, b) => b.creditScore - a.creditScore)
        .slice(0, safeLimit);
    }

    const rows = await queryKeiro<Record<string, unknown>>(
      `SELECT *
       FROM keiro_agents
       WHERE is_active = TRUE
       ORDER BY credit_score DESC, created_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return rows.map(rowToAgent);
  },
};
