# Kyoshin OpenClaw Droplet Execution (2026-02-20)

## Scope

Provision and harden a dedicated Ubuntu 24.04 droplet for 24/7 OpenClaw runtime under an `openclaw` service account, then wire a continuous autonomy loop for swarm intake and task planning.

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
- Confirmed embedded Claude execution succeeds under `openclaw` user context.

### 3) Persistent 24/7 service

- Added systemd unit: `openclaw-gateway.service`.
- Service runs as `openclaw` and auto-restarts.
- Current state: `enabled` + `active`.
- Current gateway config:
  - bind: `loopback`
  - tailscale mode: `off` (intentionally disabled because tailnet serve is not enabled)
- Health check: `openclaw gateway health --json` returns `ok: true`.

### 4) Workspace/autonomy scaffold (identity + memory)

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

### 5) Security and maintenance automation

- Locked down OpenClaw state permissions (`700` dirs, `600` files).
- Ran initial security audit:
  - `openclaw security audit --deep --fix --json`
  - result: no findings.
- Installed daily jobs for `openclaw` user:
  - security audit (`00:00 UTC`)
  - backup (`00:15 UTC`, 14-day retention)

### 6) Swarm autonomy runtime loop (implemented)

Installed runtime scripts under `~/bin`:

- `kyoshin-marketplace-intake.py`
  - reads feed config from `workspace/runtime/marketplace-feeds.json`
  - fetches and normalizes marketplace opportunities
  - writes:
    - `workspace/runtime/feeds/opportunities.json`
    - `workspace/runtime/feeds/opportunities-summary.json`
    - `workspace/runtime/logs/marketplace-intake.jsonl`
- `kyoshin-swarm-planner.py`
  - loads opportunities and a swarm registry
  - computes agent assignment queue
  - writes:
    - `workspace/runtime/queue/assignments.json`
    - `workspace/runtime/queue/assignments-summary.json`
    - `workspace/runtime/logs/swarm-planner.jsonl`
- `kyoshin-autonomy-loop.sh`
  - runs one control-loop tick:
    - feed config sync (live URLs from env, bootstrap fallback)
    - gateway health probe with retry
    - marketplace intake
    - swarm planning
    - one local OpenClaw agent heartbeat/decision turn
    - state/log persistence to `workspace/runtime/state` and `workspace/runtime/logs`

Installed scheduler:

- `kyoshin-autonomy-loop.service` (oneshot, runs as `openclaw`)
- `kyoshin-autonomy-loop.timer` (`OnUnitActiveSec=5min`, persistent)

Current result:

- autonomy cycles are running and producing `status=ok` entries in:
  - `workspace/runtime/logs/autonomy-loop.jsonl`
- latest loop state is persisted in:
  - `workspace/runtime/state/autonomy-loop-state.json`

### 7) Non-empty swarm cycle validation (implemented)

Enabled a deterministic bootstrap marketplace feed profile (`file://` seed sources) to validate non-empty end-to-end autonomy behavior without external marketplace credentials.

Observed on-host:

- `marketplace intake`: `feedsConfigured=3`, `accepted=4`
- `swarm planner`: `assignmentCount=4`
- timer-driven autonomy tick (`cycle=9`) recorded:
  - `opportunities=4`
  - `assignments=4`
  - `agentOk=1`

This confirms the runtime can move from idle loop to active queue processing autonomously when opportunities are present.

### 8) Post-deploy hardening + live-cutover prep (2026-02-21)

- Deployed `kyoshin-sync-feed-config.py` to runtime host and wired it into each autonomy tick.
- Rotated runtime `ANTHROPIC_API_KEY` in `~/.openclaw/.env` and restarted `openclaw-gateway.service`.
- Verified runtime key replacement by hash comparison (local configured key == remote active key).
- Normalized runtime env keys for live feed cutover:
  - `KYO_BOOTSTRAP_FEED_FALLBACK=true`
  - `KYO_AGENT_AI_FEED_URL=`
  - `KYO_RELEVANCE_FEED_URL=`
  - `KYO_KORE_FEED_URL=`
  - `KYO_X402_FEED_URL=`
  - `KYO_DIRECT_API_FEED_URL=`
  - `KYO_AGENT_AI_API_KEY=`
  - `KYO_RELEVANCE_API_KEY=`
  - `KYO_KORE_API_KEY=`
  - `KYO_X402_API_KEY=`
  - `KYO_DIRECT_API_KEY=`
- Verified healthy loop after rotation and env normalization:
  - `cycle=24`
  - `status=ok`
  - `feedSync.ok=true`
  - `feedSync` source map now includes `x402` and `direct_api` rails (`direct_api` live, `x402` disabled pending URL)
  - `opportunities=29`
  - `assignments=12`
  - `agentOk=1`
- Enabled real external intake on `direct_api` rail:
  - `KYO_DIRECT_API_FEED_URL=https://api.github.com/search/issues?q=is%3Aissue+is%3Aopen+label%3Abounty&per_page=25`
  - loop now ingests non-bootstrap opportunities each cycle without requiring marketplace credentials.
- Hardened control loop and intake runtime:
  - added single-run lock (`flock`) to prevent overlapping loop executions
  - replaced shared `/tmp` artifacts with per-cycle temp directory + trap cleanup
  - gateway health and provider-rejection replies now participate in degraded/ok cycle status
  - feed sync + intake now enforce strict URL schemes (`https`/`file` default; `http` only with `KYO_ALLOW_INSECURE_HTTP_FEEDS=true`)
  - intake/planner runtime artifacts now enforce `0600` files in `0700` runtime directories
  - lock contention emits explicit `status=skipped, reason=lock_busy` log entries
  - applied runtime cost defaults after rapid credit burn:
    - `OPENCLAW_MODEL=claude-sonnet-4-20250514`
    - `KYO_AGENT_TIMEOUT_SECONDS=120`
    - `kyoshin-autonomy-loop.timer` cadence moved from `5min` to `30min`

## Remaining blockers for full revenue autonomy

1. `agent_ai`, `relevance`, `kore`, and `x402` live feed URLs remain unset; only `direct_api` is live.
2. Marketplace API credentials for paid job execution/settlement (`KYO_*_API_KEY`) are placeholders.
3. No payout/receipt connector is wired yet to route realized fees into SOL and onward to staking.
4. Tailnet serve is not enabled at the tailnet policy level, so gateway remains loopback-only by design.
5. Anthropic provider balance is currently depleted on host, so agent step degrades until credits are restored.

## Security note

- Runtime `ANTHROPIC_API_KEY` has been rotated in `~/.openclaw/.env`.
- The previously exposed key should still be revoked upstream in the Anthropic console if not already revoked.

## Operational commands

```bash
sudo ~/bin/tailscale-init.sh
sudo ~/bin/openclaw-bind-tailnet.sh
sudo systemctl restart openclaw-gateway.service
sudo -u openclaw -H bash -lc 'export PATH=$HOME/.npm-global/bin:$PATH && openclaw gateway health --json'
sudo systemctl start kyoshin-autonomy-loop.service
sudo systemctl status kyoshin-autonomy-loop.timer --no-pager
sudo ~/bin/kyoshin-runtime-health.sh
```

## Notes

- This deployment now has a persistent autonomy loop, not only a static scaffold.
- The runtime currently proves unattended operation and stateful decision cycles; it does not yet prove fee-generating autonomy because external paid feeds/endpoints are still missing.
- One existing droplet remains inaccessible with current SSH key material and was not modified.
