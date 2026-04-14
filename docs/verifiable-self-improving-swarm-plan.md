# Verifiable Self-Improving Swarm — 4-Week Plan

**Goal:** Set KAMIYO apart as the only agent framework where agents demonstrably improve on-chain — every upgrade is a Kani-proven, Kiroku-receipted, reputation-weighted event. This is the spotlight narrative: verifiable self-improvement is something no competing framework (ElizaOS, Virtuals, ai16z, Autonolas) currently offers end-to-end.

**Authored:** 2026-04-14

## North-Star Pitch

> "KAMIYO is the only agent framework where every self-modification is formally verified, cryptographically receipted, and rewarded through on-chain reputation. Agents don't just run — they evolve, and you can prove it."

Three primitives already in-tree (Kani-Solana verification, Kiroku receipts, ERC-8004 trust + fairscale/DKG reputation) are not yet composed into a single loop. This plan composes them.

## Current State (Inventory)

**Shipped:**
- `packages/kamiyo-agent-core` — batch, cache, reputation, retry, storage, observability
- `packages/kamiyo-swarm-agents` — agent-factory + orchestrator
- `packages/kamiyo-hive` — swarm teams runtime (DAG spec drafted, not fully implemented)
- `crates/kani-solana` — formal-verification primitives for agentic Solana programs
- `services/kyoshin` — autonomy loop; `services/agent-factory` — variant construction; `services/oracle` — dispute/quality grading; `services/wallet-control-plane` — scoped-wallet agent execution
- Agents live: Nika, Moltbook, Oracle, Meishi compliance passports, Openclaw autonomy canary
- Revenue-event contract via `services/api/src/revenue-events.ts` (Companion SQLite is system of record)

**Gap:**
No closed loop `performance → scored → selected → mutated → verified → promoted`. Reputation exists, but nothing feeds it back into agent construction. Kani proofs exist, but not invoked on agent upgrades. Kiroku receipts exist, but not tied to evolution events.

## Week 1 — Close the Feedback Loop

**Objective:** every swarm run produces a scored, receipted performance event that updates per-agent reputation.

**Work items:**
1. Implement `specs/hive-true-swarm.md`:
   - `swarm_runs` + `swarm_run_nodes` tables in `services/api/src/db.ts`
   - DAG runner with bounded parallelism in `packages/kamiyo-swarm-agents/src/orchestrator.ts`
   - Correct budget refund on failure and on `amountDrawn < budget`
   - Per-run Kiroku receipt publish (idempotent)
2. Add `agent_performance_events` table: `{id, agent_id, run_id, node_id, task_type, cost, latency_ms, quality_score, receipt_id, created_at}` with indexes on `(agent_id, created_at)` and `(task_type, quality_score)`
3. Hook oracle-agent as a post-hoc grader:
   - New endpoint `POST /api/internal/score-swarm-node` in `services/api`
   - Oracle reads node output + mission, returns `quality_score ∈ [0,1]` + rationale
   - Runs async after node completion; does not block the swarm
4. Wire scores into `packages/kamiyo-agent-core/src/reputation.ts` (EWMA, seed from existing fairscale snapshot)
5. Smoke test: 5-node DAG on testnet, verify receipts + reputation delta visible

**Exit criteria:**
- Every completed swarm node has `(receipt_id, quality_score, reputation_delta)` in one SQL query
- `GET /api/agents/:id/performance` returns a time-series reputation trace
- Pool refund math is correct (no drift vs. `pool_balance`)

## Week 2 — Evolutionary Agent Selection

**Objective:** agent-factory can fork variants, run tournaments, and promote winners automatically.

**Work items:**
1. Extend `services/agent-factory` with a `variant` concept:
   - Genome = `{prompt_template, model_id, tool_allowlist, temperature, max_tokens, system_guardrails}`
   - `agent_variants` table with `parent_id`, `genome_json`, `rep_score`, `status ∈ {active, archived, promoted}`
2. Tournament runtime in orchestrator:
   - Given a task type, sample N variants weighted by Thompson sampling over recent `quality_score` distributions
   - Cap tournament cost with Hive pool reservation
   - Losers → `archived`; winners stay active
3. Promotion policy: variant with statistically-significant (Welch t-test, p<0.05) uplift on ≥50 tasks becomes the new default for that `task_type`. Record promotion as a `variant_events` row with Kiroku receipt.
4. Public leaderboard endpoint `GET /api/variants/leaderboard?task_type=...` — rep score, sample size, 95% CI
5. Frontend surface on `kamiyo-website` (reuse event-horizon terminal component added in `b945da4d`)

**Exit criteria:**
- Running `POST /api/agent-factory/tournaments` with a task_type spawns variants, runs them on live Hive tasks under a budget cap, and returns a ranked leaderboard
- Promotion event recorded with receipt ID
- Dashboard shows live rep deltas

