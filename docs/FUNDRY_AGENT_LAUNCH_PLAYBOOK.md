# Fundry Agent Launch Playbook

This is the default template for all future Fundry agent launches.

Hard rule: every run routes SOL toward the `$KAMIYO` staking pool.

Swarm standard: Kyoshin is the parent operator, and each subagent has its own coin.

## Non-Negotiable Defaults

- `KAMIYO_STAKING_POOL=9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d`
- `KAMIYO_AUTO_STAKE_ENABLED=true`
- `KAMIYO_AUTO_STAKE_MIN_LAMPORTS=50000000`
- `KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS=200000000`
- `KAMIYO_AUTO_STAKE_AVAILABLE_BPS=5000`
- `KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX=0`

Policy: route 50% of available SOL each run, keep a 0.2 SOL reserve, no max per tx cap.

Per-subagent coin policy:
- One subagent = one coin mint.
- Do not reuse the same coin mint for different subagent mandates.
- Every subagent coin still routes earned SOL to the shared `$KAMIYO` staking pool.

## Launch Inputs (Fill Before Launch)

- Parent controller (`kyoshin`)
- Subagent name
- Subagent role/mandate
- Subagent token mint (unique per subagent)
- Fundry config address
- Fundry fee vault address
- Source staking pool address for this agent
- Source claimer signer keypair path for this agent

## Operator Template (Required)

Set these in `services/kamiyo-operator/.env` for each subagent launch profile:

```bash
KAMIYO_MODE=execute
KAMIYO_RUN_ONCE=false

KAMIYO_AGENT_NAME=<subagent_name>
KAMIYO_TARGET_MINT=<subagent_unique_mint>
KAMIYO_FEE_VAULT=<fundry_fee_vault>
KAMIYO_STAKING_POOL=9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d

KAMIYO_FUNDRY_API_BASE_URL=https://fundry.collaterize.com

# Historical env key names. Current behavior applies to any subagent source pool/claimer.
KAMIYO_KYOSHIN_STAKING_POOL=<agent_source_staking_pool>
KAMIYO_KYOSHIN_CLAIMER_KEYPAIR_PATH=<agent_source_signer_keypair>
KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED=true
KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS=0
KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN=8

KAMIYO_SWARM_ENABLED=true
KAMIYO_SWARM_PROPOSE_ONLY=true
KAMIYO_SWARM_REGISTRY_PATH=output/kamiyo-operator/swarm.registry.json
KAMIYO_SWARM_MISSIONS_PER_TICK=3
KAMIYO_SWARM_MAX_ACTIVE_AGENTS=5
```

Run one profile per subagent coin. Keep signer files and profile values isolated.
Populate `KAMIYO_SWARM_REGISTRY_PATH` from `docs/KYOSHIN_SWARM_REGISTRY_TEMPLATE.json`.
`KAMIYO_SWARM_REGISTRY_PATH` is resolved from `services/kamiyo-operator`; use an absolute path if you keep registry data elsewhere.

## Runbook

1. Build operator:

```bash
cd "$HOME/local/kamiyo-protocol"
pnpm --filter @kamiyo/kamiyo-operator run build
```

2. One-shot verification tick (safe runtime validation):

```bash
cd "$HOME/local/kamiyo-protocol"
KAMIYO_RUN_ONCE=true \
KAMIYO_LOCK_PATH=output/kamiyo-operator/runner.verify.lock \
KAMIYO_DB_PATH=output/kamiyo-operator/state.verify.db \
KAMIYO_OUTBOX_DIR=output/kamiyo-operator/outbox \
pnpm --filter @kamiyo/kamiyo-operator start
```

3. Verify routing fields in latest observation:

```bash
sqlite3 "$HOME/local/kamiyo-protocol/output/kamiyo-operator/state.verify.db" \
  "select json from observations order by id desc limit 1;" \
  | jq '{kyoshinClaimer,kyoshinAutoClaim,autoStake,kyoshinRoute}'
```

4. Expected success criteria:
- `autoStake.executed=true`
- `autoStake.pool=9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d`
- `kyoshinRoute.executed=true` when source signer is separate and has available SOL
- `kyoshinAutoClaim.reason=no_claimable_periods` is acceptable when no rewards are claimable yet

5. Restart daemon with live config:

```bash
cd "$HOME/local/kamiyo-protocol"
pnpm --filter @kamiyo/kamiyo-operator run daemon:status
launchctl kickstart -k gui/$(id -u)/ai.kamiyo.operator
pnpm --filter @kamiyo/kamiyo-operator run daemon:status
```

## Live Monitoring

Check latest runtime observation:

```bash
sqlite3 "$HOME/local/kamiyo-protocol/output/kamiyo-operator/state.db" \
  "select json from observations order by id desc limit 1;" \
  | jq '{at,operator,kyoshinClaimer,kyoshinAutoClaim,autoStake,kyoshinRoute}'
```

Check daemon errors:

```bash
tail -n 120 "$HOME/local/kamiyo-protocol/output/kamiyo-operator/launchd.err.log"
```

## Failure Modes

- `ANTHROPIC_API_KEY` missing:
  - Operator exits at startup. Set a non-empty API key in `.env`.
- `kyoshinRoute.reason=same_wallet_as_operator`:
  - Source signer equals operator signer. Routing still happens through `autoStake`, but no separate source route path is executed.
- `below_threshold`:
  - Wallet balance after reserve is below minimum stake threshold.

## Launch Checklist

- Fundry launch is live
- Subagent metadata is correct
- Subagent coin mint is unique to this mandate
- Operator `.env` set with source signer and source pool
- One-shot verify tick passes
- Live daemon restarted
- Latest observation shows routing to `$KAMIYO` staking pool
