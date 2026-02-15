# Hive True Swarm: DAG Planning + Parallel Execution + Kiroku Receipts

## Goal

Turn Hive SwarmTeams from “single task per request” into a real swarm runtime:

- Plan missions as a **DAG** (fan-out research/analysis + dependency-aware synthesis).
- Execute the DAG with **bounded parallelism** and deterministic scheduling.
- Persist full run state (plan, node results, costs) for auditability.
- Publish a **Kiroku proof receipt** for each run (idempotent, shareable).

Non-goals (for this pass):
- Long-lived distributed agent processes, remote A2A agents, or streaming UIs.
- On-chain escrow settlement. This is the off-chain runtime for SwarmTeams.

## Current State (Problems)

- `POST /api/hive-teams/:id/tasks` reserves `budget` from `swarm_teams.pool_balance` but:
  - does **not refund unused** budget when `amountDrawn < budget`.
  - does **not refund** budget when the executor returns `{ status: "failed" }` (it only refunds on thrown exceptions).
  - effectively drains the pool inaccurately and makes “daily limit” enforcement meaningless.
- No mission planning: each task is an island.
- No receipts: there’s no verifiable, shareable artifact of what ran and what it cost.

## Design Overview

### Data Model

Add DB tables in `services/api/src/db.ts`:

- `swarm_runs`
  - `id TEXT PRIMARY KEY`
  - `team_id TEXT NOT NULL`
  - `requested_by_wallet TEXT`
  - `mission TEXT NOT NULL`
  - `plan_json TEXT NOT NULL`
  - `status TEXT NOT NULL` (`running|completed|failed|cancelled`)
  - `max_parallel INTEGER NOT NULL`
  - `fail_fast INTEGER NOT NULL`
  - `total_reserved REAL NOT NULL DEFAULT 0`
  - `total_spent REAL NOT NULL DEFAULT 0`
  - `error TEXT`
  - `kiroku_receipt TEXT`
  - `kiroku_url TEXT`
  - `kiroku_error TEXT`
  - `started_at INTEGER DEFAULT (unixepoch())`
  - `completed_at INTEGER`
  - indexes: `(team_id, started_at)`, `(status, started_at)`

- `swarm_run_nodes`
  - `id TEXT PRIMARY KEY` (stable: `${runId}:${nodeId}`)
  - `run_id TEXT NOT NULL`
  - `node_id TEXT NOT NULL`
  - `member_id TEXT NOT NULL`
  - `agent_id TEXT NOT NULL`
  - `depends_on_json TEXT NOT NULL`
  - `description TEXT NOT NULL`
  - `budget_reserved REAL NOT NULL`
  - `amount_drawn REAL NOT NULL DEFAULT 0`
  - `status TEXT NOT NULL` (`pending|running|completed|failed|skipped`)
  - `output_json TEXT`
  - `error TEXT`
  - `started_at INTEGER`
  - `completed_at INTEGER`
  - indexes: `(run_id)`, `(run_id, status)`

### DAG Plan Schema

Server-side representation:

```ts
type SwarmDagNode = {
  id: string;
  memberId: string;
  description: string;
  budget?: number;
  dependsOn?: string[];
};

type SwarmDagPlan = {
  mode: "dag";
  nodes: SwarmDagNode[];
};
```

Constraints:
- `id` unique within plan.
- `dependsOn` references existing node ids only.
- Graph must be acyclic.
- Every node must have a valid `memberId` for the team.
- Budget defaults to the member’s `draw_limit` and is clamped to `[0, draw_limit]`.

### Planning (LLM + Deterministic Fallback)

Endpoint:
- `POST /api/hive-teams/:id/swarm/plan`

Inputs:
- `mission: string`
- `maxNodes?: number` (default 12, hard cap 24)

Planner:
- If `ANTHROPIC_API_KEY` is configured: use Claude to output strict JSON for `SwarmDagPlan`.
- Always validate + sanitize; on any failure, fall back to a deterministic heuristic plan.

