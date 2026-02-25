# Security Dependency Triage

**Date:** 2026-02-25  
**Scope:** Production dependency posture for monorepo packages and services

## Current Snapshot

### JavaScript/TypeScript (`pnpm audit --prod --json`)

- Critical: `0`
- High: `30`
- Moderate: `28`
- Low: `9`

High-severity findings affecting runtime package/service scope are concentrated in:

- `packages__kamiyo-agent-paranet` (legacy `dkg.js` chain: `axios`, `qs`, `ws`, `tar`)
- `packages__kamiyo-swarm-agents` and `services__keiro-api` (`hono`)
- `packages__kamiyo-agents` (`@modelcontextprotocol/sdk`)

### Rust (`cargo audit --json`)

- Vulnerabilities: `2`
  - `RUSTSEC-2024-0344`
  - `RUSTSEC-2022-0093`
- Informational:
  - Unmaintained crates: `5`
  - Unsound warnings: `1`

These Rust vulnerabilities are inherited through current Solana ecosystem transitive dependencies.

## Policy Executed

The repository now has an explicit policy file and executable gate:

- Policy config: `config/security-audit-policy.json`
- Gate command: `pnpm run audit:policy`
- Gate script: `scripts/check-security-policy.mjs`

Policy behavior:

1. Evaluates JS advisories in `packages__*` and `services__*` scopes.
2. Fails on any critical advisory in those scopes.
3. Fails on high advisories unless allowlisted with:
   - advisory ID
   - scoped workspace
   - explicit expiry date
   - documented reason
4. Fails on Rust vulnerabilities unless explicitly allowlisted with expiry.

## CI Integration

`CI` workflow now executes the policy gate in the Solana job:

- Step: `Security Audit Policy`
- Command: `pnpm run audit:policy`

This replaces unbounded ignore flags with time-bounded, auditable policy exceptions.

## Active Remediation Backlog

### P1 (before open-source readiness claim)

1. Remove/replace `dkg.js` transitive dependency chain from `@kamiyo/agent-paranet`.
2. Upgrade `hono` consumers (`@kamiyo/swarm-agents`, `@kamiyo/keiro-api`) to non-vulnerable versions.
3. Upgrade `@modelcontextprotocol/sdk` in `@kamiyo/agents` to patched version with compatibility test coverage.

### P2 (shortly after P1)

1. Reduce advisory volume in `apps__*` and `examples__*` workspaces to keep contributor local environments safe.
2. Replace or isolate unmaintained Rust crates where feasible as Solana transitive graph evolves.

## Enforcement Rules

- Allowlist entries must include expiry and reason.
- Expired allowlist entries fail CI.
- New high/critical advisories in package/service scope fail CI until triaged.
