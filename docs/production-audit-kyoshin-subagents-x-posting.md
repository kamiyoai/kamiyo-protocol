# Production Audit: kyoshin-subagents-x-posting

## Executive Summary
Core runtime paths for Kyoshin, swarm/sub-agent execution, and X posting are now materially safer than baseline, but they were not production-grade before this pass. The biggest risks were command execution exposure in tool health checks, overly-permissive file feed handling, and weak durability semantics in operator-log autopost state. Those were fixed. Remaining gaps are mostly test depth for OpenClaw Python/Shell artifacts and multi-host coordination assumptions.

## Critical Issues (P0 - Block Release)
- [x] `ops/openclaw/kyoshin-tool-health.py` executed registry commands via `shell=True` | Impact: command injection path from mutable runtime config | Fix: switched to `shlex.split` + direct `subprocess.run([...], shell=False)` with executable resolution.
- [x] `ops/openclaw/kyoshin-sync-feed-config.py` + `ops/openclaw/kyoshin-marketplace-intake.py` accepted arbitrary `file://` URLs | Impact: local file exfiltration/read of unintended files | Fix: constrain `file://` to runtime subtree by default; require explicit `KYO_ALLOW_FILE_FEEDS_ANYWHERE=true` override.

## High Priority (P1 - Fix Before Launch)
- [x] `services/api/src/operator-logbook.ts` used mixed ms/sec query fallback with broad `OR` pattern | Impact: inaccurate 24h metrics when timestamp units drift | Fix: unit-aware threshold resolver using table max timestamp; single-threshold queries.
- [x] `services/api/src/operator-logbook.ts` queued post + serial state update outside transaction | Impact: possible duplicate serial/post under concurrent workers | Fix: wrapped due-check/insert/state-advance in SQLite transaction.
- [x] `services/api/src/operator-logbook.ts` allowed serial rewind via force env | Impact: duplicate header serials and timeline confusion | Fix: reject rewind requests (`requested < current`) with warning.
- [x] `ops/openclaw/kyoshin-learnings.py` dedupe signature included cycle number | Impact: repeated failures flooded learnings file every cycle | Fix: dedupe signature now based on failure class (`status + normalized error`) only.

## Medium Priority (P2 - Fix Soon After Launch)
- [ ] OpenClaw runtime scripts (`ops/openclaw/*.py`, `ops/openclaw/*.sh`) still rely on smoke tests only | Impact: regression risk in control-loop behavior | Fix: add deterministic unit tests for parsing/scoring/guards and loop integration contract tests.
- [ ] X posting flows span multiple services (`services/api`, `services/kyoshin`) with independent schedules | Impact: policy drift risk between operators | Fix: add shared posting policy module + single source for cadence/guardrails.

## Low Priority (P3 - Technical Debt)
- [ ] Add static typing/contract validation for generated JSON artifacts under `~/.openclaw/workspace/runtime/*` | Impact: malformed artifact handling is permissive | Fix: add schema validation before consumption.
- [ ] Add integration test that simulates dual process startup for operator-log scheduler | Impact: future refactors could reintroduce duplicate generation behavior | Fix: multi-process DB lock/transaction test.

## Security Assessment
- Removed shell execution from tool-health command checks.
- Constrained file feed surface to runtime scope by default.
- Maintained secure file permissions (`0600` files, `0700` dirs) across OpenClaw runtime artifacts.
- Remaining risk: runtime trust boundary still assumes `openclaw` account compromise is out-of-scope.

## Performance Assessment
- No major hotspots introduced.
- Operator-log scheduling and snapshot queries remain lightweight.
- Transaction-wrapped queue+state write adds minimal overhead and improves correctness.

## Observability Assessment
- Autonomy tick log now includes learning object (`learning`) in emitted event payload.
- Learnings state persisted to `runtime/state/learnings-state.json` for deterministic dedupe.
- Remaining gap: no SLO alerting on learnings append failure rate.

## Recommended Architecture Changes
- Unify X posting policy/cadence into shared library consumed by both `services/api` and `services/kyoshin`.
- Introduce schema contracts (zod/jsonschema) for all OpenClaw runtime JSON artifacts.
- Add explicit lock/leader election if more than one worker process is expected for Kyoshin posting.

## Test Coverage Gaps
- No direct unit tests for:
  - `ops/openclaw/kyoshin-tool-health.py` command parser behavior.
  - `ops/openclaw/kyoshin-sync-feed-config.py` file URL restriction logic.
  - `ops/openclaw/kyoshin-marketplace-intake.py` file URL guard + response limits.
  - `services/api/src/operator-logbook.ts` transactional due-queue semantics.

## Action Plan
1. [x] Harden command execution and feed URL handling.
2. [x] Harden operator-log scheduling correctness and transactionality.
3. [x] Harden learnings flywheel dedupe behavior.
4. [x] Run build/test/smoke verification across target surfaces.
5. [ ] Add unit/integration tests for OpenClaw runtime scripts and operator-log scheduler.

## Verification
- `pnpm --filter kamiyo-companion run build` passed.
- `pnpm --filter @kamiyo/kyoshin run build` and `pnpm --filter @kamiyo/kyoshin run test` passed.
- `pnpm --filter @kamiyo/kamiyo-operator run build` and `pnpm --filter @kamiyo/kamiyo-operator run test` passed.
- `pnpm run operator-log:validate` passed.
- `python3 -m py_compile` passed for updated OpenClaw scripts.
- Shell syntax checks (`bash -n`) passed for updated loop/install scripts.
