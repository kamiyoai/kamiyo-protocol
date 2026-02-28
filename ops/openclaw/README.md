# Kyoshin OpenClaw Runtime Artifacts

This folder versions the deployed autonomy loop artifacts used on the OpenClaw droplet.

## Files

- `kyoshin-marketplace-intake.py`: marketplace feed polling and normalization.
- `kyoshin-x402-feed.py`: builds executable x402 opportunities from self-hosted facilitator pricing/manual endpoint specs.
- `kyoshin-dx-terminal-feed.py`: builds DX Terminal Pro opportunities (leaderboard + token flow + optional owner-vault snapshot).
- `kyoshin-swarm-planner.py`: opportunity-to-subagent assignment planner.
- `kyoshin-sync-feed-config.py`: per-cycle feed config sync (live URLs from env, bootstrap fallback).
- `kyoshin-receipt-sync.py`: exports Kyoshin `swarm_jobs` outcomes into OpenClaw `execution-receipts.jsonl` for governor policy.
- `kyoshin-context-guard.py`: brain-dump and mission-context completeness guard.
- `kyoshin-sentry-pipeline.py`: ingests Sentry webhooks and maintains auto-fix vs escalate triage artifacts.
- `kyoshin-tool-health.py`: tool registry checks (command/http/file checks with critical gating).
- `kyoshin-runtime-bridge.py`: ingests Kyoshin execution runtime `/health` + `/status` into OpenClaw runtime state.
- `kyoshin-swarm-governor.py`: subagent `work / earn / or die` policy governor (priority/status automation from receipts).
- `kyoshin-mission-control.py`: mission-control board/backlog generator for custom tool build tasks.
- `kyoshin-revenue-guard.py`: enforces spend caps and red-line revenue policy before paid execution.
- `kyoshin-x402-agentcash.py`: executes paid x402 allowlist routes through `agentcash` and normalizes receipts into the revenue ledger.
- `kyoshin-clawmart-staking-route.py`: idempotent ClawMart earnings router that executes staking transfer and appends route receipts.
- `kyoshin-clawmart-monitor.py`: ClawMart sales/listing monitor that appends fulfillment tasks, enforces staking-route policy, and tracks receipt checkpoints.
- `kyoshin-distribution-engine.py`: autonomous outbound dispatch with channel limits, cooldowns, and safety filters.
- `kyoshin-artifact-contracts.py`: validates JSON contracts for runtime artifacts before autonomy tick is accepted as healthy.
- `kyoshin-learnings.py`: converts degraded-cycle mistakes into durable `.learnings/LEARNINGS.md` rules.
- `kyoshin-memory-extract.py`: nightly extraction of durable `MEMORY.md` facts from daily workspace notes.
- `kyoshin-operator-log.py`: daily operator summary publisher (revenue/cost/net/routing/blockers).
- `kyoshin-autonomy-loop.sh`: single autonomy control-loop tick.
- `rollout-artifact-contracts.sh`: host rollout helper that installs artifact-contract validator + updated loop and runs one verification tick.
- `install-context-pack.sh`: scaffolds mission/profile/goals/tool-registry baseline files.
- `kyoshin-autonomy-loop.service`: systemd oneshot service for a loop tick.
- `kyoshin-autonomy-loop.timer`: systemd timer (`OnUnitActiveSec=30min`).

## Install on host

```bash
sudo install -m 700 -o openclaw -g openclaw kyoshin-marketplace-intake.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-x402-feed.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-dx-terminal-feed.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-swarm-planner.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-sync-feed-config.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-receipt-sync.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-context-guard.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-sentry-pipeline.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-tool-health.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-runtime-bridge.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-swarm-governor.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-mission-control.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-revenue-guard.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-x402-agentcash.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-clawmart-staking-route.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-clawmart-monitor.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-distribution-engine.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-artifact-contracts.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-learnings.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-memory-extract.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-operator-log.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw install-context-pack.sh ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-autonomy-loop.sh ~/bin/
sudo install -m 644 -o root -g root kyoshin-autonomy-loop.service /etc/systemd/system/
sudo install -m 644 -o root -g root kyoshin-autonomy-loop.timer /etc/systemd/system/
sudo -u openclaw -H bash -lc '~/bin/install-context-pack.sh'
sudo systemctl daemon-reload
sudo systemctl enable --now kyoshin-autonomy-loop.timer
sudo systemctl start kyoshin-autonomy-loop.service
```

