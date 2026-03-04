#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_SCRIPT="$SCRIPT_DIR/bridges/kyoshin-earnings-sweep-bridge.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo '{"ok":false,"error":{"code":"missing_node_runtime","message":"node runtime is required"}}' >&2
  exit 1
fi

if [ ! -x "$BRIDGE_SCRIPT" ]; then
  echo '{"ok":false,"error":{"code":"missing_earnings_sweep_bridge","message":"bridge worker not found or not executable"}}' >&2
  exit 1
fi

exec node "$BRIDGE_SCRIPT"
