# Kyoshin Swarm Revenue Plan

## Mission

Build Kyoshin as the parent operator that launches and manages a swarm of purpose-specific agents.  
Each swarm agent has its own Fundry coin and must route earned SOL (trading fees + x402 paid jobs) into the `$KAMIYO` staking pool.

Primary KPI: net SOL routed to `$KAMIYO` stakers per day.

## Implementation Status

- Phase 1 control-plane is implemented:
  - Swarm registry loading/validation
  - Per-tick mission planning
  - Swarm mission plan receipts in outbox
- Phase 2 foundation is implemented:
  - Execute-mode per-subagent runtime path
  - Per-subagent claimer signer loading
  - Per-subagent claim+route lifecycle hooks under shared policy guardrails
- Current recommended runtime mode remains `KAMIYO_SWARM_PROPOSE_ONLY=true` until each active subagent has finalized mint/vault/pool/signer config.

## Non-Negotiable Constraints

- Parent controller is Kyoshin.
- Subagents may have unique coins, but all revenue routing policy is unified.
- Every launched agent must use the `FUNDRY_AGENT_LAUNCH_PLAYBOOK.md` template.
- Runtime defaults remain:
  - Route 50% of available SOL each run.
  - Keep 0.2 SOL reserve.
  - No max-per-tx cap.
- All claim/deposit actions require on-chain receipts (tx signatures persisted in outbox + DB observation).

## Operating Model

### 1) Parent Orchestrator (Kyoshin)

Kyoshin decides:
- Which new agent archetypes to launch.
- Which active agents to scale, pause, or retire.
- Revenue policy updates (global guardrails only).

Kyoshin does not bypass guardrails or signing policy.

### 2) Subagent Units

Each subagent has:
- One purpose (single role, explicit mandate).
- One Fundry coin.
- One fee vault.
- One staking source pool (if applicable).
- One claimer signer under KAMIYO custody.

### 3) Revenue Engine

Revenue sources per subagent:
- Fundry/Meteora trading fees (fee vault claim path).
- x402 paid tasks/jobs (service revenue path).

Revenue sinks:
- `$KAMIYO` staking pool via operator auto-route policy.

## Swarm Agent Classes (Initial Wave)

- `signal-hunter`: finds high-conviction narrative and distribution opportunities that increase quality volume.
- `deal-executor`: executes partnership/task flows with paid outcomes (x402 first).
- `ops-keeper`: maintains runtime health, receipts quality, and failure recovery.
- `research-prover`: produces verifiable intelligence artifacts that improve agent decisions.

Each class gets a strict mandate and measurable revenue target.

## Template-to-Launch Contract

For every new subagent, complete this launch contract before going live:

```yaml
agent_name: <string>
agent_role: <signal-hunter|deal-executor|ops-keeper|research-prover|custom>
fundry_coin_mint: <pubkey>
fundry_config: <pubkey>
fundry_fee_vault: <pubkey>
source_staking_pool: <pubkey_or_none>
claimer_signer_keypair_path: <local_path>
kamiyo_staking_pool: 9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d
route_policy:
  available_bps: 5000
  reserve_lamports: 200000000
  min_deposit_lamports: 50000000
```

If this contract is incomplete, launch is blocked.

## Technical Plan

## Phase 0 (Current Baseline)

Status:
- Single-agent Kyoshin operator exists.
- Auto-claim + auto-route to `$KAMIYO` staking exists.
- Fundry launch template exists.

Gap:
- No true multi-agent Kyoshin-managed swarm lifecycle yet.

## Phase 1: Swarm Control Plane (Propose-Only)

Deliver:
- Add swarm registry for subagents (state + config + status).
- Add parent tick that can create/assign missions to subagents.
- Keep all financial actions in propose-only for first rollout.

Code touchpoints:
- `services/kamiyo-operator/src/index.ts`
- `services/kamiyo-operator/src/config.ts`
- new `services/kamiyo-operator/src/swarm/*`

Acceptance:
- Kyoshin can schedule missions across at least 3 subagents.
- Mission logs and planned actions are written to outbox.

## Phase 2: Executable Revenue Routing Per Subagent

Deliver:
- Parameterize current fee-claim and staking-route logic per subagent.
- Enforce one shared routing policy toward `$KAMIYO` pool.
- Support separate claimer signers per subagent.

Code touchpoints:
- `services/kamiyo-operator/src/tools/feeVault.ts`
- `services/kamiyo-operator/src/tools/fundryStaking.ts`
- `services/kamiyo-operator/src/tools/stakingPool.ts`
- `services/kamiyo-operator/src/wallet.ts`

Acceptance:
- Each subagent can claim and route independently.
- Receipts include subagent ID, source wallet, destination pool, amount, signature.

## Phase 3: x402 Job Revenue Integration

Deliver:
- Add job intake + execution path for paid tasks (x402).
- Tag each completed job with gross revenue, costs, and net SOL route amount.
- Route net SOL using same policy as trading-fee route.

Code touchpoints:
- `packages/kamiyo-agents/src/x402-tools.ts`
- `services/kamiyo-operator/src/index.ts`
- new `services/kamiyo-operator/src/swarm/jobs.ts`

Acceptance:
- At least one live subagent can complete paid jobs and route resulting SOL.

## Phase 4: Ranking, Reallocation, Retirement

Deliver:
- Add subagent performance scoring:
  - revenue/day
  - reliability
  - route consistency
  - cost efficiency
- Auto-pause low performers.
- Reallocate budget to top performers.

Acceptance:
- Kyoshin can automatically keep best-performing agents active and throttle weak agents.

## Risk Controls

- Hard daily SOL action caps remain active.
- Financial action path stays deterministic and receipt-first.
- No subagent can bypass destination pool policy.
- Any signer mismatch or missing source pool config blocks execution, does not fallback silently.

## Metrics and Reporting

Track per subagent and aggregate:
- SOL claimed (fee vault)
- SOL claimed (staking rewards)
- SOL earned (x402 jobs)
- SOL routed to `$KAMIYO` pool
- Net retained balance
- Success/failure ratio for claim/deposit txs

Publish:
- hourly operator observation snapshot
- daily swarm revenue report
- weekly “keep/pause/retire” decision report

## Rollout Sequence

1. Implement Phase 1 in propose-only mode.
2. Run 48h dry missions with no funds movement.
3. Enable execute mode for one subagent.
4. Validate 7-day stability and positive routing.
5. Expand to 3-5 subagents.

## Definition of Done

The swarm feature is considered live only when:
- Kyoshin manages multiple subagents concurrently.
- Every subagent has its own coin and revenue routes.
- x402 paid jobs are active for at least one subagent.
- Routing to `$KAMIYO` pool is automatic and repeatable.
- All financial actions are verifiable by receipts and on-chain txs.