Rollout helper for this specific hardening:

```bash
./rollout-artifact-contracts.sh
```

## Runtime paths

- Feed config: `~/.openclaw/workspace/runtime/marketplace-feeds.json`
- Feed output: `~/.openclaw/workspace/runtime/feeds/opportunities.json`
- x402 generated feed output: `~/.openclaw/workspace/runtime/feeds/x402-opportunities.json`
- DX Terminal generated feed output: `~/.openclaw/workspace/runtime/feeds/dx-terminal-opportunities.json`
- Assignment output: `~/.openclaw/workspace/runtime/queue/assignments.json`
- Tool health output: `~/.openclaw/workspace/runtime/tools/tool-health.json`
- Kyoshin runtime bridge output: `~/.openclaw/workspace/runtime/state/kyoshin-runtime.json`
- Governor output: `~/.openclaw/workspace/runtime/state/swarm-governor.json`
- Mission control board: `~/.openclaw/workspace/runtime/mission-control/board.json`
- Mission control backlog: `~/.openclaw/workspace/runtime/mission-control/backlog.json`
- Revenue guard output: `~/.openclaw/workspace/runtime/state/revenue-guard.json`
- x402 agentcash output: `~/.openclaw/workspace/runtime/state/x402-agentcash.json`
- ClawMart staking route state: `~/.openclaw/workspace/runtime/state/clawmart-staking-route-state.json`
- ClawMart monitor state: `~/.openclaw/workspace/runtime/state/clawmart-monitor-state.json`
- Distribution engine output: `~/.openclaw/workspace/runtime/state/distribution-engine.json`
- Artifact contracts report: `~/.openclaw/workspace/runtime/state/runtime-artifact-contracts.json`
- Learnings file: `~/.openclaw/workspace/.learnings/LEARNINGS.md`
- Learnings state: `~/.openclaw/workspace/runtime/state/learnings-state.json`
- Memory extraction state: `~/.openclaw/workspace/runtime/state/memory-extract-state.json`
- Operator log output: `~/.openclaw/workspace/runtime/state/operator-log.json`
- Receipt sync state: `~/.openclaw/workspace/runtime/state/kyoshin-receipt-sync-state.json`
- Context guard output: `~/.openclaw/workspace/runtime/state/context-guard.json`
- Sentry inbox: `~/.openclaw/workspace/runtime/hooks/sentry-alerts.jsonl`
- Sentry triage output: `~/.openclaw/workspace/runtime/incidents/sentry-triage.json`
- Sentry pipeline state: `~/.openclaw/workspace/runtime/state/sentry-pipeline-state.json`
- Nightly mission state: `~/.openclaw/workspace/runtime/state/nightly-mission-state.json`
- Execution receipts input: `~/.openclaw/workspace/runtime/receipts/execution-receipts.jsonl`
- Canonical revenue ledger: `~/.openclaw/workspace/runtime/receipts/revenue-ledger.jsonl`
- Loop state: `~/.openclaw/workspace/runtime/state/autonomy-loop-state.json`
- Loop log: `~/.openclaw/workspace/runtime/logs/autonomy-loop.jsonl`

Use `board.json` + `backlog.json` as the data contract for a Next.js Mission Control UI.

## Bootstrap non-empty swarm intake

To force non-empty intake/planning without external marketplace credentials:

```bash
./install-bootstrap-seed.sh
```

This installs deterministic seed opportunities and enables `file://` feeds so the loop produces non-zero assignments immediately.

## Live feed cutover

Set these env vars in `~/.openclaw/.env`:

- `KYO_AGENT_AI_FEED_URL`
- `KYO_RELEVANCE_FEED_URL`
- `KYO_KORE_FEED_URL`
- `KYO_X402_FEED_URL`
- `KYO_DIRECT_API_FEED_URL`
- optional auth keys:
  - `KYO_AGENT_AI_API_KEY`
  - `KYO_RELEVANCE_API_KEY`
  - `KYO_KORE_API_KEY`
  - `KYO_X402_API_KEY`
  - `KYO_DIRECT_API_KEY`
