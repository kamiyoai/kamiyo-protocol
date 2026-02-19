#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$SERVICE_DIR/../../output/kamiyo-operator"

mkdir -p "$LOG_DIR"

cd "$SERVICE_DIR"
KAMIYO_DB_PATH=../../output/kamiyo-operator/state.db pnpm run check:alerts >> "$LOG_DIR/alerts.log" 2>&1
