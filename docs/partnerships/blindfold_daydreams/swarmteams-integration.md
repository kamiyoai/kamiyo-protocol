# SwarmTeams: Blindfold + Daydreams Integration

## Overview

SwarmTeams combines Blindfold Finance (payment infrastructure) with Daydreams (agent task execution) to create shared-budget AI agent teams. Users fund team pools via credits or crypto, agents execute tasks using Kamiyo protocol tools, and draws are tracked with payment status.

## Architecture

```
kamiyo-app (frontend)              kamiyo-protocol (backend)
────────────────────               ─────────────────────────
/swarm/[teamId] page               services/api/

Fund Pool (Credits/Crypto)
  Credits → POST /fund-credits ──→ deductCredits() → pool_balance++
  Crypto  → POST /fund ──────────→ BlindfoldClient.createPayment()
  Confirm → POST /fund/:id/confirm → getPaymentStatus() → pool_balance++

Submit Task
  → POST /tasks ──────────────────→ SwarmOrchestrator.assignTask()
                                      → taskExecutor (Claude + Daydreams tools)
                                      → onTaskComplete → record draw

Draw History
  ← GET /draws ───────────────────← swarm_draws table (blindfold_status)
```

## Components

### 1. Blindfold — Payment Layer

**Package:** `@kamiyo/blindfold`

Provides:
- `BlindfoldClient` — REST client for Blindfold Finance API
  - `createPayment()` — generate crypto deposit address for pool funding
  - `getPaymentStatus()` — poll payment confirmation
  - `createBatchPayment()` — batch agent payouts
- `SwarmTeamManager` — team budget management (fund, draw, canDraw)
- Card tier system (basic/standard/premium/elite) based on reputation

**SwarmTeams usage:**
- Fund pool via crypto deposit (Blindfold creates holding wallet)
- Agent draws create Blindfold payments for payout tracking
- Dev fallback: when `BLINDFOLD_API_KEY` is unset, pool credits directly

### 2. Daydreams — Agent Task Execution

**Package:** `@kamiyo/daydreams`

Provides the `KamiyoExtension` — a set of actions that agents can use as tools during Claude-powered task execution:

| Action | Description |
|--------|-------------|
| `kamiyo.consumeAPI` | Query paid x402 APIs with automatic escrow, quality verification, circuit breaking |
| `kamiyo.createEscrow` | Lock SOL on-chain for service delivery guarantees |
| `kamiyo.fileDispute` | Dispute low-quality API responses, trigger oracle review |
| `kamiyo.discoverAPIs` | Probe endpoints for x402/Kamiyo payment support |
| `kamiyo.checkBalance` | Look up Solana wallet balance + pending payments |
| `kamiyo.getPaymentHistory` | Review past API payments and costs |
| `kamiyo.getQualityStats` | Aggregate quality metrics across calls |
| `reputation.generateCommitment` | Create ZK commitment for reputation |
| `reputation.proveReputation` | Prove reputation tier without revealing score |
| `reputation.verifyProof` | Verify peer reputation proofs |

**SwarmTeams usage:**
- Task executor initializes `KamiyoExtension` with RPC and wallet config
- Actions are converted to Claude tool-use format
- Claude runs an agentic loop (up to 5 rounds) calling tools as needed
- Token cost across all rounds is tracked as `amountDrawn`

### 3. Swarm Agents — Orchestration

**Package:** `@kamiyo/swarm-agents`

Provides:
- `SwarmOrchestrator` — manages agent lifecycle, task assignment, timeouts
- `DrawRecorder` — records draws with x402 facilitator integration
- Task budget reservation and refund on failure

### 4. Task Executor

**File:** `services/api/src/task-executor.ts`

Combines Claude (reasoning) with Daydreams (actions):

```typescript
const kamiyoExt = createKamiyoExtension({
  rpcUrl: process.env.SOLANA_RPC_URL,
  privateKey: process.env.SWARM_AGENT_WALLET_KEY,
  network: 'mainnet',
});

// Convert Kamiyo actions to Claude tools
const tools = kamiyoExt.getActions().map(action => ({
  name: action.name,
  description: action.description,
  input_schema: action.schema,
}));

// Agentic loop: Claude decides which tools to call
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  const response = await claude.messages.create({ tools, messages });
  if (response.stop_reason !== 'tool_use') break;
  // Execute tool calls via Kamiyo extension handlers
  // Append results, continue loop
}
```

Task type inference:
- `research` — topic analysis, summarization
- `market_analysis` — token/project/price research
- `wallet_lookup` — address inspection, holdings
- `general` — fallback

Cost estimation: `$3/MTok input + $15/MTok output` (Sonnet pricing), capped at task budget.

## Database Schema

```sql
-- Team definitions
CREATE TABLE swarm_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SOL',
  daily_limit REAL NOT NULL DEFAULT 0,
  pool_balance REAL NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Team members (agents)
CREATE TABLE swarm_team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  draw_limit REAL NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
);

-- Draw history (task executions)
CREATE TABLE swarm_draws (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  amount REAL NOT NULL,
  purpose TEXT,
  task_id TEXT,
  blindfold_payment_id TEXT,
  blindfold_status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
);

-- Fund deposits (crypto via Blindfold or credits)
CREATE TABLE swarm_fund_deposits (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  blindfold_payment_id TEXT,
  blindfold_status TEXT DEFAULT 'pending',
  crypto_address TEXT,
  crypto_amount TEXT,
  expires_at TEXT,
  confirmed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
);
```

