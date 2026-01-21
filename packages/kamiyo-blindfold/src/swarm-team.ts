import { BlindfoldClient } from './client';
import {
  SwarmTeam,
  SwarmTeamMember,
  SwarmTeamBudget,
  SwarmTeamDraw,
  FundTeamRequest,
  DrawFromTeamRequest,
  PaymentResponse,
  CardTier,
} from './types';

export interface SwarmTeamStorage {
  getTeam(teamId: string): Promise<SwarmTeam | null>;
  saveTeam(team: SwarmTeam): Promise<void>;
  addDraw(draw: SwarmTeamDraw): Promise<void>;
  getDrawHistory(teamId: string): Promise<SwarmTeamDraw[]>;
  getAgentDraws(teamId: string, agentPk: string): Promise<SwarmTeamDraw[]>;
}

export class InMemorySwarmTeamStorage implements SwarmTeamStorage {
  private teams = new Map<string, SwarmTeam>();
  private draws = new Map<string, SwarmTeamDraw[]>();

  async getTeam(teamId: string): Promise<SwarmTeam | null> {
    return this.teams.get(teamId) ?? null;
  }

  async saveTeam(team: SwarmTeam): Promise<void> {
    this.teams.set(team.teamId, team);
  }

  async addDraw(draw: SwarmTeamDraw): Promise<void> {
    const existing = this.draws.get(draw.teamId) ?? [];
    existing.push(draw);
    this.draws.set(draw.teamId, existing);
  }

  async getDrawHistory(teamId: string): Promise<SwarmTeamDraw[]> {
    return this.draws.get(teamId) ?? [];
  }

  async getAgentDraws(teamId: string, agentPk: string): Promise<SwarmTeamDraw[]> {
    const all = this.draws.get(teamId) ?? [];
    return all.filter((d) => d.agentPk === agentPk);
  }
}

export interface SwarmTeamConfig {
  client: BlindfoldClient;
  storage: SwarmTeamStorage;
  emailDomain?: string;
}

export class SwarmTeamManager {
  private client: BlindfoldClient;
  private storage: SwarmTeamStorage;
  private emailDomain: string;

  constructor(config: SwarmTeamConfig) {
    this.client = config.client;
    this.storage = config.storage;
    this.emailDomain = config.emailDomain ?? 'kamiyo.ai';
  }

