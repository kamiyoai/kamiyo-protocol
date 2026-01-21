import { BlindfoldClient } from './client';
import {
  AgentCard,
  AgentCardFunding,
  AgentBudget,
  FundAgentRequest,
  CardTier,
  PaymentResponse,
  CARD_TIERS,
} from './types';

export interface AgentCardStorage {
  getCard(agentPk: string): Promise<AgentCard | null>;
  saveCard(card: AgentCard): Promise<void>;
  getBudget(agentPk: string): Promise<AgentBudget | null>;
  saveBudget(budget: AgentBudget): Promise<void>;
  addFunding(funding: AgentCardFunding): Promise<void>;
  getFundingHistory(agentPk: string): Promise<AgentCardFunding[]>;
}

// In-memory storage for testing/simple deployments
export class InMemoryAgentCardStorage implements AgentCardStorage {
  private cards = new Map<string, AgentCard>();
  private budgets = new Map<string, AgentBudget>();
  private fundings = new Map<string, AgentCardFunding[]>();

  async getCard(agentPk: string): Promise<AgentCard | null> {
    return this.cards.get(agentPk) ?? null;
  }

  async saveCard(card: AgentCard): Promise<void> {
    this.cards.set(card.agentPk, card);
  }

  async getBudget(agentPk: string): Promise<AgentBudget | null> {
    return this.budgets.get(agentPk) ?? null;
  }

  async saveBudget(budget: AgentBudget): Promise<void> {
    this.budgets.set(budget.agentPk, budget);
  }

  async addFunding(funding: AgentCardFunding): Promise<void> {
    const existing = this.fundings.get(funding.agentPk) ?? [];
    existing.push(funding);
    this.fundings.set(funding.agentPk, existing);
  }

  async getFundingHistory(agentPk: string): Promise<AgentCardFunding[]> {
    return this.fundings.get(agentPk) ?? [];
  }
}

export class AgentCardManager {
  private client: BlindfoldClient;
  private storage: AgentCardStorage;
  private emailDomain: string;

  constructor(
    client: BlindfoldClient,
    storage: AgentCardStorage,
    emailDomain = 'kamiyo.ai'
  ) {
    this.client = client;
    this.storage = storage;
    this.emailDomain = emailDomain;
  }

  // Generate a deterministic email for an agent
  private generateAgentEmail(agentPk: string): string {
    const shortPk = agentPk.slice(0, 8).toLowerCase();
    return `agent-${shortPk}@${this.emailDomain}`;
  }

  // Register an agent for a Blindfold card
  async registerAgent(
    agentPk: string,
    options: {
      email?: string;
      tier?: CardTier;
      budgetLimit?: number;
    } = {}
  ): Promise<AgentCard> {
    const existing = await this.storage.getCard(agentPk);
    if (existing) {
      return existing;
    }

    const email = options.email ?? this.generateAgentEmail(agentPk);
    const tier = options.tier ?? 'basic';
    const tierConfig = CARD_TIERS.find((t) => t.tier === tier);
    const budgetLimit = options.budgetLimit ?? tierConfig?.limit ?? 100;

    const card: AgentCard = {
      agentPk,
      email,
      tier,
      budgetLimit,
      totalFunded: 0,
      createdAt: Date.now(),
    };

    await this.storage.saveCard(card);

    // Initialize budget tracking
    const now = new Date();
    const budget: AgentBudget = {
      agentPk,
      dailyLimit: budgetLimit,
      monthlyLimit: budgetLimit * 30,
      totalLimit: budgetLimit * 365,
      usedToday: 0,
      usedThisMonth: 0,
      usedTotal: 0,
      lastResetDay: now.getDate(),
      lastResetMonth: now.getMonth(),
    };
    await this.storage.saveBudget(budget);

    return card;
  }