## API Endpoints

### Teams CRUD
- `GET /api/swarm-teams` — list teams
- `POST /api/swarm-teams` — create team
- `GET /api/swarm-teams/:id` — get team detail (members, recent draws)
- `DELETE /api/swarm-teams/:id` — delete team

### Members
- `POST /api/swarm-teams/:id/members` — add agent to team
- `DELETE /api/swarm-teams/:id/members/:memberId` — remove agent

### Funding
- `POST /api/swarm-teams/:id/fund` — initiate Blindfold crypto deposit
- `POST /api/swarm-teams/:id/fund/:depositId/confirm` — poll deposit status
- `POST /api/swarm-teams/:id/fund-credits` — fund from user credit balance
- `PATCH /api/swarm-teams/:id/budget` — update daily limit / member limits

### Tasks
- `POST /api/swarm-teams/:id/tasks` — submit task to agent
  - Body: `{ memberId, description, budget? }`
  - Reserves budget from pool, executes via Daydreams, records draw
  - Returns: `{ taskId, status, output, amountDrawn }`

### Draws
- `GET /api/swarm-teams/:id/draws` — draw history with Blindfold status

## Frontend

### Fund Pool Section
Two modes (toggle):
- **Credits** — enter wallet address + USD amount, deducts from prepaid credit balance
- **Crypto** — Blindfold deposit flow (shows address, amount, polls confirmation)

### Task Submission Section
- Agent dropdown (team members)
- Task description textarea
- Optional budget input (defaults to member draw limit)
- Inline result display (task type, output text, cost)

### Draw History Section
- Shows agent, amount, purpose, Blindfold status badge
- Polls every 10s when draws are pending/processing

### Visualization
Three.js/R3F background with:
- Swarm nodes (one per agent, positioned in circle)
- Inter-agent web (particle connections)
- Draw ring effects (pulse on new draws)

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=          # Claude for task execution

# Optional — Blindfold (crypto fund flow)
BLINDFOLD_API_URL=          # Default: https://blindfoldfinance.com
BLINDFOLD_API_KEY=          # Enables crypto deposits (without: dev fallback)

# Optional — On-chain agent actions
SOLANA_RPC_URL=             # For Daydreams extension wallet lookups
SWARM_AGENT_WALLET_KEY=     # Base64 private key for escrow/payment actions
SWARM_POOL_WALLET=          # Pool wallet for x402 draw recording

# Credits system
CREDITS_TREASURY_WALLET=    # KAMIYO token deposit address
KAMIYO_MINT=                # Token mint for credit deposits
```

## Flow Diagrams

### Fund from Credits
```
User → [wallet + $amount] → POST /fund-credits
  → deductCredits(wallet, usdToCredits(amount))
  → UPDATE swarm_teams SET pool_balance += amount
  → INSERT swarm_fund_deposits (status: confirmed)
  → { success: true, poolBalance }
```

### Fund from Crypto (Blindfold)
```
User → [amount] → POST /fund
  → BlindfoldClient.createPayment({ amount, currency })
  → INSERT swarm_fund_deposits (status: pending, crypto_address, expires_at)
  → { depositId, cryptoAddress, cryptoAmount, expiresAt }

User sends crypto to address...

Frontend polls → POST /fund/:depositId/confirm
  → BlindfoldClient.getPaymentStatus(paymentId)
  → if confirmed: UPDATE pool_balance, SET status = confirmed
  → { status: 'confirmed', poolBalance }
```

### Task Execution
```
User → [memberId, description, budget] → POST /tasks
  → Check daily limit, reserve budget from pool
  → orchestrator.addAgent(member, taskExecutor)
  → orchestrator.assignTask(memberId, { taskId, description, budget })
    → taskExecutor(input):
        1. Initialize KamiyoExtension
        2. Claude + tools loop (up to 5 rounds)
        3. Return { taskId, status, output, amountDrawn }
  → onTaskComplete:
      → INSERT swarm_draws (amount = amountDrawn)
      → Refund unused budget (budget - amountDrawn) to pool
  → { taskId, status, output, amountDrawn }
```

## Deployment

- **Backend:** Render web service `kamiyo-api` (srv-d5knjad6ubrc738s5d6g)
  - Build: `pnpm install --ignore-scripts && pnpm build:api`
  - Start: `node services/api/dist/index.js`
  - Auto-deploy on push to `main`

- **Frontend:** Render web service `kamiyo-app` (srv-d5nnb9je5dus73f8j6i0)
  - Build: `npm install && npm run build`
  - Start: `npm start`
  - Auto-deploy on push to `main`

## Files

| File | Purpose |
|------|---------|
| `services/api/src/task-executor.ts` | Claude + Daydreams agentic task handler |
| `services/api/src/api/routes/swarm-teams.ts` | All SwarmTeam API endpoints |
| `services/api/src/db.ts` | Schema + credit functions |
| `packages/kamiyo-daydreams/src/extension.ts` | KamiyoExtension with all actions |
| `packages/kamiyo-blindfold/src/client.ts` | BlindfoldClient for payments |
| `packages/kamiyo-swarm-agents/src/orchestrator.ts` | SwarmOrchestrator |
| `kamiyo-app/lib/swarm-api.ts` | Frontend API client |
| `kamiyo-app/app/swarm/[teamId]/page.tsx` | Team detail page UI |
| `kamiyo-app/components/swarm-viz/` | Three.js visualization |
