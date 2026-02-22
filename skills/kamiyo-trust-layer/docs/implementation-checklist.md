# Implementation Checklist

Use this checklist when implementing or reviewing trust-layer code.

## 1. Primitive selection

- Confirm required primitive domains from `resources/primitives-map.md`.
- Confirm each user requirement is mapped to at least one explicit primitive.
- Reject implementations that only use generic RPC calls when typed primitives exist.

## 2. Account and PDA safety

- Use canonical PDA derivation helpers instead of hand-built seeds.
- Validate actor ownership and signer assumptions before submitting transactions.
- Validate account state before transitions (active, disputed, commit, reveal, finalized).

## 3. Escrow and dispute correctness

- Ensure escrow create/release/dispute paths are all reachable and tested.
- Ensure dispute flows enforce phase windows (commit/reveal/finalization).
- Ensure quality score bounds and refund math are validated.
- Ensure idempotent handling for repeated worker/oracle attempts.

## 4. Reputation, privacy, and credential gating

- Use reputation primitives for policy checks before value transfer.
- Use ZK proof primitives where thresholds must be proven without data leakage.
- Use shield credential verification when trust attestations gate actions.
- Fail closed if proof validation is unavailable in required-crypto mode.

## 5. Reliability requirements

- Use `RpcPool` for multi-endpoint failover in production paths.
- Wrap high-risk remote dependencies with `CircuitBreaker`.
- Emit monitor events or structured logs for long-running dispute workers.

## 6. Testing requirements

- Cover happy path and failure path for each transaction primitive used.
- Cover timeout and phase-transition boundaries for dispute flows.
- Cover malformed proof and stale proof handling for privacy/shield paths.
- Cover retry/failover behavior when external dependencies fail.

## 7. Kani verification requirements

- Resolve required profiles first:
  - `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh`
  - or apply `docs/kani-required-matrix.md` manually
- Run Kani with profile matching the changed trust surface:
  - default: `./scripts/kani.sh`
  - full proofs: `KANI_FULL=1 ./scripts/kani.sh`
  - agent invariants: `KANI_AGENT=1 ./scripts/kani.sh kani-solana`
  - account info invariants: `KANI_ACCOUNT_INFO=1 ./scripts/kani.sh kani-solana`
- For CI parity, run:
  - `KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh`
  - `./scripts/kani-audit.sh kani-results/kani.log`
- For full profile, enforce cover checks:
  - `KANI_EXPECT_COVERS=1 ./scripts/kani-audit.sh kani-results/kani.log`
- Treat any verification failure as a release blocker for trust-layer changes.

## 8. Delivery requirements

- Return concrete transaction signatures, PDAs, and status summaries.
- Preserve deterministic behavior where replayability matters.
- Include clear rollback or manual-recovery notes for partially successful flows.
