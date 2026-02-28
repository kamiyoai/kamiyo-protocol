# Kamiyo PoCH Conservative Rollout Runbook (March 1-21, 2026)

## Objective
Move PoCH from implemented-and-tested to operationally safe production usage, then promote to `gate_high_impact` only after meeting promotion SLOs.

## Scope
- PoCH only.
- No unrelated OpenClaw or non-PoCH feature work.
- No threshold/profile changes during active stage windows.

## Production Defaults
Set the following values in production runtime before rollout:

```bash
POCH_ENABLED=true
POCH_ENFORCEMENT_MODE=observe
POCH_SLASHING_MODE=progressive
POCH_THRESHOLD_PROFILE=v1
POCH_ROLLOUT_EVALUATOR_INTERVAL_MS=300000
POCH_ROLLBACK_BLOCKING_DISPUTE_OPEN_THRESHOLD=50
POCH_ROLLOUT_OBSERVE_START_AT=2026-03-03T00:00:00Z
POCH_ROLLOUT_SOFT_START_AT=2026-03-10T00:00:00Z
POCH_ROLLOUT_GATE_START_AT=2026-03-17T00:00:00Z
```

## Action Scope (Fixed for Canary)
- `stake_amplification`
- `premium_attestation`
- `high_trust_agent_action`

## Stage Calendar
1. `2026-03-01` to `2026-03-02` (UTC): release readiness and drills.
2. `2026-03-03` to `2026-03-09` (UTC): `observe`.
3. `2026-03-10` to `2026-03-16` (UTC): `soft` if promotion gates pass.
4. Earliest `2026-03-17` (UTC): `gate_high_impact` if promotion gates pass.
5. `2026-03-18` to `2026-03-21` (UTC): stabilization window.

## Promotion Gates (24h trailing window, all required)
- Oracle reveal completion `>= 0.90`
- Proof pass rate `>= 0.95` (exclude malformed/replayed)
- Unresolved blocking disputes older than 24h `== 0`
- False-positive gating denial rate `< 0.01`

## Automatic Rollback Triggers
- Oracle reveal completion `< 0.80` for 2 consecutive hours.
- Proof failure anomaly `> 2x` baseline for 1 continuous hour.
- Open blocking disputes `> 50` (or configured threshold).

## Automatic Rollback Actions
- `gate_high_impact` -> `soft`
- `soft` -> `observe`
- `observe` stays `observe`, logs critical rollback signal, locks promotion for 24h cooldown

## Canonical API Endpoints
- `GET /api/poch/rollout/status`
- `POST /api/poch/rollout/stage`
- `POST /api/poch/rollout/rollback`

## Manual Control Commands
Use a configured `POCH_ADMIN_SECRET`.

```bash
curl -sS "$API_BASE/api/poch/rollout/status"
```

```bash
curl -sS -X POST "$API_BASE/api/poch/rollout/stage" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $POCH_ADMIN_SECRET" \
  -d '{"stage":"soft","reason":"scheduled stage promotion"}'
```

```bash
curl -sS -X POST "$API_BASE/api/poch/rollout/rollback" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $POCH_ADMIN_SECRET" \
  -d '{"reason":"manual safety rollback","trigger":"manual"}'
```

## Release-Readiness Gate Checklist (March 1-2)
1. Noir gate:
   - `nargo check` for all `noir/circuits/*`
   - `nargo test` for `noir/circuits/poch-uniqueness`
2. EVM gate:
   - `forge test -vvv --match-path test/PoCHValidationBridge.t.sol`
3. API gate:
   - `pnpm --filter kamiyo-companion test -- src/__tests__/poch-routes.test.ts`
   - `pnpm --filter kamiyo-companion build`
4. SDK/paranet gate:
   - `pnpm --filter @kamiyo/sdk build`
   - `pnpm --filter @kamiyo/agent-paranet test`

No merge to `main` without all four domains passing.

## Operational Drills (must pass before March 3)
1. Stage override auth:
   - Unauthorized request returns `401`.
   - Authorized request returns `200`.
2. Manual rollback:
   - Roll back from `gate_high_impact` to `soft`.
   - Roll back from `soft` to `observe`.
3. Synthetic dispute backlog:
   - Trigger backlog condition and confirm rollback in one evaluator cycle (`<= 5m`).

## Review Cadence
- Review rollout status at `00:00 UTC` and `12:00 UTC` every day.
- Record one decision at each review: `hold`, `promote`, or `rollback`.
- Keep an operations log entry with:
  - timestamp
  - stage/effective mode
  - gate metrics
  - decision and reason
  - operator name

## On-Call Ownership
- Primary: PoCH API owner (Companion/API).
- Secondary: Trust-layer/verification owner.
- Escalation: protocol lead.

Required page conditions:
- Rollback trigger activated.
- Evaluator heartbeat stale for >10 minutes (no fresh snapshot).
- Blocking disputes exceed threshold.

## Stabilization Exit Criteria (March 21)
- No unresolved blocking dispute older than 24h.
- No rollback trigger sustained during the previous 72h.
- `gate_high_impact` stable for all three scoped actions.
- Decision recorded on whether to expand gating surface after March 21.