- optional transport policy:
  - `KYO_ALLOW_INSECURE_HTTP_FEEDS=true|false` (default `false`)
  - `KYO_ALLOW_FILE_FEEDS_ANYWHERE=true|false` (default `false`, keep scoped to runtime dir)
- optional loop cost controls:
  - `KYO_AGENT_TIMEOUT_SECONDS=120` (default `120`)
- inference controls:
  - `KYO_ENABLE_AGENT_HEARTBEAT=true|false` (default `false`)
  - `KYO_REQUIRE_GATEWAY_HEALTH=true|false` (default follows `KYO_ENABLE_AGENT_HEARTBEAT`)
- optional: `KYO_BOOTSTRAP_FEED_FALLBACK=true|false`
- autonomy guard controls:
  - `KYO_REQUIRE_RUNTIME_GUARDS=true|false` (default `true`)
  - `KYO_REQUIRE_KYOSHIN_RUNTIME=true|false` (default `true`)
  - `KYO_REQUIRE_RUNTIME_ARTIFACT_CONTRACTS=true|false` (default `true`)
  - `KYO_REQUIRE_X402_FEED=true|false` (default `false`)
  - `KYO_REQUIRE_RECEIPT_SYNC=true|false` (default `false`)
  - `KYO_ENABLE_SENTRY_PIPELINE=true|false` (default `true`)
  - `KYO_REQUIRE_SENTRY_PIPELINE=true|false` (default `false`)
  - `KYO_HEARTBEAT_MAX_ASSIGNMENTS=3`
- x402 self-facilitator feed controls:
  - `KYO_X402_FACILITATOR_BASE_URL=https://<your-api-origin>` (if set and `KYO_X402_PRICING_URL{,S}` unset, defaults to `<base>/api/paid/pricing`)
  - `KYO_X402_PRICING_URL=https://<origin>/api/paid/pricing`
  - `KYO_X402_PRICING_URLS=https://a/api/paid/pricing,https://b/api/paid/pricing`
  - `KYO_X402_ENDPOINTS_JSON=[{"url":"https://...","method":"POST","priceUsd":0.01,"expectedPayoutUsd":0.08}]`
  - `KYO_X402_EXPECTED_MARGIN_MULTIPLIER=3`
  - `KYO_X402_MIN_PAYOUT_USD=0.01`
  - `KYO_X402_GENERATED_FEED_ENABLED=true|false` (default `true`)
- x402 paid execution controls (`agentcash`):
  - `KYO_ENABLE_X402_AGENTCASH=true|false` (default `true`)
  - `KYO_REQUIRE_X402_AGENTCASH=true|false` (default `false`)
  - `KYO_X402_ALLOWLIST_PATH=~/.openclaw/workspace/runtime/feeds/x402-allowlist.json`
  - `KYO_X402_MAX_PAID_CALLS_PER_TICK=3`
  - `KYO_MIN_JOB_MARGIN_USD=0`
  - `KYO_MIN_JOB_SUCCESS_PROB=0.55`
  - `KYO_MAX_JOB_COST_USD=50`
  - `KYO_X402_AGENTCASH_CHECK_TIMEOUT_SECONDS=45`
  - `KYO_X402_AGENTCASH_FETCH_TIMEOUT_SECONDS=90`
  - `KYO_X402_AGENTCASH_CHECK_ONLY=true|false` (default `false`)
