#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if [ -n "${KAMIYO_NODE_BIN:-}" ] && [ -x "${KAMIYO_NODE_BIN}" ]; then
  NODE_BIN="${KAMIYO_NODE_BIN}"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x /opt/homebrew/bin/node ]; then
  NODE_BIN="/opt/homebrew/bin/node"
elif [ -x /usr/local/bin/node ]; then
  NODE_BIN="/usr/local/bin/node"
else
  NVM_NODE_BIN="$(ls -1d "$HOME/.nvm/versions/node"/v20.*/bin/node 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -n "$NVM_NODE_BIN" ] && [ -x "$NVM_NODE_BIN" ]; then
    NODE_BIN="$NVM_NODE_BIN"
  else
    echo "node not found for kamiyo-operator" >&2
    exit 127
  fi
fi

if [ ! -f "$SERVICE_DIR/dist/index.js" ]; then
  echo "dist/index.js missing; run: pnpm --filter @kamiyo/kamiyo-operator run build" >&2
  exit 1
fi

cd "$SERVICE_DIR"
if [ -n "${KAMIYO_ENV_OVERLAY:-}" ]; then
  OVERLAY_PATH="$KAMIYO_ENV_OVERLAY"
  if [ "${OVERLAY_PATH#/}" = "$OVERLAY_PATH" ]; then
    OVERLAY_PATH="$SERVICE_DIR/$OVERLAY_PATH"
  fi
  if [ ! -f "$OVERLAY_PATH" ]; then
    echo "overlay env file missing: $OVERLAY_PATH" >&2
    exit 1
  fi
  set -a
  source "$OVERLAY_PATH"
  set +a
fi

exec "$NODE_BIN" dist/index.js
