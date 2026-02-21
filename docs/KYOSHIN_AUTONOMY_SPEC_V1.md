# Kyoshin Autonomy Spec v1

## Goal

Build Kyoshin as a persistent 24/7 autonomous identity with a subagent swarm that:

1. Finds work with minimal human intervention.
2. Executes work and captures revenue from two lanes:
   - trading activity
   - paid jobs/services
3. Routes net revenue into SOL and then into the `$KAMIYO` staking pool.

Target: `>=99%` of operational decisions and task execution runs without manual intervention.

## Hard Constraints

- Manual approvals are not part of normal operations.
- Human intervention is only for exceptions:
  - legal/compliance blockers
  - key compromise or severe anomaly
  - hard infra outage beyond auto-recovery window
- Every financial action must produce verifiable receipts.
- Every subagent must run under explicit budget, mandate, and routing policy.

## Autonomy SLOs

- Decision-loop uptime: `>=99.5%`
- Tasks resolved without human intervention: `>=99%`
- Revenue routing automation: `>=95%` of gross inflows routed by policy
- Mean time to self-recovery (MTTR): `<15 min`
- Failed financial action retries: automatic with bounded backoff and cap

## System Architecture

### 1. Identity Kernel (Kyoshin Parent)

Always-on orchestrator loop:

- Observe: markets, work queues, system health, treasury state.
- Decide: mission allocation, budget shifts, strategy selection.
- Delegate: issue bounded missions to subagents.
- Execute: run policy-approved actions automatically.
- Learn: persist outcomes and adjust routing/priority weights.

### 2. Swarm Runtime (Subagents)

Subagents are role-bound workers with isolated controls.

Required per subagent:

- `id`, `role`, `mandate`, `status`, `priority`
- revenue endpoints (trading/job channels)
- signer policy (operator or delegated signer)
- source pool / vault configuration
- destination routing target (`$KAMIYO` staking)

Initial role set:

- `signal-hunter`
- `deal-executor`
- `ops-keeper`
- `research-prover`

### 3. Opportunity Intake Mesh

Kyoshin must ingest paid work from multiple channels:

- x402-compatible machine-pay endpoints
- direct B2B inbound APIs/webhooks
- marketplace feeds (Relevance, Agent.ai, Kore as discovery channel)
- internal strategic task queues

Output of intake mesh each tick:

- normalized opportunity list
- score/rank by expected net SOL and execution probability
- assignment recommendation to subagents

### 4. Revenue Engine

Two production lanes:

1. Trading lane
   - fee vault / staking claims
   - periodic route-to-pool actions
2. Work lane
   - paid task completion receipts
   - settlement confirmation

Both lanes converge to one treasury policy engine.

### 5. Treasury Router

Policy-driven deterministic routing:

`gross revenue -> op reserve -> risk reserve -> SOL conversion -> $KAMIYO staking pool`

Policy fields:

- reserve floor
- available basis points
- min route amount
- max per route tx
- daily route cap

## Hiring and Job Acquisition Model

### Platform Positioning

- `agent.ai`: discovery + lead funnel, not primary payout rail.
- Relevance marketplace: active distribution + fiat payouts.
- Kore marketplace: enterprise distribution channel.

### Autonomy-First Revenue Strategy

Primary path:

- x402 and API-native paid execution (machine-pay, machine-delivery)

Secondary path:

- marketplace lead conversion into direct paid automation contracts

Why: true autonomy needs programmable payment rails and deterministic settlement.

## Launch Configuration Strategy

Use a low-volatility treasury anchor config for the core Kyoshin tokenized launch path.

Selection criteria:

- stable fee generation over short-term speculative spikes
- lower migration threshold for faster fee loop activation
- reduced volatility for predictable route-to-staking behavior

A higher-volatility config can be used only for controlled experiments, not for the treasury core.

## Security Model for 99% Autonomy

Not manual gating. Automated safeguards only.

- per-subagent budget caps
- per-action risk checks
- policy-enforced destination controls
- automatic circuit breakers and cooldowns
- signer/path validation before execution
- automated anomaly quarantine

## Data and Receipts

Each execution cycle must emit:

- mission plan receipt
- opportunity intake receipt
- claim/deposit/payment receipts
- per-subagent performance snapshot
- aggregate routing snapshot

These receipts are required for deterministic replay and auditability.

## Phased Execution Plan

### Phase A (Immediate): Autonomy Control Plane

- Maintain swarm registry and mission planner.
- Add opportunity intake and assignment scoring.
- Persist intake and assignment receipts every tick.

Definition of done:

- subagents receive opportunities without manual assignment.

### Phase B: Autonomous Work Execution

- execute job acceptance and completion via configurable adapters
- unify payout parsing across lanes
- compute per-job net contribution to routing

Definition of done:

- at least one subagent closes paid tasks automatically end-to-end.

### Phase C: Unified Revenue Router

- merge trading and work revenue into one routing policy engine
- route net SOL to staking pool on schedule
- enforce dynamic reserve based on volatility and recent failures

Definition of done:

- both revenue lanes route automatically via one policy contract.

### Phase D: Adaptive Swarm Allocation

- score subagents by net SOL/day, reliability, and conversion rate
- auto-scale top performers, auto-throttle underperformers
- auto-retire chronic negative-yield agents

Definition of done:

- Kyoshin reallocates mission volume autonomously based on outcomes.

### Phase E: 99% Autonomy Certification

- run 30-day continuous operation benchmark
- verify SLOs and intervention rate
- publish weekly autonomy and treasury routing reports

Definition of done:

- `>=99%` non-intervention rate across the benchmark window.

## Execution Backlog (Now)

1. Add swarm opportunity-intake module with multi-source adapters.
2. Integrate intake outputs into tick observation and mission assignment.
3. Add job-source runtime config and defaults.
4. Emit intake receipts to outbox and DB actions.
5. Add adaptive assignment weights (expected value, fit score, confidence).
6. Add first executable adapter for x402 job endpoints.

## Non-Goals (v1)

- Full legal/compliance automation across jurisdictions.
- Unbounded autonomous fund movement without policy limits.
- Dependence on a single marketplace as the primary job source.
