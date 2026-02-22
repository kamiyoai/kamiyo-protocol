# Kani verification example

Use this runbook to attach formal verification to trust-layer changes.

## Automatic profile resolution

```bash
skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh
```

Execute required commands automatically:

```bash
skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --run --ci
```

## Example: trust policy and dispute math change

1. Run targeted proofs first:

```bash
./scripts/kani.sh kamiyo-trust-layer
./scripts/kani.sh kamiyo
```

2. Run full proofs for deeper path/cover checks:

```bash
KANI_FULL=1 ./scripts/kani.sh kamiyo-trust-layer kamiyo
```

3. Run CI-style pass and audit:

```bash
KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh kamiyo-trust-layer kamiyo
./scripts/kani-audit.sh kani-results/kani.log
```

## Example: agent CPI/PDA safety change

```bash
KANI_AGENT=1 ./scripts/kani.sh kani-solana
KANI_OUT_DIR=kani-results KANI_AGENT=1 ./scripts/kani-ci.sh kani-solana
./scripts/kani-audit.sh kani-results/kani.log
```

## Example: `AccountInfo` timelock/authorization change

```bash
KANI_ACCOUNT_INFO=1 ./scripts/kani.sh kani-solana
KANI_OUT_DIR=kani-results KANI_ACCOUNT_INFO=1 ./scripts/kani-ci.sh kani-solana
./scripts/kani-audit.sh kani-results/kani.log
```

## Reporting expectations

For each change, record:

- exact commands run
- package targets
- feature flags (`KANI_FULL`, `KANI_AGENT`, `KANI_ACCOUNT_INFO`)
- audit result
- unresolved gaps (if any)