- DX Terminal feed controls:
  - `KYO_DX_TERMINAL_ENABLED=true|false` (default `true`)
  - `KYO_DX_TERMINAL_GENERATED_FEED_ENABLED=true|false` (default `true`)
  - `KYO_DX_TERMINAL_FEED_URL=https://...` (optional override; if set, live URL wins)
  - `KYO_DX_TERMINAL_API_BASE_URL=https://api.terminal.markets/api/v1`
  - `KYO_DX_TERMINAL_MAX_OPPORTUNITIES=24`
  - `KYO_DX_TERMINAL_MAX_LEADERBOARD=8`
  - `KYO_DX_TERMINAL_MAX_TOKENS=12`
  - `KYO_DX_TERMINAL_MIN_TOKEN_VOLUME_USD=5000`
  - `KYO_DX_TERMINAL_MIN_TOKEN_HOLDERS=50`
  - `KYO_DX_TERMINAL_TIMEFRAME=15m`
  - `KYO_DX_TERMINAL_OWNER_ADDRESS=0x...` (optional owner-vault snapshot)
  - `KYO_REQUIRE_DX_TERMINAL_FEED=true|false` (default `false`, turns DX feed into a hard gate)
- receipt sync controls:
  - `KYO_KYOSHIN_DB_PATH=/absolute/path/to/services/kyoshin/output/kyoshin/state.db`
  - `KYO_RECEIPT_SYNC_MAX_BATCH=1000`
  - `KYO_RECEIPT_SOL_PRICE_USD=150`
  - `KYO_RECEIPT_ESTIMATED_FEE_SOL=0.00001`
- runtime bridge controls:
  - `KYO_KYOSHIN_RUNTIME_HEALTH_URL=http://127.0.0.1:4020/health`
  - `KYO_KYOSHIN_RUNTIME_STATUS_URL=http://127.0.0.1:4020/status`
  - `KYO_KYOSHIN_RUNTIME_TOKEN=...` (required if Kyoshin status endpoint is token-gated)
  - `KYO_RUNTIME_BRIDGE_TIMEOUT_SECONDS=8`
  - `KYO_RUNTIME_BRIDGE_SCRAPE_METRICS=true|false` (default `false`)
- nightly proactive controls:
  - `KYO_ENABLE_PROACTIVE_NIGHTLY=true|false` (default `true`)
  - `KYO_PROACTIVE_HOUR_UTC=2`
  - `KYO_PROACTIVE_TIMEOUT_SECONDS=180`
- memory extraction controls:
  - `KYO_ENABLE_MEMORY_EXTRACTION=true|false` (default `true`)
  - `KYO_MEMORY_EXTRACTION_HOUR_UTC=23`
  - `KYO_REQUIRE_MEMORY_EXTRACTION=true|false` (default `false`)
  - `KYO_MEMORY_EXTRACT_MAX_FACTS=200`
- learnings flywheel controls:
  - `KYO_REQUIRE_LEARNINGS=true|false` (default `true`)
  - `KYO_LEARNINGS_MAX_ENTRIES=661`
  - `KYO_LEARNINGS_RECENT_SIGNATURES=200`
- ClawMart monitor controls:
  - `KYO_ENABLE_CLAWMART_STAKING_ROUTE=true|false` (default `true`)
  - `KYO_CLAWMART_STAKING_SOL_PER_SALE=<net-sol-per-sale>`
  - `KYO_CLAWMART_STAKING_KEYPAIR_PATH=/absolute/path/to/keypair.json` (used by fallback `solana transfer`)
  - `KYO_CLAWMART_STAKING_RPC_URL=https://api.mainnet-beta.solana.com` (optional)
  - `KYO_CLAWMART_STAKING_ROUTE_CMD=<custom command returning json txSignature>` (optional override)
  - `KYO_CLAWMART_STAKING_DRY_RUN=true|false` (default `false`)
  - `KYO_ENABLE_CLAWMART_MONITOR=true|false` (default `true`)
  - `KYO_REQUIRE_CLAWMART_MONITOR=true|false` (default `false`)
  - `KYO_CLAWMART_MONITOR_MAX_TASKS=8`
  - `KYO_CLAWMART_MONITOR_TIMEOUT_SECONDS=12`
  - `KYO_CLAWMART_DASHBOARD_URL=https://www.shopclawmart.com/dashboard`
  - `KYO_REQUIRE_CLAWMART_STAKING_ROUTE=true|false` (default `true`)
  - `KYO_KAMIYO_STAKING_POOL_URL=https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d`
  - `KYO_CLAWMART_STAKING_RECEIPTS_PATH=~/.openclaw/workspace/runtime/receipts/clawmart-staking-route.jsonl`
  - `KYO_CLAWMART_ORDER_GROSS_USD=<optional estimate>`
  - `KYO_CLAWMART_ORDER_COST_USD=<optional estimate>`
  - `KYO_CLAWMART_ORDER_NET_USD=<optional override>`
  - `CLAWMART_API_KEY=...` (required for API polling)
