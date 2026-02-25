# Kyoshin OpenClaw Artifact-Contracts Rollout (2026-02-25)

## Goal

Deploy `kyoshin-artifact-contracts.py` and updated `kyoshin-autonomy-loop.sh` to runtime host, then verify one real tick.

## One-command rollout

Run on the host that executes `kyoshin-autonomy-loop.service`:

```bash
cd ~/local/kamiyo-protocol/ops/openclaw
./rollout-artifact-contracts.sh
```

Notes:
- defaults target user: `openclaw`
- override user/home if needed:
  - `OPENCLAW_USER=<user>`
  - `OPENCLAW_HOME=/home/<user>`

## What this does

1. installs:
   - `kyoshin-artifact-contracts.py` -> `~/bin/kyoshin-artifact-contracts.py`
   - `kyoshin-autonomy-loop.sh` -> `~/bin/kyoshin-autonomy-loop.sh`
2. ensures env keys exist in `~/.openclaw/.env`:
   - `KYO_REQUIRE_RUNTIME_ARTIFACT_CONTRACTS=true`
   - `KYO_REQUIRE_KYOSHIN_RUNTIME=true`
3. starts one loop tick via `systemctl start kyoshin-autonomy-loop.service`
4. prints:
   - `runtime/state/runtime-artifact-contracts.json`
   - last event in `runtime/logs/autonomy-loop.jsonl`

## Pass criteria

- `runtime-artifact-contracts.json` has:
  - `"ok": true`
  - `"errors": []`
- last `autonomy-loop.jsonl` event has:
  - `"status": "ok"`
  - `artifactContracts.ok=true` in the embedded object

## If it degrades

- `artifact_contracts_failed` in `runtime/state/autonomy-loop-state.json:lastError` means contract validation failed.
- inspect:
  - `runtime/state/runtime-artifact-contracts.json.errors`
  - malformed artifact file path from each report entry
- fix producer script/output and rerun:

```bash
sudo systemctl start kyoshin-autonomy-loop.service
```
