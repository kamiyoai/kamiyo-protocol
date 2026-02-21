# Kyoshin OpenClaw Runtime Artifacts

This folder versions the deployed autonomy loop artifacts used on the OpenClaw droplet.

## Files

- `kyoshin-marketplace-intake.py`: marketplace feed polling and normalization.
- `kyoshin-swarm-planner.py`: opportunity-to-subagent assignment planner.
- `kyoshin-sync-feed-config.py`: per-cycle feed config sync (live URLs from env, bootstrap fallback).
- `kyoshin-autonomy-loop.sh`: single autonomy control-loop tick.
- `kyoshin-autonomy-loop.service`: systemd oneshot service for a loop tick.
- `kyoshin-autonomy-loop.timer`: systemd timer (`OnUnitActiveSec=5min`).

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
- optional: `KYO_BOOTSTRAP_FEED_FALLBACK=true|false`

Once URLs are present, each autonomy cycle re-syncs `marketplace-feeds.json` automatically and prefers live URLs over bootstrap feed files.

## Notes

- This loop proves unattended autonomy operation, but it will remain idle until feed URLs and execution credentials are configured.
- Keep gateway bind on loopback by default; use private-network access paths only.
