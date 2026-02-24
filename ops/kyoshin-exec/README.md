# Kyoshin Exec (DigitalOcean)

This folder contains the source-controlled deployment assets for running
`kamiyo-kyoshin-exec` on a hardened DigitalOcean droplet with staged canary caps.

## Files

- `install-do.sh`: installs/builds from source and provisions the systemd service.
- `kyoshin-exec.env.example`: hardened baseline config (`canary_0`, `HARD_STOP=true`).
- `kamiyo-kyoshin-exec.service`: systemd unit template.
- `promote-stage.sh`: staged promotion helper (`canary_0 -> canary_1 -> canary_2 -> full`).
- `preflight.sh`: policy preflight for key/staking guard checks before mutation stages.

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

## Preflight

```bash
sudo /usr/local/bin/kamiyo-kyoshin-exec-preflight
```

When `hard-stop=false`, preflight fails if operator key material is missing.
