#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/home/$OPENCLAW_USER}"
SYSTEMD_UNIT="${SYSTEMD_UNIT:-kyoshin-autonomy-loop.service}"
ENFORCE_REVENUE_GATES="${ENFORCE_REVENUE_GATES:-true}"
KYOSHIN_DB_PATH="${KYOSHIN_DB_PATH:-}"
SYSTEMCTL_REQUIRED="${SYSTEMCTL_REQUIRED:-false}"
USE_SUDO="${USE_SUDO:-true}"
FAIL_ON_TICK_ERROR="${FAIL_ON_TICK_ERROR:-true}"
INSTALL_AWESOME_FINANCE_SKILLS="${INSTALL_AWESOME_FINANCE_SKILLS:-false}"
AWESOME_FINANCE_SKILLS_SCOPE="${AWESOME_FINANCE_SKILLS_SCOPE:-workspace}"
AWESOME_FINANCE_SKILLS_CSV="${AWESOME_FINANCE_SKILLS_CSV:-alphaear-news,alphaear-stock,alphaear-sentiment,alphaear-predictor,alphaear-signal-tracker,alphaear-search,alphaear-reporter,alphaear-logic-visualizer}"

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

is_true() {
  case "${1:-}" in
    1 | true | TRUE | True | yes | YES | on | ON) return 0 ;;
    *) return 1 ;;
  esac
}

run_as_openclaw() {
  local command="$1"
  if is_true "$USE_SUDO"; then
    sudo -u "$OPENCLAW_USER" -H bash -lc "$command"
    return
  fi

  if [ "$(id -un)" != "$OPENCLAW_USER" ]; then
    echo "USE_SUDO=false requires current user to match OPENCLAW_USER" >&2
    exit 1
  fi
  bash -lc "$command"
}

append_env_if_missing() {
  local key="$1"
  local value="$2"
  run_as_openclaw "
    set -euo pipefail
    mkdir -p \"\$(dirname \"$ENV_FILE\")\"
    touch \"$ENV_FILE\"
    chmod 600 \"$ENV_FILE\"
    if ! grep -q \"^${key}=\" \"$ENV_FILE\"; then
      printf '%s=%s\n' \"$key\" \"$value\" >> \"$ENV_FILE\"
    fi
  "
}

set_env_value() {
  local key="$1"
  local value="$2"
  run_as_openclaw "
    set -euo pipefail
    mkdir -p \"\$(dirname \"$ENV_FILE\")\"
    touch \"$ENV_FILE\"
    chmod 600 \"$ENV_FILE\"
    tmp=\"\$(mktemp)\"
    trap 'rm -f \"\$tmp\"' EXIT
    grep -v \"^${key}=\" \"$ENV_FILE\" >\"\$tmp\" || true
    printf '%s=%s\n' \"$key\" \"$value\" >>\"\$tmp\"
    mv \"\$tmp\" \"$ENV_FILE\"
    chmod 600 \"$ENV_FILE\"
    trap - EXIT
  "
}

