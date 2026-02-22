# Troubleshooting

## `No active KAMIYO agent identity found`

Cause:

- Wallet has not created an on-chain agent account.
- Agent exists but is not active.

Fix:

1. Derive and fetch the agent PDA with `KamiyoClient.getAgentPDA` and `getAgent`.
2. Create identity with `createAgent` if missing.
3. Do not call `FundryManager` or `ElfaManager` flows until identity is active.

## Escrow exists but release/dispute fails

Cause:

- Caller does not match expected escrow actor.
- Escrow is in terminal status or expired.

Fix:

1. Fetch escrow via `getAgreement` or `check_escrow_status`.
2. Validate status before calling release/dispute primitives.
3. Rebuild transaction with correct signer and provider account.

## Commit/reveal voting rejected

Cause:

- Oracle attempted commit/reveal in wrong phase.
- Commitment hash does not match revealed payload.

Fix:

1. Gate commits with `isInCommitPhase`.
2. Gate reveals with `isInRevealPhase`.
3. Recompute commitment using canonical `computeCommitmentHash` inputs.
4. Verify existing commitment/submission with helper methods before retrying.

## Proof verification fails for privacy/shield

Cause:

- Missing or mismatched proving artifacts.
- Structural fallback proof used where cryptographic proof is required.

Fix:

1. Verify artifacts exist for `@kamiyo/solana-privacy` proof generation.
2. If `requireCrypto` is true, reject structural-only proof paths.
3. Confirm threshold/commitment public inputs exactly match generated proof.

## Frequent RPC failures or timeouts

Cause:

- Single endpoint dependency.
- Endpoint health degradation.

Fix:

1. Use `RpcPool.fromEnv(...).init()` with multiple endpoints.
2. Execute critical calls through `RpcPool.execute`.
3. Apply `CircuitBreaker` around flaky remote dependencies.

## Partial success in trusted launch flow

Cause:

- External launch succeeded but launch record write failed.

Fix:

1. Treat launch and record creation as separate recovery steps.
2. Persist `fundryCoinId`, mint, and transaction signatures.
3. Retry on-chain record creation with `createTrustedLaunch` inputs after root cause is resolved.

## `cargo kani` fails with missing toolchain/setup

Cause:

- Kani verifier is not installed.
- One-time setup was not run.

Fix:

1. Install Kani: `cargo install --locked kani-verifier`.
2. Run setup once: `cargo kani setup`.
3. Re-run the targeted Kani command from `docs/kani-playbook.md`.

## Kani passes locally but audit fails

Cause:

- Logs contain verification failures in a package-specific run.
- Full profile expects `kani::cover!` checks but they were not satisfied.

Fix:

1. Run with CI-style output: `KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh`.
2. Run audit: `./scripts/kani-audit.sh kani-results/kani.log`.
3. For full profile, enforce covers explicitly:
   `KANI_EXPECT_COVERS=1 ./scripts/kani-audit.sh kani-results/kani.log`.
4. Inspect per-package logs in `kani-results/kani-<pkg>.log`.

## Agent or AccountInfo proofs are missing

Cause:

- Feature-gated proof suites are disabled.

Fix:

1. Run agent proofs:
   `KANI_AGENT=1 ./scripts/kani.sh kani-solana`.
2. Run account-info proofs:
   `KANI_ACCOUNT_INFO=1 ./scripts/kani.sh kani-solana`.
3. Run both when touching both surfaces:
   `KANI_AGENT=1 KANI_ACCOUNT_INFO=1 ./scripts/kani.sh kani-solana`.