## Week 3 — Verifiable Self-Modification

**Objective:** every agent evolution carries a formal proof that safety invariants still hold. This is the moat.

**Work items:**
1. Extend `crates/kani-solana` with an `AgentEnvelope` proof bundle:
   - Invariant 1: variant cannot spend beyond its reserved budget (budget-bound)
   - Invariant 2: variant's tool allowlist is a subset of parent's declared scope (scope-monotone)
   - Invariant 3: variant passes Meishi compliance passport check (compliance-preserving)
   - Invariant 4: variant's signer authority is limited to its scoped wallet (wallet-scope)
2. Gate promotion in agent-factory on `kani verify --envelope <variant_id>` success
3. Publish proof hash through Kiroku: `evolution_receipt = hash(variant_id, parent_id, proof_hash, tournament_result)`
4. ERC-8004 integration:
   - Register evolution events in the trust registry (`packages/kamiyo-erc8004`)
   - Agents carry on-chain lineage chain: parent hash → proof hash → promotion receipt
5. Add a `GET /api/agents/:id/lineage` endpoint that returns the full proven ancestry tree

**Exit criteria:**
- Attempting to promote a variant that fails any Kani invariant is rejected and logged
- Every promoted variant has an on-chain ERC-8004 entry referencing its Kiroku proof receipt
- Lineage tree is reproducible from on-chain data alone (no trust in Companion DB required to verify)

**Fallback if Kani work slips:** ship the same receipt/lineage flow backed by cryptographic attestations (ed25519 over the invariant checks) + Meishi passport; claim "verifiable" softer, keep the spotlight pitch.

## Week 4 — Spotlight Push

**Objective:** convert the shipped system into attention.

**Work items:**
1. **Live mainnet tournament:** seed 20 variants across 3 task types (research, analysis, settlement), run 72h autonomous tournament on real Keiro + x402 jobs, stream to public dashboard. Budget cap $2–5k.
2. **KAMIYO Bench:** publish a fixed reproducible benchmark suite. Any framework can submit agents; we publish receipts + leaderboard. Forces head-to-head comparison on our terms (verifiable, receipted, on-chain).
3. **Content artifacts (in order):**
   - Long-form blog: "Verifiable Self-Improvement: Closing the Loop on Agent Evolution" (technical, 2500 words, Kani walkthrough + lineage demo)
   - 2-min demo video: tournament running live, variant promoted with proof, lineage tree rendered
   - X thread tying to $NMNDS holder utility (governance over task-type promotion policies)
   - Devlog tweet cadence during the 72h live run
4. **Outreach targets:**
   - Paradigm or a16z-crypto researcher (one intro each)
   - Solana Foundation (Colosseum circuit — agent-factory already targets it)
   - Relevant outlets: The Defiant, Decrypt agent vertical, DL News
5. **Post-push:** open a governance vote on the next four task types to onboard, using the discord-governance-bot.

**Exit criteria:**
- 72h tournament ran to completion with public dashboard
- At least one tier-1 researcher reply / mention
- Blog + video live; bench suite open for submissions

## Risks & Tradeoffs

- **Kani on evolving agents is research-adjacent.** Week 3 is the highest-risk week. Fallback plan above.
- **Tournament spend is real.** Haiku-for-challengers + budget caps are mandatory. Don't let this drift.
- **Oracle-as-grader is a single point of failure for scoring.** Acceptable for v1; in a later pass, rotate grader among 3 models and median.
- **Governance surface (week 4) is new attack surface.** Rate-limit + Meishi-gate proposals.

## Files / Packages Touched (map)

| Week | Path | Change |
|------|------|--------|
| 1 | `services/api/src/db.ts` | new tables |
| 1 | `services/api/src/swarm/pool.ts` | refund fix |
| 1 | `packages/kamiyo-swarm-agents/src/orchestrator.ts` | DAG runner |
| 1 | `packages/kamiyo-agent-core/src/reputation.ts` | EWMA update |
| 1 | `services/oracle` | grader endpoint |
| 2 | `services/agent-factory` | variants, tournaments |
| 2 | `packages/kamiyo-swarm-agents` | Thompson sampler |
| 2 | `kamiyo-website` | leaderboard UI |
| 3 | `crates/kani-solana` | AgentEnvelope invariants |
| 3 | `packages/kamiyo-erc8004` | lineage registration |
| 3 | `services/agent-factory` | promotion gate |
| 4 | `apps/` + marketing | dashboard, bench, content |

## Success Metrics

- **Technical:** closed-loop demo end-to-end by end of week 3; ≥20 variants evaluated; ≥1 Kani-proven promotion recorded on mainnet
- **Market:** ≥1 tier-1 researcher engagement; blog ≥10k views; ≥3 external bench submissions within 2 weeks of launch
- **Token:** measurable $NMNDS holder-action uplift tied to governance launch in week 4
