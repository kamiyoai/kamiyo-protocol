# KAMIYO Protocol — Development Commands
# Run `just` to see all available recipes

default:
  @just --list --unsorted

# ── Build ────────────────────────────────────────────────────────────

# Build core (default Kizuna path)
build:
  pnpm run build:core

# Build modules tier
build-modules:
  pnpm run build:modules

# Build legacy tier
build-legacy:
  pnpm run build:legacy

# Build everything (core + modules + legacy + programs)
build-all:
  pnpm run build:all

# Build Solana programs via Anchor
build-program:
  anchor build

# Build SDK packages
build-sdk:
  pnpm run build:sdk

# ── Test ─────────────────────────────────────────────────────────────

# Test core (default)
test:
  pnpm run test:core

# Test modules tier
test-modules:
  pnpm run test:modules

# Test everything
test-all:
  pnpm run test:all

# Test on-chain programs
test-onchain:
  anchor test

# Test SDK only
test-sdk:
  pnpm run test:sdk

# ── Lint & Format ────────────────────────────────────────────────────

# Lint core (fix mode)
lint:
  pnpm run lint:core

# Lint check (no fix)
lint-check:
  pnpm run lint:check:core

# Format TypeScript
format:
  pnpm run format

# Check formatting
format-check:
  pnpm run format:check

# Lint + format Rust
lint-rust:
  pnpm run lint:rust

# Format Rust
format-rust:
  cargo fmt --all

# ── Verify ───────────────────────────────────────────────────────────

# Run all checks (lint + format + rust)
verify:
  pnpm run lint:check:core
  pnpm run format:check
  cargo fmt --all -- --check

# Security audit (JS + Rust)
audit:
  pnpm run audit:policy

# Enterprise readiness check (CI mode)
preflight:
  pnpm run preflight:enterprise

# Route ownership validation
check-routes:
  pnpm run smoke:companion:route-ownership

# Doc command drift detection
check-docs:
  pnpm run check:docs

# Service onboarding readiness
check-onboarding:
  pnpm run check:onboarding

# ── Services ─────────────────────────────────────────────────────────

# Start companion API (Kizuna-first mode)
dev-api:
  pnpm --filter kamiyo-companion run dev

# Start companion API (full runtime)
dev-api-full:
  pnpm --filter kamiyo-companion run dev:full

# Build facilitator
build-facilitator:
  pnpm --filter @kamiyo/x402-facilitator run build

# Build wallet control plane
build-wcp:
  pnpm --filter @kamiyo/wallet-control-plane run build

# Build kamiyo-agent runtime
build-kamiyo-agent:
  pnpm run build:kamiyo-agent

# ── Render Safety ────────────────────────────────────────────────────

# Check Render status before any deploy action
render-guard:
  renderctl status
  renderctl bind nvrevr
  renderctl guard

# ── Utilities ────────────────────────────────────────────────────────

# Install all dependencies
install:
  pnpm install

# Clean build artifacts
clean:
  pnpm run clean

# Show trust layer status
trustlayer:
  pnpm run show:trustlayer