- revenue guard controls:
  - `KYO_ENABLE_REVENUE_GUARD=true|false` (default `true`)
  - `KYO_REQUIRE_REVENUE_GUARD=true|false` (default `true`)
  - `KYO_WEEKLY_SPEND_CAP_USD=150`
  - `KYO_X402_ACTIVITY_LOOKBACK_HOURS=72`
  - `KYO_X402_ACTIVITY_GRACE_HOURS=72`
  - `KYO_REVENUE_LEDGER_PATH=~/.openclaw/workspace/runtime/receipts/revenue-ledger.jsonl`
- distribution engine controls:
  - `KYO_ENABLE_DISTRIBUTION_ENGINE=true|false` (default `true`)
  - `KYO_REQUIRE_DISTRIBUTION_ENGINE=true|false` (default `false`)
  - `KYO_DISTRIBUTION_MAX_DISPATCH_PER_CHANNEL_DAY=6`
  - `KYO_DISTRIBUTION_FAILURE_THRESHOLD=3`
  - `KYO_DISTRIBUTION_CHANNEL_COOLDOWN_MINUTES=120`
  - `KYO_DISTRIBUTION_CONTENT_COOLDOWN_MINUTES=180`
  - `KYO_DISTRIBUTION_FALLBACK_ORDER=telegram,discord,slack`
  - `KYO_REQUIRE_SAFE_DISTRIBUTION_COPY=true|false` (default `true`)
  - `KYO_TELEGRAM_CHAT_ID=<required for telegram dispatch>`
- operator log controls:
  - `KYO_ENABLE_OPERATOR_LOG=true|false` (default `true`)
  - `KYO_REQUIRE_OPERATOR_LOG=true|false` (default `false`)
  - `KYO_OPERATOR_LOG_FORCE=true|false` (optional manual override)
- work-or-die policy controls:
  - `KYO_GOVERNOR_WINDOW_DAYS=7`
  - `KYO_GOVERNOR_MIN_ATTEMPTS=3`
  - `KYO_GOVERNOR_MIN_SUCCESS_RATE=0.45`
  - `KYO_GOVERNOR_MIN_NET_SOL=0`
  - `KYO_GOVERNOR_MAX_LOSS_STREAK=3`
- tool-health controls:
  - `KYO_TOOL_HEALTH_TIMEOUT_SECONDS=8`
  - `KYO_DO_AGENT_URL=https://<agent-id>.agents.do-ai.run` (optional, adds authenticated completion probe)
  - `KYO_DO_AGENT_API_KEY=...` (required when `KYO_DO_AGENT_URL` is set)
  - `KYO_DO_AGENT_CHECK_RETRIEVAL_METHOD=none|rewrite|step_back|sub_queries` (default `none`)
  - `KYO_DO_AGENT_CHECK_PROMPT=...` (optional lightweight probe prompt)
  - `KYO_DO_AGENT_CHECK_CRITICAL=true|false` (default `false`)
- sentry pipeline controls:
  - `KYO_SENTRY_WEBHOOK_INBOX_PATH=/absolute/path/to/sentry-alerts.jsonl`
  - `KYO_SENTRY_TRIAGE_OUTPUT_PATH=/absolute/path/to/sentry-triage.json`
  - `KYO_SENTRY_TRIAGE_STATE_PATH=/absolute/path/to/sentry-pipeline-state.json`
  - `KYO_SENTRY_MAX_INCIDENTS=200`

To ingest one Sentry webhook payload into the runtime queue:

```bash
cat sentry-payload.json | ~/bin/kyoshin-sentry-pipeline.py --ingest
```

