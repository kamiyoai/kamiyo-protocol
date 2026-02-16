# Contributing to KAMIYO

Thanks for your interest in contributing. This document covers the process for contributing to the protocol.

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm 9+
- Rust + Cargo (for Solana programs)
- Solana CLI 2.x
- Anchor CLI 0.31.x
- Foundry (for EVM contracts)

### Setup

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
pnpm install
```

### Build

```bash
# Solana programs
anchor build

# TypeScript packages
pnpm run build:sdk

# EVM contracts
cd contracts/zk-reputation && forge build
```

### Test

```bash
# Solana programs
anchor test

# TypeScript SDK
pnpm run test:sdk

# EVM contracts
cd contracts/zk-reputation && forge test
```

## Development Workflow

1. Fork the repository
2. Create a branch from `main`
3. Make your changes
4. Run tests and linting
5. Submit a pull request

### Branch Naming

Use descriptive branch names:

- `feat/agent-staking` — new features
- `fix/escrow-timeout` — bug fixes
- `docs/sdk-examples` — documentation
- `refactor/oracle-consensus` — refactoring

### Commit Messages

- Use imperative mood: "Add feature" not "Added feature"
- Be concise but descriptive
- Reference issues when applicable: "Fix escrow timeout (#123)"

### Pull Requests

- Fill out the PR template
- Include a description of what changed and why
- Add tests for new functionality
- Ensure CI passes before requesting review

## Project Structure

| Directory | Description |
|-----------|-------------|
| `programs/` | Solana programs (Anchor) |
| `packages/` | TypeScript SDK and integrations |
| `services/` | Backend services (API, oracle, bots) |
| `apps/` | Client applications |
| `contracts/` | EVM contracts (Foundry) |
| `circuits/` | Circom circuits |
| `noir/` | Noir circuits |
| `crates/` | Rust crates |

## Code Standards

- TypeScript: strict mode, no `any` types
- Rust: `cargo clippy` clean
- Solidity: follow OpenZeppelin patterns
- Tests required for new features and bug fixes

## Security

If you discover a security vulnerability, do **not** open a public issue. See [SECURITY.md](SECURITY.md) for reporting instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
