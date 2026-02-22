# Kani Playbook

Use this playbook to run trust-layer formal verification at the right depth.

## Prerequisites

1. Install Kani:
   `cargo install --locked kani-verifier`
2. Run one-time setup:
   `cargo kani setup`

## Profile resolver

Compute mandatory profiles from changed files:

```bash
skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh
```

Notes:

- The resolver can be executed from any directory inside the repo.
- With default `--head HEAD`, it includes local uncommitted file changes in rule resolution.

Compute and execute required commands:

```bash
skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --run
```

Compute, execute, and run CI-parity audit:

```bash
skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --run --ci
```

## Command profiles

### Baseline trust profile

Run this for normal trust-layer changes:

```bash
./scripts/kani.sh
```

### Full profile (`kani-full`)

Run this when changing core consensus/refund math or proof harnesses:

```bash
KANI_FULL=1 ./scripts/kani.sh
```

### Agent safety profile (`solana-agent`)

Run this when changing agent account, CPI, PDA, or replay logic:

```bash
KANI_AGENT=1 ./scripts/kani.sh kani-solana
```

### AccountInfo profile (`solana-account-info`)

Run this when changing timelock/authorization logic tied to `AccountInfo` behavior:

```bash
KANI_ACCOUNT_INFO=1 ./scripts/kani.sh kani-solana
```

### Combined profile

Run this for high-risk trust changes spanning multiple surfaces:

```bash
KANI_AGENT=1 KANI_FULL=1 KANI_ACCOUNT_INFO=1 ./scripts/kani.sh
```

## CI parity profile

Use this to reproduce CI-style artifacts and audits locally:

```bash
KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh
./scripts/kani-audit.sh kani-results/kani.log
```

When running full profile with cover expectations:

```bash
KANI_FULL=1 KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh
KANI_EXPECT_COVERS=1 ./scripts/kani-audit.sh kani-results/kani.log
```

## Change-impact matrix

- Changed trust policy model or sequence validation:
  - `./scripts/kani.sh kamiyo-trust-layer`
- Changed escrow/dispute math in Kamiyo program:
  - `./scripts/kani.sh kamiyo`
  - `KANI_FULL=1 ./scripts/kani.sh kamiyo`
- Changed hive economics:
  - `./scripts/kani.sh hive`
- Changed staking multipliers/reward math:
  - `./scripts/kani.sh kamiyo-staking`
- Changed shared risk/math generators:
  - `./scripts/kani.sh kani-solana`
  - `KANI_FULL=1 ./scripts/kani.sh kani-solana`
- Changed agent proof-related helpers:
  - `KANI_AGENT=1 ./scripts/kani.sh kani-solana`
- Changed `AccountInfo` generator helpers:
  - `KANI_ACCOUNT_INFO=1 ./scripts/kani.sh kani-solana`

## Pass criteria

1. No `VERIFICATION ... FAILED` markers.
2. At least one `VERIFICATION ... SUCCESSFUL` marker for each targeted package.
3. For full runs, all cover properties satisfied.
4. No skipped high-risk profile for changed trust domains.