  private generateTeamId(): string {
    return `team_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateAgentEmail(agentPk: string, teamId: string): string {
    const shortPk = agentPk.slice(0, 6).toLowerCase();
    const shortTeam = teamId.slice(5, 11);
    return `agent-${shortPk}-${shortTeam}@${this.emailDomain}`;
  }

  async createTeam(
    name: string,
    currency: 'SOL' | 'USDC' | 'USDT',
    options: {
      dailyLimit?: number;
      initialMembers?: Array<{
        agentPk: string;
        role?: 'leader' | 'member';
        drawLimit?: number;
      }>;
    } = {}
  ): Promise<SwarmTeam> {
    const teamId = this.generateTeamId();
    const now = Date.now();

    const members: SwarmTeamMember[] = (options.initialMembers ?? []).map((m) => ({
      agentPk: m.agentPk,
      role: m.role ?? 'member',
      drawLimit: m.drawLimit ?? 100,
      drawn: 0,
    }));

    const team: SwarmTeam = {
      teamId,
      name,
      members,
      budget: {
        total: 0,
        available: 0,
        currency,
        dailyLimit: options.dailyLimit ?? 1000,
        usedToday: 0,
        lastResetDay: new Date().getDate(),
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.saveTeam(team);
    return team;
  }

  async addMember(
    teamId: string,
    agentPk: string,
    options: {
      role?: 'leader' | 'member';
      drawLimit?: number;
    } = {}
  ): Promise<SwarmTeam> {
    const team = await this.storage.getTeam(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const existing = team.members.find((m) => m.agentPk === agentPk);
    if (existing) {
      throw new Error(`Agent ${agentPk} already in team`);
    }

    team.members.push({
      agentPk,
      role: options.role ?? 'member',
      drawLimit: options.drawLimit ?? 100,
      drawn: 0,
    });
    team.updatedAt = Date.now();

    await this.storage.saveTeam(team);
    return team;
  }

  async removeMember(teamId: string, agentPk: string): Promise<SwarmTeam> {
    const team = await this.storage.getTeam(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const idx = team.members.findIndex((m) => m.agentPk === agentPk);
    if (idx === -1) {
      throw new Error(`Agent ${agentPk} not in team`);
    }

    team.members.splice(idx, 1);
    team.updatedAt = Date.now();

    await this.storage.saveTeam(team);
    return team;
  }

  async updateMemberLimit(
    teamId: string,
    agentPk: string,
    drawLimit: number
  ): Promise<SwarmTeam> {
    const team = await this.storage.getTeam(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const member = team.members.find((m) => m.agentPk === agentPk);
    if (!member) {
      throw new Error(`Agent ${agentPk} not in team`);
    }

    member.drawLimit = drawLimit;
    team.updatedAt = Date.now();

    await this.storage.saveTeam(team);
    return team;
  }

  async fundTeam(request: FundTeamRequest): Promise<{
    team: SwarmTeam;
    amount: number;
  }> {
    const team = await this.storage.getTeam(request.teamId);
    if (!team) {
      throw new Error(`Team ${request.teamId} not found`);
    }

    if (request.currency !== team.budget.currency) {
      throw new Error(
        `Currency mismatch: team uses ${team.budget.currency}, got ${request.currency}`
      );
    }

    team.budget.total += request.amount;
    team.budget.available += request.amount;
    team.updatedAt = Date.now();

    await this.storage.saveTeam(team);
    return { team, amount: request.amount };
  }

  async draw(request: DrawFromTeamRequest): Promise<{
    team: SwarmTeam;
    draw: SwarmTeamDraw;
    payment: PaymentResponse;
  }> {
    const team = await this.storage.getTeam(request.teamId);
    if (!team) {
      throw new Error(`Team ${request.teamId} not found`);
    }

    const member = team.members.find((m) => m.agentPk === request.agentPk);
    if (!member) {
      throw new Error(`Agent ${request.agentPk} not in team ${request.teamId}`);
    }

    this.resetBudgetIfNeeded(team.budget);

    // Check team daily limit
    if (team.budget.usedToday + request.amount > team.budget.dailyLimit) {
      throw new Error(
        `Team daily limit exceeded. Available: ${team.budget.dailyLimit - team.budget.usedToday}`
      );
    }

    // Check team available funds
    if (request.amount > team.budget.available) {
      throw new Error(
        `Insufficient team funds. Available: ${team.budget.available}`
      );
    }

    // Check member draw limit
    if (member.drawn + request.amount > member.drawLimit) {
      throw new Error(
        `Member draw limit exceeded. Remaining: ${member.drawLimit - member.drawn}`
      );
    }

    // Create payment via Blindfold
    const email = this.generateAgentEmail(request.agentPk, request.teamId);
    const payment = await this.client.createPayment({
      amount: request.amount,
      currency: team.budget.currency,
      recipientEmail: email,
      recipientName: `KAMIYO Agent ${request.agentPk.slice(0, 8)}`,
    });

    // Update team budget
    team.budget.available -= request.amount;
    team.budget.usedToday += request.amount;

    // Update member drawn amount
    member.drawn += request.amount;
    member.lastDrawAt = Date.now();

    team.updatedAt = Date.now();
    await this.storage.saveTeam(team);

    // Record the draw
    const draw: SwarmTeamDraw = {
      teamId: request.teamId,
      agentPk: request.agentPk,
      amount: request.amount,
      paymentId: payment.paymentId,
      purpose: request.purpose,
      drawnAt: Date.now(),
    };
    await this.storage.addDraw(draw);

    return { team, draw, payment };
  }

  async canDraw(
    teamId: string,
    agentPk: string,
    amount: number
  ): Promise<{
    allowed: boolean;
    reason?: string;
    teamAvailable: number;
    teamDailyRemaining: number;
    memberRemaining: number;
  }> {
    const team = await this.storage.getTeam(teamId);
    if (!team) {
      return {
        allowed: false,
        reason: 'Team not found',
        teamAvailable: 0,
        teamDailyRemaining: 0,
        memberRemaining: 0,
      };
    }

    const member = team.members.find((m) => m.agentPk === agentPk);
    if (!member) {
      return {
        allowed: false,
        reason: 'Agent not in team',
        teamAvailable: team.budget.available,
        teamDailyRemaining: team.budget.dailyLimit - team.budget.usedToday,
        memberRemaining: 0,
      };
    }

    this.resetBudgetIfNeeded(team.budget);

    const teamDailyRemaining = team.budget.dailyLimit - team.budget.usedToday;
    const memberRemaining = member.drawLimit - member.drawn;

    if (amount > team.budget.available) {
      return {
        allowed: false,
        reason: `Insufficient team funds. Available: ${team.budget.available}`,
        teamAvailable: team.budget.available,
        teamDailyRemaining,
        memberRemaining,
      };
    }

    if (amount > teamDailyRemaining) {
      return {
        allowed: false,
        reason: `Team daily limit exceeded. Remaining: ${teamDailyRemaining}`,
        teamAvailable: team.budget.available,
        teamDailyRemaining,
        memberRemaining,
      };
    }

    if (amount > memberRemaining) {
      return {
        allowed: false,
        reason: `Member draw limit exceeded. Remaining: ${memberRemaining}`,
        teamAvailable: team.budget.available,
        teamDailyRemaining,
        memberRemaining,
      };
    }

    return {
      allowed: true,
      teamAvailable: team.budget.available,
      teamDailyRemaining,
      memberRemaining,
    };
  }

  async getTeam(teamId: string): Promise<{
    team: SwarmTeam | null;
    draws: SwarmTeamDraw[];
  }> {
    const team = await this.storage.getTeam(teamId);
    if (!team) {
      return { team: null, draws: [] };
    }

    this.resetBudgetIfNeeded(team.budget);
    const draws = await this.storage.getDrawHistory(teamId);

    return { team, draws };
  }

  async getAgentTeamStatus(
    teamId: string,
    agentPk: string
  ): Promise<{
    isMember: boolean;
    member?: SwarmTeamMember;
    draws: SwarmTeamDraw[];
    canDrawAmount: number;
  }> {
    const team = await this.storage.getTeam(teamId);
    if (!team) {
      return { isMember: false, draws: [], canDrawAmount: 0 };
    }

    const member = team.members.find((m) => m.agentPk === agentPk);
    if (!member) {
      return { isMember: false, draws: [], canDrawAmount: 0 };
    }

    this.resetBudgetIfNeeded(team.budget);
    const draws = await this.storage.getAgentDraws(teamId, agentPk);

    const teamDailyRemaining = team.budget.dailyLimit - team.budget.usedToday;
    const memberRemaining = member.drawLimit - member.drawn;
    const canDrawAmount = Math.min(
      team.budget.available,
      teamDailyRemaining,
      memberRemaining
    );

    return {
      isMember: true,
      member,
      draws,
      canDrawAmount: Math.max(0, canDrawAmount),
    };
  }

  async resetMemberDrawn(teamId: string, agentPk?: string): Promise<SwarmTeam> {
    const team = await this.storage.getTeam(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    if (agentPk) {
      const member = team.members.find((m) => m.agentPk === agentPk);
      if (member) {
        member.drawn = 0;
      }
    } else {
      for (const member of team.members) {
        member.drawn = 0;
      }
    }

    team.updatedAt = Date.now();
    await this.storage.saveTeam(team);
    return team;
  }

  private resetBudgetIfNeeded(budget: SwarmTeamBudget): void {
    const currentDay = new Date().getDate();
    if (currentDay !== budget.lastResetDay) {
      budget.usedToday = 0;
      budget.lastResetDay = currentDay;
    }
  }
}
