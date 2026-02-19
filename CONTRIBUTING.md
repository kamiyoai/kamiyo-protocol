# Contributing to KAMIYO Protocol

This guide defines contribution standards for code quality and release safety.

## Before You Start

### Required Tooling

- Node.js 20+
- pnpm 9+
- Rust stable + Cargo
- Solana CLI 2.x
- Anchor CLI 0.31.x

### Initial Setup

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
pnpm install
```

## Development Workflow

1. Create a branch from `main`.
2. Keep your change focused and scoped.
3. Add tests for behavior changes.
4. Run local checks before opening a PR.
5. Open a PR with a clear description and validation notes.

## Branch and Commit Standards

### Branch Naming

Use one of:

- `feat/<short-description>`
- `fix/<short-description>`
- `refactor/<short-description>`
- `docs/<short-description>`
- `chore/<short-description>`

### Commit Messages

- Use imperative mood.
- Keep subject lines concise.
- Split unrelated work into separate commits.

Examples:

- `fix trust outbox retry backoff`
- `add replay mismatch integration test`
- `docs clarify local build prerequisites`

## Local Validation

Run the relevant subset for your change. At minimum:

```bash
pnpm run lint:check
pnpm run format:check
anchor build
anchor test
cargo test -p kamiyo-trust-layer
cargo test -p trust-layer-service
```

If you touch formal verification logic:

```bash
cargo kani -p kani-solana
cargo kani -p kamiyo-trust-layer
```

If you touch trust-layer-service reliability paths:

```bash
./services/trust-layer-service/e2e/run-fault-injection.sh
```

## Pull Request Requirements

A PR should include:

- Problem statement and rationale
- Summary of behavior changes
- Test plan and exact commands executed
- Migration notes for breaking changes
- Docs updates when behavior or interfaces changed

PRs without sufficient test evidence or rollout context can be sent back for revision.

## Code Quality Expectations

- Follow existing patterns and naming conventions.
- Prefer simple, explicit logic over abstractions that hide behavior.
- Keep changes minimal and cohesive.
- Do not include generated artifacts unless required.
- Do not include unrelated formatting-only edits.

## Security Reporting

Do not open public issues for vulnerabilities. Follow `SECURITY.md`.

## License

By contributing, you agree that your contributions are licensed under `LICENSE` (MIT).
