# Development Guide

## Workspace Commands

### Build

```bash
anchor build
pnpm run build:sdk
cargo build --workspace
```

### Test

```bash
anchor test
pnpm run test:sdk
cargo test --workspace
```

### Lint and Format

```bash
pnpm run lint:check
pnpm run format:check
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

## Formal Verification

```bash
cargo kani -p kani-solana
cargo kani -p kamiyo-trust-layer
```

See `KANI.md` for extended modes and CI parity commands.

## Service Reliability Validation

For trust-layer service reliability and dead-letter paths:

```bash
./services/trust-layer-service/e2e/run-fault-injection.sh
```

## Pull Request Discipline

- Keep PR scope narrow.
- Include executable validation commands in PR description.
- Avoid cross-cutting refactors in feature PRs.