Heuristic fallback:
- Fan-out (2–4 parallel research/analysis nodes) + join (`final` synthesis node).
- Assign members round-robin, biased toward roles if `role` strings suggest fit.

### Execution (Bounded Parallel DAG Runtime)

Endpoint:
- `POST /api/hive-teams/:id/swarm/run`

Inputs:
- `mission: string`
- `plan?: SwarmDagPlan` (optional; if omitted, auto-plan)
- `maxParallel?: number` (default 4, cap 10)
- `failFast?: boolean` (default true)

Execution semantics:
- Kahn-style scheduler: start nodes with all deps satisfied.
- Run up to `maxParallel` nodes concurrently.
- Dependency context passed into each node:
  - only direct deps’ outputs (truncated), plus mission header.
- `failFast=true`:
  - on first failed node, stop scheduling new nodes and mark remaining as `skipped`.

### Budget Accounting (Fix + Generalize)

Introduce an internal budget lifecycle used by both single-task and DAG nodes:

1. **Reserve** `budgetReserved`:
   - DB transaction:
     - check `daily_limit` via `SUM(swarm_draws.amount)` (last 24h) + `budgetReserved`
     - decrement `pool_balance` atomically if `pool_balance >= budgetReserved`
2. **Execute** task
3. **Settle**:
   - `amountDrawn = clamp(result.amountDrawn ?? 0, 0, budgetReserved)`
   - refund `budgetReserved - amountDrawn` back into `pool_balance`
   - record draw with `amountDrawn` (if `> 0`)
   - if task status is failed/rejected: refund full `budgetReserved`

This fixes the current pool-drain bug and makes DAG execution safe.

### Kiroku Proof Receipt Publishing

Wire Kiroku publishing into swarm run completion (best-effort, idempotent):

- Env:
  - `KIROKU_AGENT_PUBLISH_URL`
  - `KIROKU_AGENT_PUBLISH_KEY`
  - `KIROKU_AGENT_AUTHOR`
  - optional: `KIROKU_RECEIPT_ORIGIN`

Behavior:
- On run completion (success or failure), compute:
  - `planSha256` over canonical JSON of the plan
  - `resultsSha256` over canonical JSON of node results (without huge blobs)
- Publish a drop via HTTP `POST` with bearer auth:
  - `{ author, text, evidence, idempotencyKey }`
  - `idempotencyKey = "hive-swarm:" + runId`
- Persist:
  - `swarm_runs.kiroku_receipt` and `swarm_runs.kiroku_url` (or error string)

Failure mode:
- If Kiroku publish fails, the run is still `completed|failed`; only the receipt fields record the publish failure.

## API Surface

All endpoints require authentication and team ownership:

1. `POST /api/hive-teams/:id/swarm/plan`
2. `POST /api/hive-teams/:id/swarm/run`
3. `GET /api/hive-teams/:id/swarm/runs?limit&offset`
4. `GET /api/hive-teams/:id/swarm/runs/:runId`

## Implementation Steps

1. DB
   - Add `swarm_runs` + `swarm_run_nodes` tables to `services/api/src/db.ts`.
2. Budget correctness
   - Fix `POST /api/hive-teams/:id/tasks` to refund unused budget and refund on non-completed results.
   - Extract reserve/settle logic so DAG and single-task share the same implementation.
3. Swarm runtime
   - Add DAG validator + scheduler in `services/api/src/swarm/*`.
   - Add Kiroku publisher in `services/api/src/kiroku.ts`.
4. Routes
   - Add `services/api/src/api/routes/hive-swarm.ts` mounted under `/:id/swarm`.
5. Tests
   - Unit tests for DAG validation/scheduling.
   - Unit tests for budget settlement edge cases.

## Acceptance Criteria

- A mission can be planned into a valid DAG via API (LLM or fallback).
- A run executes nodes in parallel up to `maxParallel`, respecting dependencies.
- Pool balance decreases by actual `amountDrawn` (not by requested budgets).
- Node-level outputs + costs are queryable via `GET` endpoints.
- A Kiroku receipt is published when env vars are present; otherwise cleanly skipped.

