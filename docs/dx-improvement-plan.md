# DX & Tooling Improvement Plan

> Generated 2026-03-31 — Based on Claude Code best practices audit

## Status Tracker

| # | Improvement | Priority | Effort | Status |
|---|-----------|----------|--------|--------|
| 1 | Add project `CLAUDE.md` | P0 | 30 min | ✅ DONE |
| 2 | Add `.claude/settings.json` permission rules | P0 | 10 min | ✅ DONE |
| 3 | Husky + lint-staged pre-commit hooks | P1 | 20 min | ✅ DONE |
| 4 | `.editorconfig` | P1 | 5 min | ✅ DONE |
| 5 | `.env.example` templates per service | P1 | 30 min | ✅ DONE |
| 6 | Claude Code hooks (identity firewall) | P2 | 15 min | ✅ DONE |
| 7 | Document test strategy in CLAUDE.md | P2 | 20 min | ✅ DONE (included in CLAUDE.md) |
| 8 | `justfile` for dev commands | P2 | 15 min | ✅ DONE |
| 9 | MCP server config (`.mcp.json`) | P3 | 10 min | ✅ DONE |
| 10 | Dockerize remaining services | P3 | 1-2 hrs | ⬜ TODO (deferred) |

---

## 1. Project `CLAUDE.md`

**Why:** Injected into every Claude Code system prompt. Gives instant project context without exploration overhead.

**Contents:**
- Workspace tier structure (Core / Module / Legacy)
- Build, test, lint, format commands
- Rust/Anchor/Solana version requirements
- Architecture summary (Kizuna-first, workspace grouping)
- Key file locations
- Coding standards
- Identity firewall rules
- Testing conventions per layer

---

## 2. `.claude/settings.json`

**Why:** Pre-approve safe commands, deny dangerous ones. Removes friction.

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm run build:*)",
      "Bash(pnpm run test:*)",
      "Bash(pnpm run lint:*)",
      "Bash(pnpm run format:*)",
      "Bash(cargo build *)",
      "Bash(cargo test *)",
      "Bash(cargo clippy *)",
      "Bash(anchor build)",
      "Bash(anchor test)",
      "Bash(npx tsx *)"
    ],
    "deny": [
      "Bash(pnpm run deploy*)",
      "Bash(mainnet-*)",
      "Bash(git push --force*)"
    ]
  }
}
```

---

## 3. Husky + lint-staged

**Why:** No git hooks exist. Unformatted/unlinted code can reach main.

```bash
pnpm add -Dw husky lint-staged
npx husky init
```

`.husky/pre-commit`:
```bash
pnpm lint-staged
```

`package.json` addition:
```json
"lint-staged": {
  "packages/*/src/**/*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  "services/*/src/**/*.{ts,tsx}": ["prettier --write", "eslint --fix"]
}
```

---

## 4. `.editorconfig`

**Why:** Consistent formatting across all editors without needing Prettier extensions.

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.rs]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

---

## 5. `.env.example` per service

**Why:** Claude and new contributors can't know required env vars without reading source.

Services needing templates:
- `services/api/`
- `services/x402-facilitator/`
- `services/wallet-control-plane/`
- `services/kamiyo-agent/`
- `services/keiro-api/`
- `services/agent-factory/`

---

## 6. Claude Code hooks (identity firewall)

**Why:** Automatically run `check-security-policy.mjs` before git commits in Claude sessions.

Add to `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "tool": "Bash",
        "match": "git commit",
        "command": "node scripts/check-security-policy.mjs"
      }
    ]
  }
}
```

---

## 7. Test strategy documentation

**Why:** Mixed test runners (Mocha/Jest/Vitest) cause confusion.

Document in CLAUDE.md:
- On-chain programs → Mocha + Chai (via Anchor)
- Core packages → Jest
- Settlement/trading → Vitest
- Integration tests → Jest with PostgreSQL fixtures

---

## 8. `justfile`

**Why:** 50+ npm scripts are hard to discover. Just provides a clean index.

```just
default:
  @just --list

build:
  pnpm run build:core

test:
  pnpm run test:core

test-all:
  pnpm run test:all

verify:
  pnpm run lint:check:core && pnpm run format:check && pnpm run lint:rust:fmt

anchor-build:
  anchor build

anchor-test:
  anchor test --skip-local-validator
```

---

## 9. `.mcp.json`

**Why:** Project-level MCP servers for database access during debugging.

```json
{
  "mcpServers": {
    "postgres": {
      "command": "mcp-server-postgres",
      "args": ["postgresql://localhost:5432/kamiyo_dev"]
    }
  }
}
```

Already gitignored.

---

## 10. Dockerize remaining services

**Why:** Only x402-server has a Dockerfile. Production parity for other services.

Candidates:
- `services/api` (kamiyo-companion)
- `services/x402-facilitator`
- `services/wallet-control-plane`
