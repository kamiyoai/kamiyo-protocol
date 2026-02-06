#!/bin/bash
set -e

corepack enable
corepack prepare pnpm@10 --activate

pnpm install

pnpm --filter @kamiyo/sdk build
pnpm --filter @kamiyo/x402-client build
pnpm --filter @kamiyo/dkg-quality-oracle build
pnpm --filter @kamiyo/hive build
pnpm --filter @kamiyo/paykit build
pnpm --filter @kamiyo/moltbook-agent build
