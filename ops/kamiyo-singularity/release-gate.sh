#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[1/5] verify constant alignment"
node "$ROOT_DIR/ops/kamiyo-singularity/verify-constant-alignment.mjs"

echo "[2/5] cargo test: kamiyo-singularity-market"
(
  cd "$ROOT_DIR"
  cargo test -p kamiyo-singularity-market --lib
)

echo "[3/5] cargo test: kamiyo-singularity-orderbook"
(
  cd "$ROOT_DIR"
  cargo test -p kamiyo-singularity-orderbook --lib
)

echo "[4/5] cargo test: settlement-focused"
(
  cd "$ROOT_DIR"
  cargo test -p kamiyo-singularity-orderbook settle_trade --lib
)

echo "[5/5] pnpm build: @kamiyo/singularity-web"
pnpm --dir "$ROOT_DIR/apps/kamiyo-singularity" build

echo "release gate passed"
