# Kani Required Matrix

Use this matrix to enforce mandatory Kani profiles based on changed files.

## Rule model

1. Determine changed files (`git diff --name-only <base>...<head>`).
2. Match paths against the highest-severity rule.
3. Run required profiles exactly as listed.
4. Record commands and results in `templates/kani-change-impact.md`.

Resolver behavior:

- `scripts/kani-required-profiles.sh` auto-detects repo root and can run from any working directory.
- When `--head HEAD` (default), it includes committed diff, staged changes, unstaged changes, and untracked files.

## Required profiles by change surface

| Changed surface | Required packages | Required flags | Required commands |
| --- | --- | --- | --- |
| `crates/kamiyo-trust-layer/**` | `kamiyo-trust-layer` | `KANI_FULL=1` | `KANI_FULL=1 ./scripts/kani.sh kamiyo-trust-layer` |
| `programs/kamiyo/**` | `kamiyo` | `KANI_FULL=1` | `KANI_FULL=1 ./scripts/kani.sh kamiyo` |
| `programs/hive/**` | `hive` | `KANI_FULL=1` | `KANI_FULL=1 ./scripts/kani.sh hive` |
| `programs/kamiyo-staking/**` | `kamiyo-staking` | `KANI_FULL=1` | `KANI_FULL=1 ./scripts/kani.sh kamiyo-staking` |
| `crates/kani-solana/src/agent/**` or `crates/kani-solana/tests/agent_verify.rs` | `kani-solana` | `KANI_AGENT=1 KANI_FULL=1` | `KANI_AGENT=1 KANI_FULL=1 ./scripts/kani.sh kani-solana` |
| `crates/kani-solana/src/account_info.rs` or `crates/kani-solana/tests/account_info_verify.rs` | `kani-solana` | `KANI_ACCOUNT_INFO=1 KANI_FULL=1` | `KANI_ACCOUNT_INFO=1 KANI_FULL=1 ./scripts/kani.sh kani-solana` |
| Other `crates/kani-solana/**` | `kani-solana` | `KANI_FULL=1` | `KANI_FULL=1 ./scripts/kani.sh kani-solana` |
| `packages/kamiyo-sdk/src/shield/**`, `packages/kamiyo-sdk/src/privacy/**`, `packages/kamiyo-solana-privacy/**` | `kani-solana kamiyo-trust-layer kamiyo` | `KANI_FULL=1 KANI_ACCOUNT_INFO=1` | `KANI_FULL=1 KANI_ACCOUNT_INFO=1 ./scripts/kani.sh kani-solana kamiyo-trust-layer kamiyo` |
| `packages/kamiyo-sdk/src/escrow-dispute.ts`, `packages/kamiyo-sdk/src/quality-oracle.ts`, `packages/kamiyo-actions/**`, `packages/kamiyo-solana-inference/**` | `kamiyo kamiyo-trust-layer kani-solana` | `KANI_FULL=1` | `KANI_FULL=1 ./scripts/kani.sh kamiyo kamiyo-trust-layer kani-solana` |
| `packages/kamiyo-sdk/src/staking.ts` or `packages/kamiyo-sdk/src/unified.ts` | `kamiyo-staking kani-solana` | `KANI_FULL=1` | `KANI_FULL=1 ./scripts/kani.sh kamiyo-staking kani-solana` |
| `scripts/kani*.sh` or `.github/workflows/kani*.yml` | all default packages | `KANI_FULL=1 KANI_AGENT=1 KANI_ACCOUNT_INFO=1` | `KANI_FULL=1 KANI_AGENT=1 KANI_ACCOUNT_INFO=1 ./scripts/kani.sh` |

## Mandatory CI-parity gate

After running targeted commands, always run:

```bash
KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh
./scripts/kani-audit.sh kani-results/kani.log
```

For any run that includes `KANI_FULL=1`, also run:

```bash
KANI_EXPECT_COVERS=1 ./scripts/kani-audit.sh kani-results/kani.log
```

## Automatic rule resolver

Use `scripts/kani-required-profiles.sh` to compute required profiles directly from git diff and optionally run them.
