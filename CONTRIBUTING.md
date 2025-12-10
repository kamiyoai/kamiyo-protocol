# Contributing to Mitama

## Development Setup

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Solana CLI 1.18+
- Anchor CLI 0.31+

### Local Development

```bash
# Clone the repository
git clone https://github.com/kamiyo-ai/mitama.git
cd mitama

# Install dependencies
npm install

# Build Solana program
anchor build

# Run tests
anchor test
```

### Package Development

```bash
# Build all packages
npm run build --workspaces

# Build specific package
cd packages/mitama-sdk && npm run build
```

## Code Standards

### Rust (Solana Program)

- Follow Rust idioms and clippy recommendations
- Use `cargo fmt` before committing
- Document public functions with `///` comments
- Handle all errors explicitly, no `.unwrap()` in production code

### TypeScript (SDK/Packages)

- Use TypeScript strict mode
- Export types explicitly
- Document public APIs with JSDoc
- Prefer `async/await` over raw promises

### Commit Messages

- Use imperative mood: "Add feature" not "Added feature"
- First line: 50 chars max, capitalized, no period
- Body: Wrap at 72 chars, explain what and why

```
Add multi-oracle consensus validation

Implement weighted voting system for dispute resolution
with configurable deviation thresholds.
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Write tests for new functionality
4. Ensure all tests pass: `anchor test`
5. Update documentation if needed
6. Submit PR with clear description

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log or debug statements
- [ ] TypeScript compiles without errors
- [ ] Solana program builds without warnings

## Testing

### Solana Program Tests

```bash
# Run all tests on localnet
anchor test

# Run specific test
anchor test -- --grep "agent identity"
```

### TypeScript Package Tests

```bash
# Run SDK tests
cd packages/mitama-sdk && npm test

# Run middleware tests
cd packages/mitama-middleware && npm test
```

## Security

Report security vulnerabilities privately to security@kamiyo.ai. Do not open public issues for security concerns.

See [SECURITY.md](SECURITY.md) for details.

## License

By contributing, you agree that your contributions will be licensed under the BUSL-1.1 license.
