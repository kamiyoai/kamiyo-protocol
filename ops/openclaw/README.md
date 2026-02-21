# Kyoshin OpenClaw Runtime Artifacts

This folder versions the deployed autonomy loop artifacts used on the OpenClaw droplet.

## Files

- `kyoshin-marketplace-intake.py`: marketplace feed polling and normalization.
- `kyoshin-swarm-planner.py`: opportunity-to-subagent assignment planner.
- `kyoshin-sync-feed-config.py`: per-cycle feed config sync (live URLs from env, bootstrap fallback).
- `kyoshin-autonomy-loop.sh`: single autonomy control-loop tick.
- `kyoshin-autonomy-loop.service`: systemd oneshot service for a loop tick.
- `kyoshin-autonomy-loop.timer`: systemd timer (`OnUnitActiveSec=30min`).

## Install on host

```bash
sudo install -m 700 -o openclaw -g openclaw kyoshin-marketplace-intake.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-swarm-planner.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-sync-feed-config.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-autonomy-loop.sh ~/bin/
sudo install -m 644 -o root -g root kyoshin-autonomy-loop.service /etc/systemd/system/
sudo install -m 644 -o root -g root kyoshin-autonomy-loop.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kyoshin-autonomy-loop.timer
sudo systemctl start kyoshin-autonomy-loop.service
```

## Runtime paths

- Feed config: `~/.openclaw/workspace/runtime/marketplace-feeds.json`
- Feed output: `~/.openclaw/workspace/runtime/feeds/opportunities.json`
- Assignment output: `~/.openclaw/workspace/runtime/queue/assignments.json`
- Loop state: `~/.openclaw/workspace/runtime/state/autonomy-loop-state.json`
- Loop log: `~/.openclaw/workspace/runtime/logs/autonomy-loop.jsonl`

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
- optional loop cost controls:
  - `KYO_AGENT_TIMEOUT_SECONDS=120` (default `120`)
- optional: `KYO_BOOTSTRAP_FEED_FALLBACK=true|false`

Once URLs are present, each autonomy cycle re-syncs `marketplace-feeds.json` automatically and prefers live URLs over bootstrap feed files.

### Fast live proof (no paid API key required)

Use a public `direct_api` source immediately:

```bash
export KYO_DIRECT_API_FEED_URL='https://api.github.com/search/issues?q=is%3Aissue+is%3Aopen+label%3Abounty&per_page=25'
```

This gives non-synthetic external opportunities right away. Replace it with your paid endpoint when available.

## Notes

- This loop proves unattended autonomy operation, but it will remain idle until feed URLs and execution credentials are configured.
- Feed sync rejects unsupported URL schemes and only allows `https://` by default (`http://` requires explicit opt-in).
- Intake and planner artifacts are written with `0600` file permissions inside `0700` runtime directories.
- The loop uses a host-local file lock to prevent overlapping control-loop executions.
- Provider-level model rejections (for example exhausted credits) are treated as degraded cycles, not successful ticks.
- Keep gateway bind on loopback by default; use private-network access paths only.
