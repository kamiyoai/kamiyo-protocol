# SwarmTeam

Shared budget pools for AI agent teams. Multiple agents draw from one treasury with per-agent limits.

## Status

**Built**: SwarmTeamManager, types, storage interface
**Pending**: Blindfold API batch endpoint (optional optimization)

## Use Case

Marketing swarm: 5 agents, $500 pool, each capped at $100. Agents spend on ads, content, paid APIs. We track who drew what, Blindfold handles card funding.

## Usage

```typescript
import {
  SwarmTeamManager,
  InMemorySwarmTeamStorage,
  BlindfoldClient,
} from '@kamiyo/blindfold';

const client = new BlindfoldClient();
const manager = new SwarmTeamManager({
  client,
  storage: new InMemorySwarmTeamStorage(),
});

// Create team
const team = await manager.createTeam('Marketing Swarm', 'USDC', {
  dailyLimit: 500,
  initialMembers: [
    { agentPk: 'abc123...', role: 'leader', drawLimit: 200 },
    { agentPk: 'def456...', role: 'member', drawLimit: 100 },
  ],
});

// Fund the pool
await manager.fundTeam({
  teamId: team.teamId,
  amount: 1000,
  currency: 'USDC',
});

// Agent draws from pool
const { payment, draw } = await manager.draw({
  teamId: team.teamId,
  agentPk: 'abc123...',
  amount: 50,
  purpose: 'Twitter ads',
});

// Check if agent can draw
const check = await manager.canDraw(team.teamId, 'abc123...', 75);
// { allowed: true, teamAvailable: 950, teamDailyRemaining: 450, memberRemaining: 150 }
```

## API

### SwarmTeamManager

| Method | Description |
|--------|-------------|
| `createTeam(name, currency, options)` | Create new team with optional initial members |
| `addMember(teamId, agentPk, options)` | Add agent to team |
| `removeMember(teamId, agentPk)` | Remove agent from team |
| `updateMemberLimit(teamId, agentPk, limit)` | Update agent's draw limit |
| `fundTeam(request)` | Add funds to team pool |
| `draw(request)` | Agent draws from pool, creates Blindfold payment |
| `canDraw(teamId, agentPk, amount)` | Check if draw is allowed |
| `getTeam(teamId)` | Get team info and draw history |
| `getAgentTeamStatus(teamId, agentPk)` | Get agent's status within team |
| `resetMemberDrawn(teamId, agentPk?)` | Reset drawn amounts |

### Types

```typescript
interface SwarmTeam {
  teamId: string;
  name: string;
  members: SwarmTeamMember[];
  budget: SwarmTeamBudget;
  createdAt: number;
  updatedAt: number;
}

interface SwarmTeamMember {
  agentPk: string;
  role: 'leader' | 'member';
  drawLimit: number;
  drawn: number;
  lastDrawAt?: number;
}

interface SwarmTeamBudget {
  total: number;
  available: number;
  currency: 'SOL' | 'USDC' | 'USDT';
  dailyLimit: number;
  usedToday: number;
  lastResetDay: number;
}
```

## Budget Controls

1. **Team pool**: Total available funds
2. **Team daily limit**: Max spend per day across all agents
3. **Member draw limit**: Max each agent can draw (lifetime until reset)

Daily limits reset automatically at midnight.

## Blindfold Integration

Each draw creates a payment to the agent's deterministic email:
`agent-{pk_prefix}-{team_prefix}@kamiyo.ai`

Currently calls `createPayment` per draw. Potential optimization: batch endpoint for multiple draws.

## Storage

Implement `SwarmTeamStorage` interface for production:

```typescript
interface SwarmTeamStorage {
  getTeam(teamId: string): Promise<SwarmTeam | null>;
  saveTeam(team: SwarmTeam): Promise<void>;
  addDraw(draw: SwarmTeamDraw): Promise<void>;
  getDrawHistory(teamId: string): Promise<SwarmTeamDraw[]>;
  getAgentDraws(teamId: string, agentPk: string): Promise<SwarmTeamDraw[]>;
}
```

`InMemorySwarmTeamStorage` provided for testing.
