# Kamiyo Agent Exec (DigitalOcean)

This folder contains the source-controlled deployment assets for running
`kamiyo-agent-exec` on a hardened DigitalOcean droplet with staged canary caps.

## Files

- `install-do.sh`: installs/builds from source and provisions the systemd service.
- `kamiyo-agent-exec.env.example`: hardened baseline config (`canary_0`, `HARD_STOP=true`).
- `kamiyo-agent-exec.service`: systemd unit template.
- `promote-stage.sh`: staged promotion helper (`canary_0 -> canary_1 -> canary_2 -> full`).
- `guarded-promote.sh`: stage promotion with economics gate checks and auto-rollback.
- `preflight.sh`: policy preflight for key/staking guard checks before mutation stages.
- `watchdog.sh`: duplicate-process guard + health watchdog.
- `kamiyo-agent-watchdog.service` / `.timer`: watchdog scheduler (every 2 minutes).
- `assessment-growth.sh`: protocol assessment/dispute growth runner wrapper.
- `kamiyo-agent-assessment-bootstrap.service`: one-shot initial bootstrap run.
- `kamiyo-agent-assessment-growth.service` / `.timer`: recurring daily growth run.

## First deploy (run on droplet as root)

```bash
export KAMIYO_APP_ROOT="$HOME/local/kamiyo-protocol"
cd "$KAMIYO_APP_ROOT"
git fetch origin kamiyo/kamiyo-agent-exec-canary
git checkout kamiyo/kamiyo-agent-exec-canary
git reset --hard origin/kamiyo/kamiyo-agent-exec-canary
bash ops/kamiyo-agent-exec/install-do.sh
```

## Stage promotion

```bash
sudo /usr/local/bin/kamiyo-agent-exec-stage canary_1 true
sudo /usr/local/bin/kamiyo-agent-exec-stage canary_1 false
sudo /usr/local/bin/kamiyo-agent-exec-stage canary_2 false
sudo /usr/local/bin/kamiyo-agent-exec-stage full false
```

Use `true` in the second argument to force hard-stop on that stage.

Guarded promotion (with pre/post gates + rollback):

```bash
sudo /usr/local/bin/kamiyo-agent-exec-stage-guarded canary_1 false
sudo /usr/local/bin/kamiyo-agent-exec-stage-guarded canary_2 false
```

Gate check only (no stage mutation):

```bash
sudo /usr/local/bin/kamiyo-agent-exec-stage-guarded --gate-check
```

Optional gate env keys in `/etc/kamiyo/kamiyo-agent-exec.env`:
- `KAMIYO_CANARY_GATE_MIN_SETTLED_JOBS` (default `1`)
- `KAMIYO_CANARY_GATE_MIN_EXECUTED_JOBS` (default `1`)
- `KAMIYO_CANARY_GATE_MIN_NET_SOL` (default `0`)
- `KAMIYO_CANARY_GATE_MAX_PENDING_INTAKE` (default `200`)
- `KAMIYO_CANARY_GATE_GRACE_SECONDS` (default `900`)

## Preflight

```bash
sudo /usr/local/bin/kamiyo-agent-exec-preflight
```

When `hard-stop=false`, preflight fails if operator key material is missing.

## Watchdog

Installed by `install-do.sh`:
- timer: `kamiyo-agent-watchdog.timer`
- service: `kamiyo-agent-watchdog.service`

Manual run:

```bash
sudo /usr/local/bin/kamiyo-agent-exec-watchdog
```

## Protocol stats growth loop

The growth runner executes the full protocol loop per cycle:
`initialize_escrow -> mark_disputed -> resolve_dispute`.

It is configured in `/etc/kamiyo/kamiyo-agent-exec.env` using `KYO_ASSESS_*` keys.
Required live keys:

- `KYO_ASSESS_LIVE=true`
- `KAMIYO_OPERATOR_KEYPAIR_PATH` or `KAMIYO_OPERATOR_PRIVATE_KEY`
- `KYO_ASSESS_ORACLE_KEYPAIR_PATH` or `KYO_ASSESS_ORACLE_PRIVATE_KEY`

Defaults include:

- bootstrap target: `KYO_ASSESS_BOOTSTRAP_TARGET=1000`
- daily randomized growth: `KYO_ASSESS_DAILY_*`
- persistent state file: `KYO_ASSESS_STATE_PATH=.../assessment-growth-state.json`
- optional IDL override: `KYO_ASSESS_IDL_PATH=.../x402_escrow.json`

Run the first bootstrap immediately:

```bash
sudo systemctl start kamiyo-agent-assessment-bootstrap.service
sudo journalctl -u kamiyo-agent-assessment-bootstrap.service -n 200 --no-pager
```

Daily growth is scheduled by:

```bash
sudo systemctl status kamiyo-agent-assessment-growth.timer
sudo systemctl list-timers | grep kamiyo-agent-assessment-growth
```
