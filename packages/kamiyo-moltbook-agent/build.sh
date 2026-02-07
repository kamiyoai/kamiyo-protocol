#!/bin/bash
set -e

echo "=== Enabling corepack ==="
corepack enable
corepack prepare pnpm@10 --activate
echo "=== pnpm version: $(pnpm --version) ==="

echo "=== Installing dependencies ==="
pnpm install --ignore-scripts

echo "=== Rebuilding native modules ==="
pnpm rebuild better-sqlite3

echo "=== Building @kamiyo/meishi ==="
pnpm --filter @kamiyo/meishi build

echo "=== Building @kamiyo/sdk ==="
pnpm --filter @kamiyo/sdk build

echo "=== Building @kamiyo/x402-client ==="
pnpm --filter @kamiyo/x402-client build

echo "=== Building @kamiyo/dkg-quality-oracle ==="
pnpm --filter @kamiyo/dkg-quality-oracle build

echo "=== Building @kamiyo/hive ==="
pnpm --filter @kamiyo/hive build

echo "=== Building @kamiyo/paykit ==="
pnpm --filter @kamiyo/paykit build

echo "=== Building @kamiyo/moltbook-agent ==="
pnpm --filter @kamiyo/moltbook-agent build

echo "=== Build complete ==="