  // Fund an agent's card
  async fundAgent(request: FundAgentRequest): Promise<{
    card: AgentCard;
    payment: PaymentResponse;
    funding: AgentCardFunding;
  }> {
    let card = await this.storage.getCard(request.agentPk);

    if (!card) {
      card = await this.registerAgent(request.agentPk, {
        email: request.email,
        tier: request.tier,
      });
    }

    // Check budget limits
    const budget = await this.storage.getBudget(request.agentPk);
    if (budget) {
      this.resetBudgetIfNeeded(budget);

      if (budget.usedToday + request.amount > budget.dailyLimit) {
        throw new Error(`Funding would exceed daily limit of ${budget.dailyLimit}`);
      }
      if (budget.usedThisMonth + request.amount > budget.monthlyLimit) {
        throw new Error(`Funding would exceed monthly limit of ${budget.monthlyLimit}`);
      }
    }

    // Create the payment via Blindfold
    const payment = await this.client.createPayment({
      amount: request.amount,
      currency: request.currency,
      recipientEmail: card.email,
      recipientName: `KAMIYO Agent ${request.agentPk.slice(0, 8)}`,
      requestedTier: card.tier,
    });

    // Record the funding
    const funding: AgentCardFunding = {
      agentPk: request.agentPk,
      amount: request.amount,
      currency: request.currency,
      paymentId: payment.paymentId,
      status: payment.status,
      fundedAt: Date.now(),
    };
    await this.storage.addFunding(funding);

    // Update card totals
    card.totalFunded += request.amount;
    card.lastFundedAt = Date.now();
    await this.storage.saveCard(card);

    // Update budget usage
    if (budget) {
      budget.usedToday += request.amount;
      budget.usedThisMonth += request.amount;
      budget.usedTotal += request.amount;
      await this.storage.saveBudget(budget);
    }

    return { card, payment, funding };
  }

  // Get agent card info
  async getAgent(agentPk: string): Promise<{
    card: AgentCard | null;
    budget: AgentBudget | null;
    fundingHistory: AgentCardFunding[];
  }> {
    const card = await this.storage.getCard(agentPk);
    const budget = await this.storage.getBudget(agentPk);
    const fundingHistory = await this.storage.getFundingHistory(agentPk);

    if (budget) {
      this.resetBudgetIfNeeded(budget);
    }

    return { card, budget, fundingHistory };
  }

  // Update budget limits
  async updateBudget(
    agentPk: string,
    limits: {
      dailyLimit?: number;
      monthlyLimit?: number;
      totalLimit?: number;
    }
  ): Promise<AgentBudget | null> {
    const budget = await this.storage.getBudget(agentPk);
    if (!budget) return null;

    if (limits.dailyLimit !== undefined) budget.dailyLimit = limits.dailyLimit;
    if (limits.monthlyLimit !== undefined) budget.monthlyLimit = limits.monthlyLimit;
    if (limits.totalLimit !== undefined) budget.totalLimit = limits.totalLimit;

    await this.storage.saveBudget(budget);
    return budget;
  }

  // Check if agent can be funded
  async canFund(agentPk: string, amount: number): Promise<{
    allowed: boolean;
    reason?: string;
    remainingDaily: number;
    remainingMonthly: number;
  }> {
    const budget = await this.storage.getBudget(agentPk);

    if (!budget) {
      // No budget means no agent registered - can fund after registration
      return {
        allowed: true,
        remainingDaily: amount,
        remainingMonthly: amount,
      };
    }

    this.resetBudgetIfNeeded(budget);

    const remainingDaily = budget.dailyLimit - budget.usedToday;
    const remainingMonthly = budget.monthlyLimit - budget.usedThisMonth;

    if (amount > remainingDaily) {
      return {
        allowed: false,
        reason: `Exceeds daily limit. Remaining: ${remainingDaily}`,
        remainingDaily,
        remainingMonthly,
      };
    }

    if (amount > remainingMonthly) {
      return {
        allowed: false,
        reason: `Exceeds monthly limit. Remaining: ${remainingMonthly}`,
        remainingDaily,
        remainingMonthly,
      };
    }

    return { allowed: true, remainingDaily, remainingMonthly };
  }

  private resetBudgetIfNeeded(budget: AgentBudget): void {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();

    if (currentDay !== budget.lastResetDay) {
      budget.usedToday = 0;
      budget.lastResetDay = currentDay;
    }

    if (currentMonth !== budget.lastResetMonth) {
      budget.usedThisMonth = 0;
      budget.lastResetMonth = currentMonth;
    }
  }
}
