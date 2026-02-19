# Fundry Agent Launch Playbook

This is the default template for all future Fundry agent launches.

Hard rule: every run routes SOL toward the `$KAMIYO` staking pool.

## Non-Negotiable Defaults

- `KAMIYO_STAKING_POOL=9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d`
- `KAMIYO_AUTO_STAKE_ENABLED=true`
- `KAMIYO_AUTO_STAKE_MIN_LAMPORTS=50000000`
- `KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS=200000000`
- `KAMIYO_AUTO_STAKE_AVAILABLE_BPS=5000`
- `KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX=0`

Policy: route 50% of available SOL each run, keep a 0.2 SOL reserve, no max per tx cap.

## Launch Inputs (Fill Before Launch)

- Agent name
- Agent token mint
- Fundry config address
- Fundry fee vault address
- Source staking pool address for this agent
- Source claimer signer keypair path for this agent

## Operator Template (Required)

Set these in `services/kamiyo-operator/.env` for each launch:

```bash
KAMIYO_MODE=execute
KAMIYO_RUN_ONCE=false

KAMIYO_TARGET_MINT=<agent_mint>
KAMIYO_FEE_VAULT=<fundry_fee_vault>
KAMIYO_STAKING_POOL=9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d

KAMIYO_FUNDRY_API_BASE_URL=https://fundry.collaterize.com

# Historical name, current behavior: source staking pool to claim from
KAMIYO_KYOSHIN_STAKING_POOL=<agent_source_staking_pool>
KAMIYO_KYOSHIN_CLAIMER_KEYPAIR_PATH=<agent_source_signer_keypair>
KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED=true
KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS=0
KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN=8
```

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
- Agent metadata is correct
- Operator `.env` set with source signer and source pool
- One-shot verify tick passes
- Live daemon restarted
- Latest observation shows routing to `$KAMIYO` staking pool
