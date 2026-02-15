# Production Audit: Kani + Kiroku Proof Receipts

## Executive Summary
The Kani setup is generally sound (pinned toolchain, per-package logs, scheduled full run), but a few issues made the “proof audit” and published receipt less trustworthy than intended. The main gaps were: audit logic that could miss failures, receipt status derived from a naive grep, and missing CI enforcement that each crate actually ran proofs. These are now fixed in this branch.

## Critical Issues (P0 - Block Release)
- [x] **Kani audit could pass with failed proofs present** | Impact: “green” audit despite a failing harness if the log also contained successes | Fix: fail audit on any `VERIFICATION.*FAILED` marker and require at least one `VERIFICATION.*SUCCESSFUL`.
- [x] **Proof receipt status could be mislabeled as verified** | Impact: Kiroku receipt could say “verified” even when the CI audit failed (e.g., cover requirements) | Fix: compute receipt status from `scripts/kani-audit.sh` exit code (and infer cover expectations for full runs).
- [x] **Receipt publishing ignored HTTP status codes** | Impact: publishes could silently fail (401/500) and be hard to diagnose | Fix: capture `curl` HTTP status, fail on non-2xx with a truncated response snippet, add retries/timeouts.

## High Priority (P1 - Fix Before Launch)
- [x] **CI didn’t ensure each crate ran proofs** | Impact: a crate could regress to “no proofs” and CI would still pass due to aggregate logs | Fix: run `KANI_AUDIT_PER_PACKAGE=1` in CI to validate per-package logs.

## Medium Priority (P2 - Fix Soon After Launch)
- [ ] Add small fixture-based tests for `scripts/kani-audit.sh` and `scripts/kani-publish-kiroku-receipt.sh` (simple log snippets, expected exit codes/parsed covers).
- [ ] Consider recording per-package log hashes in `kani-results/kiroku-receipt.json` for stronger receipts when per-package audit is enabled.
- [ ] Add a “verify locally” one-liner in `KANI.md` (download artifact, compare sha256, re-run `scripts/kani-audit.sh`).

## Security Assessment
- Secrets are not printed to logs; the publish step only outputs the share URL and hashes.
- Receipt publishing now checks HTTP status and retries transient network failures.
- Remaining risk: allowlisting (writers) + token-gate controls live in the Kiroku server; CI receipts are only as strong as that server’s author allowlist and key hygiene.

## Performance Assessment
- The full proof set can be expensive; running it on a weekly schedule (with long timeout) is appropriate.
- Covers are treated as an audit gate only in the scheduled “full” workflow, keeping PR cadence reasonable.

## Observability Assessment
- CI artifacts include `summary.md` + logs. Kiroku receipts provide a shareable “proof receipt” with run/commit links and sha256 hashes.
- Remaining gap: there’s no structured “proof dashboard”; everything is still log/artifact driven.

## Test Coverage Gaps
- Script correctness is not unit-tested (log parsing, HTTP status behavior, cover aggregation).
- Proof harnesses cover targeted invariants, but do not model Solana runtime/account constraints (intentional scope).

## Action Plan
1. Keep PR workflow lightweight; keep full/covers gated in the scheduled workflow.
2. Add fixture tests for scripts (P2).
3. Optionally extend receipts with per-package hashes (P2).