Once URLs are present, each autonomy cycle re-syncs `marketplace-feeds.json` automatically and prefers live URLs over bootstrap feed files.
For x402 specifically, if `KYO_X402_FEED_URL` is empty and generated feed is enabled, feed sync automatically uses `runtime/feeds/x402-opportunities.json`.
For DX specifically, if `KYO_DX_TERMINAL_FEED_URL` is empty and generated feed is enabled, feed sync automatically uses `runtime/feeds/dx-terminal-opportunities.json`.
You can start from [`ops/openclaw/revenue-mode.env.example`](./revenue-mode.env.example) and copy values into `~/.openclaw/.env`.

When staking-route enforcement is enabled, ClawMart earnings are considered compliant only if the receipt file includes a checkpoint row for the configured pool URL:

```json
{"source":"clawmart","stakingPoolUrl":"https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d","clawMartTotalSalesRouted":12,"txSignature":"<solana_sig>","at":"2026-02-27T20:00:00Z"}
```

If `totalSales` exceeds the latest routed checkpoint, `kyoshin-clawmart-monitor.py` emits `ok=false`, adds a `clawmart_staking_route` task, and blocks the cycle when `KYO_REQUIRE_CLAWMART_MONITOR=true`.
`kyoshin-clawmart-staking-route.py` runs earlier in the same tick and advances that checkpoint by executing the transfer + receipt append.

### Zero-inference baseline

If you want zero Anthropic/OpenAI spend in this loop, keep:

```bash
KYO_ENABLE_AGENT_HEARTBEAT=false
KYO_REQUIRE_GATEWAY_HEALTH=false
KYO_REQUIRE_KYOSHIN_RUNTIME=true
```

This keeps intake/planning/governor/mission-control active while grounding health on the execution runtime instead of LLM heartbeats.

### Fast live proof (no paid API key required)

Use a public `direct_api` source immediately:

```bash
export KYO_DIRECT_API_FEED_URL='https://api.github.com/search/issues?q=is%3Aissue+is%3Aopen+label%3Abounty&per_page=25'
```

This gives non-synthetic external opportunities right away. Replace it with your paid endpoint when available.

## Living-AI baseline (required)

These files are enforced by `kyoshin-context-guard.py`:

- `SOUL.md`
- `IDENTITY.md`
- `MEMORY.md`
- `AGENTS.md`
- `soul.md` (legacy compatibility mirror)
- `identity.md` (legacy compatibility mirror)
- `heartbeat.md`
- `MISSION_STATEMENT.md`
- `USER_PROFILE.md`
- `GOALS.md`
- `AMBITIONS.md`
- `TOOLS.md`
- `WORKING-MEMORY.md`
- `.learnings/LEARNINGS.md`

If these are empty/placeholder, the cycle is marked `degraded`.

## ClawWork-style subagent policy

`kyoshin-swarm-governor.py` applies `work / earn / or die` policy from execution receipts:

- weak agents are auto-paused (`status=paused`) when success/profit/loss-streak thresholds fail.
- strong agents get priority boosts.
- one fallback agent is always kept active to avoid total stall.

Write execution outcomes as JSON lines to:

- `~/.openclaw/workspace/runtime/receipts/execution-receipts.jsonl`

Expected fields per line:

- `agentId` (string)
- `status` (`completed|success|ok|paid|settled|failed`)
- `profitSol` (number, can be negative)
- `executedAt` (ISO timestamp)

## Notes

- This loop proves unattended autonomy operation, but it will remain idle until feed URLs and execution credentials are configured.
- Feed sync rejects unsupported URL schemes and only allows `https://` by default (`http://` requires explicit opt-in).
- `file://` feed URLs are constrained to `~/.openclaw/workspace/runtime` unless `KYO_ALLOW_FILE_FEEDS_ANYWHERE=true`.
- Intake and planner artifacts are written with `0600` file permissions inside `0700` runtime directories.
- The loop uses a host-local file lock to prevent overlapping control-loop executions.
- Provider-level model rejections (for example exhausted credits) are treated as degraded cycles only when agent heartbeat is enabled.
- The loop now enforces: context completeness, tool-health critical checks, mission-control generation, nightly proactive execution, learnings capture on degraded cycles, and nightly durable-memory extraction.
- Keep gateway bind on loopback by default; use private-network access paths only.
