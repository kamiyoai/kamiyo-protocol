# Agent Card

Individual spending cards for AI agents. Fund an agent's card so it can spend autonomously.

## Status

**Built**: AgentCardManager, types, storage interface, budget tracking
**Pending**: None - uses existing Blindfold payment flow

## Use Case

Agent needs to pay for APIs, services, subscriptions. Fund its card, it spends. Budget controls prevent overspending.

## Usage

```typescript
import {
  AgentCardManager,
  InMemoryAgentCardStorage,
  BlindfoldClient,
} from '@kamiyo/blindfold';

const client = new BlindfoldClient();
const manager = new AgentCardManager(
  client,
  new InMemoryAgentCardStorage(),
  'kamiyo.ai' // email domain
);

// Register agent (auto-generates email)
const card = await manager.registerAgent('abc123...', {
  tier: 'standard',
  budgetLimit: 500,
});
// card.email = 'agent-abc123@kamiyo.ai'

// Fund the card
const { payment } = await manager.fundAgent({
  agentPk: 'abc123...',
  amount: 100,
  currency: 'USDC',
});

// Check budget
const { card, budget, fundingHistory } = await manager.getAgent('abc123...');
// budget.remainingDaily, budget.remainingMonthly

// Check before funding
const check = await manager.canFund('abc123...', 50);
// { allowed: true, remainingDaily: 400, remainingMonthly: 14500 }
```

## API

### AgentCardManager

| Method | Description |
|--------|-------------|
| `registerAgent(agentPk, options)` | Register agent, create card |
| `fundAgent(request)` | Fund agent's card via Blindfold |
| `getAgent(agentPk)` | Get card, budget, funding history |
| `updateBudget(agentPk, limits)` | Update budget limits |
| `canFund(agentPk, amount)` | Check if funding is allowed |

### Types

```typescript
interface AgentCard {
  agentPk: string;
  email: string;
  tier: CardTier;
  budgetLimit: number;
  totalFunded: number;
  lastFundedAt?: number;
  createdAt: number;
}

interface AgentBudget {
  agentPk: string;
  dailyLimit: number;
  monthlyLimit: number;
  totalLimit: number;
  usedToday: number;
  usedThisMonth: number;
  usedTotal: number;
  lastResetDay: number;
  lastResetMonth: number;
}

interface FundAgentRequest {
  agentPk: string;
  amount: number;
  currency: 'SOL' | 'USDC' | 'USDT';
  email?: string;
  tier?: CardTier;
}
```

## Budget Controls

Default limits based on tier:
- Daily: tierLimit
- Monthly: tierLimit * 30
- Total: tierLimit * 365

Limits reset automatically (daily at midnight, monthly at month start).

## Email Generation

Deterministic emails per agent:
```
agent-{pk_first_8_chars}@{domain}
```

Example: `agent-abc12345@kamiyo.ai`

## Storage

Implement `AgentCardStorage` for production:

```typescript
interface AgentCardStorage {
  getCard(agentPk: string): Promise<AgentCard | null>;
  saveCard(card: AgentCard): Promise<void>;
  getBudget(agentPk: string): Promise<AgentBudget | null>;
  saveBudget(budget: AgentBudget): Promise<void>;
  addFunding(funding: AgentCardFunding): Promise<void>;
  getFundingHistory(agentPk: string): Promise<AgentCardFunding[]>;
}
```

`InMemoryAgentCardStorage` provided for testing.
