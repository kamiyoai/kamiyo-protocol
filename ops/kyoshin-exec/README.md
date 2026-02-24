# Kyoshin Exec (DigitalOcean)

This folder contains the source-controlled deployment assets for running
`kamiyo-kyoshin-exec` on a hardened DigitalOcean droplet with staged canary caps.

## Files

- `install-do.sh`: installs/builds from source and provisions the systemd service.
- `kyoshin-exec.env.example`: hardened baseline config (`canary_0`, `HARD_STOP=true`).
- `kamiyo-kyoshin-exec.service`: systemd unit template.
- `promote-stage.sh`: staged promotion helper (`canary_0 -> canary_1 -> canary_2 -> full`).
- `guarded-promote.sh`: stage promotion with economics gate checks and auto-rollback.
- `preflight.sh`: policy preflight for key/staking guard checks before mutation stages.
- `watchdog.sh`: duplicate-process guard + health watchdog.
- `kamiyo-kyoshin-watchdog.service` / `.timer`: watchdog scheduler (every 2 minutes).

## First deploy (run on droplet as root)

```bash
export KAMIYO_APP_ROOT="$HOME/local/kamiyo-protocol"
cd "$KAMIYO_APP_ROOT"
git fetch origin kamiyo/kyoshin-exec-canary
git checkout kamiyo/kyoshin-exec-canary
git reset --hard origin/kamiyo/kyoshin-exec-canary
bash ops/kyoshin-exec/install-do.sh
```

## Stage promotion

```bash
sudo /usr/local/bin/kamiyo-kyoshin-exec-stage canary_1 true
sudo /usr/local/bin/kamiyo-kyoshin-exec-stage canary_1 false
sudo /usr/local/bin/kamiyo-kyoshin-exec-stage canary_2 false
sudo /usr/local/bin/kamiyo-kyoshin-exec-stage full false
```

Use `true` in the second argument to force hard-stop on that stage.

Guarded promotion (with pre/post gates + rollback):

```bash
sudo /usr/local/bin/kamiyo-kyoshin-exec-stage-guarded canary_1 false
sudo /usr/local/bin/kamiyo-kyoshin-exec-stage-guarded canary_2 false
```

Optional gate env keys in `/etc/kamiyo/kyoshin-exec.env`:
- `KAMIYO_CANARY_GATE_MIN_SETTLED_JOBS` (default `1`)
- `KAMIYO_CANARY_GATE_MIN_NET_SOL` (default `0`)
- `KAMIYO_CANARY_GATE_MAX_PENDING_INTAKE` (default `200`)
- `KAMIYO_CANARY_GATE_GRACE_SECONDS` (default `900`)

## Preflight

```bash
sudo /usr/local/bin/kamiyo-kyoshin-exec-preflight
```

When `hard-stop=false`, preflight fails if operator key material is missing.

## Watchdog

Installed by `install-do.sh`:
- timer: `kamiyo-kyoshin-watchdog.timer`
- service: `kamiyo-kyoshin-watchdog.service`

Manual run:

```bash
sudo /usr/local/bin/kamiyo-kyoshin-exec-watchdog
```
