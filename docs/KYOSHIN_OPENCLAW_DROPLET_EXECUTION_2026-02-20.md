# Kyoshin OpenClaw Droplet Execution (2026-02-20)

## Scope

Provision and harden a dedicated Ubuntu 24.04 droplet for 24/7 OpenClaw runtime under an `openclaw` service account.

## Executed

### 1) Base server hardening

- Created non-root user: `openclaw` (sudo-enabled).
- Enforced SSH key auth (`PasswordAuthentication no`).
- Enabled UFW with SSH-only ingress (`22/tcp`).
- Installed and enabled Fail2ban (`sshd` jail active).
- Installed Docker Engine and added `openclaw` to `docker` group.
- Installed Tailscale client (`tailscaled` enabled).

### 2) OpenClaw runtime install

- Installed Node.js 22.
- Installed OpenClaw CLI for `openclaw` user (`2026.2.19-2`).
- Ran non-interactive onboarding with hardened gateway defaults:
  - bind mode: `loopback`
  - auth mode: `token`
  - gateway port: `23456`
  - tailscale mode: `off`
- Rotated gateway token after onboarding.

### 3) Persistent 24/7 service

- Added systemd unit: `openclaw-gateway.service`.
- Service runs as `openclaw` and auto-restarts.
- Current state: `enabled` + `active`.
- Health check: `openclaw gateway health --json` returns `ok: true`.

### 4) Workspace/autonomy scaffold

Created and populated:

- `~/.openclaw/workspace/SOUL.md`
- `~/.openclaw/workspace/IDENTITY.md`
- `~/.openclaw/workspace/USER.md`
- `~/.openclaw/workspace/TOOLS.md`
- `~/.openclaw/workspace/HEARTBEAT.md`
- `~/.openclaw/workspace/WORKING-MEMORY.md`
- `~/.openclaw/workspace/long-term-memory.md`
- `~/.openclaw/workspace/memory/YYYY-MM-DD.md`
- `~/.openclaw/workspace/client-profiles.md`
- `~/.openclaw/workspace/decision-frameworks.md`
- `~/.openclaw/workspace/writing-voice-guide.md`
- `~/.openclaw/workspace/startup-rules.md`
- skills stubs under `~/.openclaw/workspace/skills/*/main.py`

### 5) Security and maintenance automation

- Locked down OpenClaw state permissions (`700` dirs, `600` files).
- Ran initial security audit:
  - `openclaw security audit --deep --fix --json`
  - result: no findings.
- Installed daily jobs for `openclaw` user:
  - security audit (`00:00 UTC`)
  - backup (`00:15 UTC`, 14-day retention)

## Remaining blockers for full "living AI"

1. `ANTHROPIC_API_KEY` is not set in `~/.openclaw/.env` yet.
2. Tailscale is installed but not joined to tailnet (`NeedsLogin`).
3. Gateway is intentionally loopback-only until Tailscale auth is complete.
4. Marketplace adapters (Agent.ai, Relevance, Kore) are not wired on this host yet.

## Cutover commands (pending secrets)

```bash
sudo -u openclaw -H bash -lc 'vim ~/.openclaw/.env'
sudo -u openclaw -H bash -lc '~/bin/tailscale-init.sh'
sudo -u openclaw -H bash -lc '~/bin/openclaw-bind-tailnet.sh'
sudo systemctl restart openclaw-gateway.service
sudo -u openclaw -H bash -lc 'openclaw gateway health --json'
```

## Notes

- This deployment establishes a real autonomous runtime foundation (persistent loop + heartbeat + service recovery), but it is not production-live without provider credentials.
- One existing droplet remains inaccessible with current SSH key material and was not modified.