run() {
  require_cmd install
  require_cmd jq
  if is_true "$USE_SUDO"; then
    require_cmd sudo
  fi

  echo "[1/6] installing updated loop + runtime scripts"
  if is_true "$USE_SUDO"; then
    sudo install -d -m 700 -o "$OPENCLAW_USER" -g "$OPENCLAW_USER" "$TARGET_BIN_DIR"
  else
    install -d -m 700 "$TARGET_BIN_DIR"
  fi
  local scripts=(
    "kyoshin-sync-feed-config.py"
    "kyoshin-marketplace-intake.py"
    "kyoshin-x402-feed.py"
    "kyoshin-dx-terminal-feed.py"
    "kyoshin-receipt-sync.py"
    "kyoshin-context-guard.py"
    "kyoshin-sentry-pipeline.py"
    "kyoshin-tool-health.py"
    "kyoshin-runtime-bridge.py"
    "kyoshin-swarm-governor.py"
    "kyoshin-swarm-planner.py"
    "kyoshin-mission-control.py"
    "kyoshin-revenue-guard.py"
    "kyoshin-trading-feed.py"
    "kyoshin-trading-exec.py"
    "kyoshin-trading-staking-route.py"
    "kyoshin-x402-agentcash.py"
    "kyoshin-clawmart-staking-route.py"
    "kyoshin-clawmart-monitor.py"
    "kyoshin-distribution-engine.py"
    "kyoshin-artifact-contracts.py"
    "kyoshin-learnings.py"
    "kyoshin-memory-extract.py"
    "kyoshin-operator-log.py"
    "install-awesome-finance-skills.sh"
    "kyoshin-autonomy-loop.sh"
  )
  local script
  for script in "${scripts[@]}"; do
    if is_true "$USE_SUDO"; then
      sudo install -m 700 -o "$OPENCLAW_USER" -g "$OPENCLAW_USER" \
        "$SCRIPT_DIR/$script" \
        "$TARGET_BIN_DIR/$script"
    else
      install -m 700 "$SCRIPT_DIR/$script" "$TARGET_BIN_DIR/$script"
    fi
  done

  echo "[2/6] ensuring required runtime gate flags exist"
  append_env_if_missing "KYO_REQUIRE_RUNTIME_ARTIFACT_CONTRACTS" "true"
  append_env_if_missing "KYO_REQUIRE_KYOSHIN_RUNTIME" "true"
  append_env_if_missing "KYO_ENABLE_MEMORY_EXTRACTION" "true"
  append_env_if_missing "KYO_REQUIRE_MEMORY_EXTRACTION" "false"
  append_env_if_missing "KYO_MEMORY_EXTRACTION_HOUR_UTC" "23"
  append_env_if_missing "KYO_ENABLE_CLAWMART_MONITOR" "true"
  append_env_if_missing "KYO_ENABLE_CLAWMART_STAKING_ROUTE" "true"
  append_env_if_missing "KYO_REQUIRE_CLAWMART_STAKING_ROUTE" "true"
  append_env_if_missing "KYO_ENABLE_REVENUE_GUARD" "true"
  append_env_if_missing "KYO_REQUIRE_REVENUE_GUARD" "true"
  append_env_if_missing "KYO_ENABLE_TRADING_AGENT" "false"
  append_env_if_missing "KYO_REQUIRE_TRADING_AGENT" "false"
  append_env_if_missing "KYO_TRADING_EXECUTION_MODE" "paper"
  append_env_if_missing "KYO_TRADING_VENUES" "dflow,kalshi"
  append_env_if_missing "KYO_TRADING_KALSHI_SIGNAL_ONLY" "true"
  append_env_if_missing "KYO_TRADING_DFLOW_API_BASE_URL" "https://dev-prediction-markets-api.dflow.net"
  append_env_if_missing "KYO_TRADING_DFLOW_MARKETS_PATH" "/api/v1/markets"
  append_env_if_missing "KYO_TRADING_DFLOW_MARKETS_STATUS" "active"
  append_env_if_missing "KYO_TRADING_MAX_NOTIONAL_USD_PER_DAY" "750"
  append_env_if_missing "KYO_TRADING_MAX_OPEN_POSITIONS" "6"
  append_env_if_missing "KYO_TRADING_MAX_MARKET_EXPOSURE_USD" "150"
  append_env_if_missing "KYO_TRADING_MAX_DRAWDOWN_PCT" "8"
  append_env_if_missing "KYO_TRADING_WEEKLY_LOSS_CAP_USD" "300"
  append_env_if_missing "KYO_TRADING_TAKE_PROFIT_PCT" "12"
  append_env_if_missing "KYO_TRADING_STOP_LOSS_PCT" "8"
  append_env_if_missing "KYO_TRADING_MAX_HOLD_HOURS" "72"
  append_env_if_missing "KYO_TRADING_ROUTE_NET_BPS" "5000"
  append_env_if_missing "KYO_TRADING_ROUTE_MIN_SOL" "0.000001"
  append_env_if_missing "KYO_TRADING_STAKING_POOL_URL" "https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d"
  append_env_if_missing "KYO_ENABLE_X402_AGENTCASH" "true"
  append_env_if_missing "KYO_REQUIRE_X402_AGENTCASH" "false"
  append_env_if_missing "KYO_ENABLE_DISTRIBUTION_ENGINE" "true"
  append_env_if_missing "KYO_ENABLE_OPERATOR_LOG" "true"
  append_env_if_missing "KYO_WEEKLY_SPEND_CAP_USD" "150"
  append_env_if_missing "KYO_MIN_JOB_MARGIN_USD" "0"
  append_env_if_missing "KYO_X402_ALLOWLIST_PATH" "$OPENCLAW_HOME/.openclaw/workspace/runtime/feeds/x402-allowlist.json"
  append_env_if_missing "KYO_REQUIRE_CLAWMART_MONITOR" "false"
  append_env_if_missing "KYO_CLAWMART_MONITOR_MAX_TASKS" "8"
  append_env_if_missing "KYO_X402_GENERATED_FEED_ENABLED" "true"
  append_env_if_missing "KYO_DX_TERMINAL_ENABLED" "true"
  append_env_if_missing "KYO_DX_TERMINAL_GENERATED_FEED_ENABLED" "true"
  append_env_if_missing "KYO_ENABLE_SENTRY_PIPELINE" "true"
  append_env_if_missing "KYO_REQUIRE_SENTRY_PIPELINE" "false"
  append_env_if_missing "KYO_INSTALL_AWESOME_FINANCE_SKILLS" "false"
  append_env_if_missing "KYO_AWESOME_FINANCE_SKILLS_SCOPE" "workspace"
  append_env_if_missing "KYO_AWESOME_FINANCE_SKILLS_CSV" "alphaear-news,alphaear-stock,alphaear-sentiment,alphaear-predictor,alphaear-signal-tracker,alphaear-search,alphaear-reporter,alphaear-logic-visualizer"
  if [ -n "$KYOSHIN_DB_PATH" ]; then
    set_env_value "KYO_KYOSHIN_DB_PATH" "$KYOSHIN_DB_PATH"
  fi
  if [[ "$ENFORCE_REVENUE_GATES" =~ ^(1|true|TRUE|True|yes|YES|on|ON)$ ]]; then
    set_env_value "KYO_REQUIRE_X402_FEED" "true"
    set_env_value "KYO_REQUIRE_RECEIPT_SYNC" "true"
    set_env_value "KYO_REQUIRE_DX_TERMINAL_FEED" "false"
  else
    set_env_value "KYO_REQUIRE_X402_FEED" "false"
    set_env_value "KYO_REQUIRE_RECEIPT_SYNC" "false"
    set_env_value "KYO_REQUIRE_DX_TERMINAL_FEED" "false"
  fi

  if is_true "$INSTALL_AWESOME_FINANCE_SKILLS"; then
    echo "[2.5/6] installing Awesome-finance-skills into OpenClaw"
    run_as_openclaw "
      set -euo pipefail
      \"$TARGET_BIN_DIR/install-awesome-finance-skills.sh\" --scope \"$AWESOME_FINANCE_SKILLS_SCOPE\" --skills \"$AWESOME_FINANCE_SKILLS_CSV\"
    "
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
  local tick_rc=0
  if [ "$has_systemctl" -eq 1 ]; then
    if is_true "$USE_SUDO"; then
      sudo systemctl start "$SYSTEMD_UNIT"
    else
      systemctl start "$SYSTEMD_UNIT"
    fi
    sleep 2
  else
    echo "systemctl not found; running loop script directly"
    set +e
    run_as_openclaw "
      set -euo pipefail
      \"$TARGET_BIN_DIR/kyoshin-autonomy-loop.sh\"
    "
    tick_rc=$?
    set -e
    if [ "$tick_rc" -ne 0 ]; then
      echo "warning: control-loop tick returned non-zero exit code: $tick_rc"
    fi
  fi

  echo "[4/6] runtime control status"
  if [ "$has_systemctl" -eq 1 ]; then
    if is_true "$USE_SUDO"; then
      sudo systemctl --no-pager --full status "$SYSTEMD_UNIT" || true
    else
      systemctl --no-pager --full status "$SYSTEMD_UNIT" || true
    fi
  else
    echo "systemctl unavailable; service status skipped"
  fi

  echo "[5/6] runtime verification snapshots"
  run_as_openclaw "
    set -euo pipefail
    echo '--- revenue-guard.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/revenue-guard.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/revenue-guard.json\"
    else
      echo 'missing revenue-guard.json'
    fi

    echo
    echo '--- trading-feed.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/trading-feed.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/trading-feed.json\"
    else
      echo 'missing trading-feed.json'
    fi

    echo
    echo '--- trading-exec.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/trading-exec.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/trading-exec.json\"
    else
      echo 'missing trading-exec.json'
    fi

    echo
    echo '--- trading-route.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/trading-route.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/trading-route.json\"
    else
      echo 'missing trading-route.json'
    fi

    echo
    echo '--- trading-positions.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/trading-positions.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/trading-positions.json\"
    else
      echo 'missing trading-positions.json'
    fi

    echo
    echo '--- awesome-finance-skills.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/awesome-finance-skills.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/awesome-finance-skills.json\"
    else
      echo 'missing awesome-finance-skills.json'
    fi

    echo
    echo '--- x402-agentcash.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/x402-agentcash.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/x402-agentcash.json\"
    else
      echo 'missing x402-agentcash.json'
    fi

    echo
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
    echo '--- sentry-triage.json ---'
    if [ -f \"$OPENCLAW_HOME/.openclaw/workspace/runtime/incidents/sentry-triage.json\" ]; then
      jq . \"$OPENCLAW_HOME/.openclaw/workspace/runtime/incidents/sentry-triage.json\"
    else
      echo 'missing sentry-triage.json'
    fi

    echo
    echo '--- memory-extract-state.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/memory-extract-state.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/memory-extract-state.json\"
    else
      echo 'missing memory-extract-state.json'
    fi

    echo
    echo '--- clawmart-staking-route-state.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/clawmart-staking-route-state.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/clawmart-staking-route-state.json\"
    else
      echo 'missing clawmart-staking-route-state.json'
    fi

    echo
    echo '--- clawmart-monitor-state.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/clawmart-monitor-state.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/clawmart-monitor-state.json\"
    else
      echo 'missing clawmart-monitor-state.json'
    fi

    echo
    echo '--- distribution-engine.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/distribution-engine.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/distribution-engine.json\"
    else
      echo 'missing distribution-engine.json'
    fi

    echo
    echo '--- operator-log.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/operator-log.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/operator-log.json\"
    else
      echo 'missing operator-log.json'
    fi

    echo
    echo '--- revenue-ledger.jsonl tail ---'
    if [ -f \"$OPENCLAW_HOME/.openclaw/workspace/runtime/receipts/revenue-ledger.jsonl\" ]; then
      tail -n 5 \"$OPENCLAW_HOME/.openclaw/workspace/runtime/receipts/revenue-ledger.jsonl\" | jq -R 'fromjson?'
    else
      echo 'missing revenue-ledger.jsonl'
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
  echo "Set ClawMart staking routing:"
  echo "  - KYO_CLAWMART_STAKING_SOL_PER_SALE=<net-sol-per-sale>"
  echo "  - KYO_CLAWMART_STAKING_KEYPAIR_PATH=/path/to/keypair.json (or KYO_CLAWMART_STAKING_ROUTE_CMD=...)"
  echo "Set trading lane live credentials:"
  echo "  - KYO_ENABLE_TRADING_AGENT=true"
  echo "  - KYO_TRADING_EXECUTION_MODE=live"
  echo "  - KYO_TRADING_DFLOW_API_KEY=<key> (or KYO_TRADING_DFLOW_EXEC_CMD=...)"
  echo "  - KYO_TRADING_STAKING_KEYPAIR_PATH=/path/to/keypair.json (or KYO_TRADING_STAKING_ROUTE_CMD=...)"
  if [ "$has_systemctl" -eq 1 ]; then
    echo "and restart: sudo systemctl restart $SYSTEMD_UNIT"
  else
    echo "and rerun: sudo -u $OPENCLAW_USER -H bash -lc '$TARGET_BIN_DIR/kyoshin-autonomy-loop.sh'"
  fi

  if [ "$tick_rc" -ne 0 ] && is_true "$FAIL_ON_TICK_ERROR"; then
    exit "$tick_rc"
  fi
}

run "$@"
