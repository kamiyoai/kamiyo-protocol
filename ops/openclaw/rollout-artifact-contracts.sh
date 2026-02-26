#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/home/$OPENCLAW_USER}"
SYSTEMD_UNIT="${SYSTEMD_UNIT:-kyoshin-autonomy-loop.service}"
ENFORCE_REVENUE_GATES="${ENFORCE_REVENUE_GATES:-true}"
KYOSHIN_DB_PATH="${KYOSHIN_DB_PATH:-}"
SYSTEMCTL_REQUIRED="${SYSTEMCTL_REQUIRED:-false}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET_BIN_DIR="$OPENCLAW_HOME/bin"
ENV_FILE="$OPENCLAW_HOME/.openclaw/.env"
RUNTIME_STATE_DIR="$OPENCLAW_HOME/.openclaw/workspace/runtime/state"
RUNTIME_LOG_DIR="$OPENCLAW_HOME/.openclaw/workspace/runtime/logs"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

append_env_if_missing() {
  local key="$1"
  local value="$2"
  sudo -u "$OPENCLAW_USER" -H bash -lc "
    set -euo pipefail
    mkdir -p \"\$(dirname \"$ENV_FILE\")\"
    touch \"$ENV_FILE\"
    chmod 600 \"$ENV_FILE\"
    if ! grep -q \"^${key}=\" \"$ENV_FILE\"; then
      printf '%s=%s\n' \"$key\" \"$value\" >> \"$ENV_FILE\"
    fi
  "
}

run() {
  require_cmd sudo
  require_cmd install
  require_cmd jq

  echo "[1/6] installing updated loop + runtime scripts"
  sudo install -d -m 700 -o "$OPENCLAW_USER" -g "$OPENCLAW_USER" "$TARGET_BIN_DIR"
  local scripts=(
    "kyoshin-sync-feed-config.py"
    "kyoshin-marketplace-intake.py"
    "kyoshin-x402-feed.py"
    "kyoshin-dx-terminal-feed.py"
    "kyoshin-receipt-sync.py"
    "kyoshin-context-guard.py"
    "kyoshin-tool-health.py"
    "kyoshin-runtime-bridge.py"
    "kyoshin-swarm-governor.py"
    "kyoshin-swarm-planner.py"
    "kyoshin-mission-control.py"
    "kyoshin-artifact-contracts.py"
    "kyoshin-learnings.py"
    "kyoshin-autonomy-loop.sh"
  )
  local script
  for script in "${scripts[@]}"; do
    sudo install -m 700 -o "$OPENCLAW_USER" -g "$OPENCLAW_USER" \
      "$SCRIPT_DIR/$script" \
      "$TARGET_BIN_DIR/$script"
  done

  echo "[2/6] ensuring required runtime gate flags exist"
  append_env_if_missing "KYO_REQUIRE_RUNTIME_ARTIFACT_CONTRACTS" "true"
  append_env_if_missing "KYO_REQUIRE_KYOSHIN_RUNTIME" "true"
  append_env_if_missing "KYO_X402_GENERATED_FEED_ENABLED" "true"
  append_env_if_missing "KYO_DX_TERMINAL_ENABLED" "true"
  append_env_if_missing "KYO_DX_TERMINAL_GENERATED_FEED_ENABLED" "true"
  if [ -n "$KYOSHIN_DB_PATH" ]; then
    append_env_if_missing "KYO_KYOSHIN_DB_PATH" "$KYOSHIN_DB_PATH"
  fi
  if [[ "$ENFORCE_REVENUE_GATES" =~ ^(1|true|TRUE|True|yes|YES|on|ON)$ ]]; then
    append_env_if_missing "KYO_REQUIRE_X402_FEED" "true"
    append_env_if_missing "KYO_REQUIRE_RECEIPT_SYNC" "true"
    append_env_if_missing "KYO_REQUIRE_DX_TERMINAL_FEED" "false"
  else
    append_env_if_missing "KYO_REQUIRE_X402_FEED" "false"
    append_env_if_missing "KYO_REQUIRE_RECEIPT_SYNC" "false"
    append_env_if_missing "KYO_REQUIRE_DX_TERMINAL_FEED" "false"
  fi

  local has_systemctl=0
  if command -v systemctl >/dev/null 2>&1; then
    has_systemctl=1
  fi

  if [ "$has_systemctl" -eq 0 ] && [[ "$SYSTEMCTL_REQUIRED" =~ ^(1|true|TRUE|True|yes|YES|on|ON)$ ]]; then
    echo "systemctl is required but not available (set SYSTEMCTL_REQUIRED=false to allow manual fallback)" >&2
    exit 1
  fi

  echo "[3/6] running single control-loop tick"
  if [ "$has_systemctl" -eq 1 ]; then
    sudo systemctl start "$SYSTEMD_UNIT"
    sleep 2
  else
    echo "systemctl not found; running loop script directly"
    sudo -u "$OPENCLAW_USER" -H bash -lc "
      set -euo pipefail
      \"$TARGET_BIN_DIR/kyoshin-autonomy-loop.sh\"
    "
  fi

  echo "[4/6] runtime control status"
  if [ "$has_systemctl" -eq 1 ]; then
    sudo systemctl --no-pager --full status "$SYSTEMD_UNIT" || true
  else
    echo "systemctl unavailable; service status skipped"
  fi

  echo "[5/6] runtime verification snapshots"
  sudo -u "$OPENCLAW_USER" -H bash -lc "
    set -euo pipefail
    echo '--- x402-feed-state.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/x402-feed-state.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/x402-feed-state.json\"
    else
      echo 'missing x402-feed-state.json'
    fi

    echo
    echo '--- dx-terminal-feed-state.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/dx-terminal-feed-state.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/dx-terminal-feed-state.json\"
    else
      echo 'missing dx-terminal-feed-state.json'
    fi

    echo
    echo '--- kyoshin-receipt-sync-state.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/kyoshin-receipt-sync-state.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/kyoshin-receipt-sync-state.json\"
    else
      echo 'missing kyoshin-receipt-sync-state.json'
    fi

    echo
    echo '--- runtime-artifact-contracts.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/runtime-artifact-contracts.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/runtime-artifact-contracts.json\"
    else
      echo 'missing runtime-artifact-contracts.json'
      exit 1
    fi

    echo
    echo '--- last autonomy-loop.jsonl event ---'
    if [ -f \"$RUNTIME_LOG_DIR/autonomy-loop.jsonl\" ]; then
      tail -n 1 \"$RUNTIME_LOG_DIR/autonomy-loop.jsonl\" | jq .
    else
      echo 'missing autonomy-loop.jsonl'
      exit 1
    fi
  "

  echo "[6/6] revenue-mode reminder"
  echo "Set one of:"
  echo "  - KYO_X402_FACILITATOR_BASE_URL=https://<your-api-origin>"
  echo "  - KYO_X402_PRICING_URL(S)=..."
  if [ "$has_systemctl" -eq 1 ]; then
    echo "and restart: sudo systemctl restart $SYSTEMD_UNIT"
  else
    echo "and rerun: sudo -u $OPENCLAW_USER -H bash -lc '$TARGET_BIN_DIR/kyoshin-autonomy-loop.sh'"
  fi
}

run "$@"
