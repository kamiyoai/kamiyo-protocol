#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/home/$OPENCLAW_USER}"
SYSTEMD_UNIT="${SYSTEMD_UNIT:-kyoshin-autonomy-loop.service}"
ENFORCE_REVENUE_GATES="${ENFORCE_REVENUE_GATES:-true}"
KYOSHIN_DB_PATH="${KYOSHIN_DB_PATH:-}"
SYSTEMCTL_REQUIRED="${SYSTEMCTL_REQUIRED:-false}"
USE_SUDO="${USE_SUDO:-true}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET_BIN_DIR="$OPENCLAW_HOME/bin"
TARGET_BRIDGES_DIR="$TARGET_BIN_DIR/bridges"
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
    "fundry_staking_deposit.py"
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
    "kyoshin-trading-earnings-sweep.sh"
    "kyoshin-x402-agentcash.py"
    "kyoshin-clawmart-staking-route.py"
    "kyoshin-whop-staking-route.py"
    "kyoshin-creator-fee-inflow-route.py"
    "kyoshin-clawmart-monitor.py"
    "kyoshin-distribution-engine.py"
    "kyoshin-artifact-contracts.py"
    "kyoshin-learnings.py"
    "kyoshin-memory-extract.py"
    "kyoshin-operator-log.py"
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

  echo "[1.5/6] installing trading bridge workers"
  if is_true "$USE_SUDO"; then
    sudo install -d -m 700 -o "$OPENCLAW_USER" -g "$OPENCLAW_USER" "$TARGET_BRIDGES_DIR"
  else
    install -d -m 700 "$TARGET_BRIDGES_DIR"
  fi
  local bridge
  local bridges=(
    "trading-bridge-shared.mjs"
    "kyoshin-polymarket-bridge.mjs"
    "kyoshin-limitless-bridge.mjs"
    "kyoshin-earnings-sweep-bridge.mjs"
    "kyoshin-fundry-staking-deposit.mjs"
  )
  for bridge in "${bridges[@]}"; do
    if is_true "$USE_SUDO"; then
      sudo install -m 700 -o "$OPENCLAW_USER" -g "$OPENCLAW_USER" \
        "$SCRIPT_DIR/bridges/$bridge" \
        "$TARGET_BRIDGES_DIR/$bridge"
    else
      install -m 700 "$SCRIPT_DIR/bridges/$bridge" "$TARGET_BRIDGES_DIR/$bridge"
    fi
  done

  echo "[1.6/6] ensuring trading bridge dependencies"
  run_as_openclaw "
    set -euo pipefail
    if command -v npm >/dev/null 2>&1; then
      cd \"$TARGET_BRIDGES_DIR\"
      if [ ! -f package.json ]; then
        printf '%s\n' '{\"name\":\"kyoshin-trading-bridges\",\"private\":true,\"type\":\"module\"}' > package.json
      fi
      if [ ! -d node_modules/@polymarket/clob-client ] || [ ! -d node_modules/@ethersproject/wallet ] || [ ! -d node_modules/@limitless-exchange/sdk ] || [ ! -d node_modules/ethers ] || [ ! -d node_modules/@solana/web3.js ] || [ ! -d node_modules/bs58 ]; then
        npm install --silent --no-audit --no-fund --omit=dev @polymarket/clob-client @ethersproject/wallet @limitless-exchange/sdk ethers @solana/web3.js bs58 >/dev/null 2>&1 || true
      fi
    fi
  "

  echo "[2/6] ensuring required runtime gate flags exist"
  append_env_if_missing "KYO_REQUIRE_RUNTIME_ARTIFACT_CONTRACTS" "true"
  append_env_if_missing "KYO_REQUIRE_KYOSHIN_RUNTIME" "true"
  append_env_if_missing "KYO_ENABLE_MEMORY_EXTRACTION" "true"
  append_env_if_missing "KYO_REQUIRE_MEMORY_EXTRACTION" "false"
  append_env_if_missing "KYO_MEMORY_EXTRACTION_HOUR_UTC" "23"
  append_env_if_missing "KYO_ENABLE_CLAWMART_MONITOR" "true"
  append_env_if_missing "KYO_ENABLE_CLAWMART_STAKING_ROUTE" "true"
  append_env_if_missing "KYO_REQUIRE_CLAWMART_STAKING_ROUTE" "true"
  append_env_if_missing "KYO_ENABLE_CREATOR_FEE_INFLOW_ROUTE" "true"
  append_env_if_missing "KYO_REQUIRE_CREATOR_FEE_INFLOW_ROUTE" "false"
  append_env_if_missing "KYO_CREATOR_FEE_INFLOW_WALLET" "Gxa8pZeSMGrNGTGLLyrPsqHgr6cUhBQrs7TEBhBSocYx"
  append_env_if_missing "KYO_CREATOR_FEE_INFLOW_ROUTE_BPS" "5000"
  append_env_if_missing "KYO_CREATOR_FEE_INFLOW_MIN_TRANSFER_SOL" "0.000001"
  append_env_if_missing "KYO_CREATOR_FEE_STAKING_POOL_URL" "https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d"
  append_env_if_missing "KYO_CREATOR_FEE_INFLOW_KEYPAIR_PATH" ""
  append_env_if_missing "KYO_CREATOR_FEE_INFLOW_ADMIN_KEYPAIR_PATH" ""
  append_env_if_missing "KYO_CREATOR_FEE_INFLOW_ROUTE_CMD" ""
  append_env_if_missing "KYO_CREATOR_FEE_INFLOW_DRY_RUN" "false"
  append_env_if_missing "KYO_CREATOR_FEE_INFLOW_RPC_URL" "https://api.mainnet-beta.solana.com"
  append_env_if_missing "KYO_ENABLE_REVENUE_GUARD" "true"
  append_env_if_missing "KYO_REQUIRE_REVENUE_GUARD" "true"
  append_env_if_missing "KYO_ENABLE_TRADING_AGENT" "false"
  append_env_if_missing "KYO_REQUIRE_TRADING_AGENT" "false"
  append_env_if_missing "KYO_TRADING_EXECUTION_MODE" "paper"
  append_env_if_missing "KYO_TRADING_VENUES" "polymarket,limitless,kalshi"
  append_env_if_missing "KYO_TRADING_SINGULARITY_ENABLED" "true"
  append_env_if_missing "KYO_TRADING_SINGULARITY_API_BASE_URL" ""
  append_env_if_missing "KYO_TRADING_SINGULARITY_AUTH_WALLET" ""
  append_env_if_missing "KYO_TRADING_SINGULARITY_PRIVATE_KEY_PATH" ""
  append_env_if_missing "KYO_TRADING_SINGULARITY_BEARER_TOKEN" ""
  append_env_if_missing "KYO_TRADING_SINGULARITY_MODE" "paper"
  append_env_if_missing "KYO_TRADING_SINGULARITY_ORDERBOOK_LOOKUPS" "16"
  append_env_if_missing "KYO_TRADING_TICK_INTERVAL_SEC" "300"
  append_env_if_missing "KYO_TRADING_POLYMARKET_GAMMA_BASE_URL" "https://gamma-api.polymarket.com"
  append_env_if_missing "KYO_TRADING_POLYMARKET_CLOB_BASE_URL" "https://clob.polymarket.com"
  append_env_if_missing "KYO_TRADING_POLYMARKET_GEO_URL" "https://polymarket.com/api/geoblock"
  append_env_if_missing "KYO_TRADING_POLYMARKET_REQUIRE_GEO_ALLOWED" "true"
  append_env_if_missing "KYO_TRADING_POLYMARKET_EXEC_CMD" ""
  append_env_if_missing "KYO_TRADING_LIMITLESS_API_BASE_URL" "https://api.limitless.exchange"
  append_env_if_missing "KYO_TRADING_LIMITLESS_API_KEY" ""
  append_env_if_missing "KYO_TRADING_LIMITLESS_EXEC_CMD" ""
  append_env_if_missing "KYO_TRADING_LIMITLESS_PRIVATE_KEY_PATH" ""
  append_env_if_missing "KYO_TRADING_LIMITLESS_REQUIRE_SIGNED_PAYLOAD" "false"
  append_env_if_missing "KYO_TRADING_LIMITLESS_ORDER_TYPE" "FOK"
  append_env_if_missing "KYO_TRADING_LIMITLESS_SIDE" "buy"
  append_env_if_missing "KYO_TRADING_LIMITLESS_MAKER_ADDRESS" ""
  append_env_if_missing "KYO_TRADING_LIMITLESS_SIGNER_ADDRESS" ""
  append_env_if_missing "KYO_TRADING_LIMITLESS_SIGNATURE_TYPE" "1"
  append_env_if_missing "KYO_TRADING_MIN_FILL_PROB" "0.55"
  append_env_if_missing "KYO_TRADING_MIN_MARKET_LIQUIDITY_USD" "10000"
  append_env_if_missing "KYO_TRADING_MIN_TIME_TO_EXPIRY_MIN" "45"
  append_env_if_missing "KYO_TRADING_MAX_TIME_TO_EXPIRY_MIN" "1440"
  append_env_if_missing "KYO_TRADING_MAX_EVENT_CLUSTER_EXPOSURE_PCT" "35"
  append_env_if_missing "KYO_TRADING_VENUE_MIN_ALLOC_PCT" "20"
  append_env_if_missing "KYO_TRADING_VENUE_MAX_ALLOC_PCT" "70"
  append_env_if_missing "KYO_TRADING_MICRO_LIVE_MAX_NOTIONAL_USD" "75"
  append_env_if_missing "KYO_TRADING_MIN_PAPER_CLOSES_FOR_LIVE" "200"
  append_env_if_missing "KYO_TRADING_MIN_LIVE_CLOSES_TARGET_48H" "20"
  append_env_if_missing "KYO_TRADING_ENFORCE_MICRO_LIVE_GATES" "true"
  append_env_if_missing "KYO_TRADING_KALSHI_SIGNAL_ONLY" "true"
  append_env_if_missing "KYO_TRADING_MAX_DRAWDOWN_PCT" "8"
  append_env_if_missing "KYO_TRADING_DAILY_LOSS_STOP_PCT" "1.5"
  append_env_if_missing "KYO_TRADING_MAX_OPEN_POSITIONS" "2"
  append_env_if_missing "KYO_TRADING_MAX_POSITIONS_PER_MARKET" "1"
  append_env_if_missing "KYO_TRADING_MAX_MARKET_EXPOSURE_PCT" "25"
  append_env_if_missing "KYO_TRADING_MAX_NOTIONAL_USD_PER_DAY" "400"
  append_env_if_missing "KYO_TRADING_MAX_ORDER_SLIPPAGE_BPS" "120"
  append_env_if_missing "KYO_TRADING_MIN_EDGE_USD" "0.05"
  append_env_if_missing "KYO_TRADING_TAKE_PROFIT_PCT" "12"
  append_env_if_missing "KYO_TRADING_STOP_LOSS_PCT" "8"
  append_env_if_missing "KYO_TRADING_MAX_HOLD_HOURS" "72"
  append_env_if_missing "KYO_TRADING_ENTRY_PRICE_MIN" "0.05"
  append_env_if_missing "KYO_TRADING_ENTRY_PRICE_MAX" "0.95"
  append_env_if_missing "KYO_TRADING_CLOSE_ORPHAN_POSITIONS" "true"
  append_env_if_missing "KYO_TRADING_ORPHAN_POSITION_HOLD_HOURS" "2"
  append_env_if_missing "KYO_TRADING_MARKET_FAILURE_COOLDOWN_ENABLED" "true"
  append_env_if_missing "KYO_TRADING_MARKET_FAILURE_THRESHOLD" "2"
  append_env_if_missing "KYO_TRADING_MARKET_FAILURE_WINDOW_MIN" "60"
  append_env_if_missing "KYO_TRADING_MARKET_FAILURE_COOLDOWN_MIN" "120"
  append_env_if_missing "KYO_TRADING_WEEKLY_LOSS_CAP_USD" "300"
  append_env_if_missing "KYO_TRADING_ROUTE_NET_BPS" "5000"
  append_env_if_missing "KYO_TRADING_ROUTE_MIN_SOL" "0.000001"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_ENABLED" "false"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_CMD" "$TARGET_BIN_DIR/kyoshin-trading-earnings-sweep.sh"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_MIN_USD" "1"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_RELAY_API_BASE_URL" "https://api.relay.link"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_EVM_CHAIN_ID" "137"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_ORIGIN_CURRENCY" "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_BUFFER_BPS" "300"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_TIMEOUT_MS" "180000"
  append_env_if_missing "KYO_TRADING_ROUTE_EARNINGS_SWEEP_POLL_MS" "2500"
  append_env_if_missing "KYO_TRADING_STAKING_POOL_URL" "https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d"
  append_env_if_missing "KYO_TRADING_STAKING_ADMIN_KEYPAIR_PATH" ""
  append_env_if_missing "KYO_ENABLE_X402_AGENTCASH" "true"
  append_env_if_missing "KYO_REQUIRE_X402_AGENTCASH" "false"
  append_env_if_missing "KYO_X402_ALLOWED_NETWORKS" "eip155:8453,solana:mainnet"
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

  echo "[2.5/6] verifying trading bridge readiness"
  run_as_openclaw "
    set -euo pipefail
    if [ -x \"$TARGET_BRIDGES_DIR/kyoshin-polymarket-bridge.mjs\" ] && [ -x \"$TARGET_BRIDGES_DIR/kyoshin-limitless-bridge.mjs\" ] && [ -x \"$TARGET_BRIDGES_DIR/kyoshin-earnings-sweep-bridge.mjs\" ]; then
      echo 'bridges_installed=true'
    else
      echo 'bridges_installed=false'
    fi
    if command -v node >/dev/null 2>&1; then
      echo \"node_runtime=$(node -v 2>/dev/null || true)\"
    else
      echo 'node_runtime=missing'
    fi
    if [ -d \"$TARGET_BRIDGES_DIR/node_modules/@polymarket/clob-client\" ] && [ -d \"$TARGET_BRIDGES_DIR/node_modules/@ethersproject/wallet\" ]; then
      echo 'polymarket_bridge_deps=installed'
    else
      echo 'polymarket_bridge_deps=missing'
    fi
    if [ -d \"$TARGET_BRIDGES_DIR/node_modules/@limitless-exchange/sdk\" ] && [ -d \"$TARGET_BRIDGES_DIR/node_modules/ethers\" ]; then
      echo 'limitless_bridge_deps=installed'
    else
      echo 'limitless_bridge_deps=missing'
    fi
    if [ -d \"$TARGET_BRIDGES_DIR/node_modules/@solana/web3.js\" ] && [ -d \"$TARGET_BRIDGES_DIR/node_modules/bs58\" ] && [ -x \"$TARGET_BRIDGES_DIR/kyoshin-fundry-staking-deposit.mjs\" ]; then
      echo 'fundry_staking_bridge=installed'
    else
      echo 'fundry_staking_bridge=missing'
    fi
  "

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
    if is_true "$USE_SUDO"; then
      sudo systemctl start "$SYSTEMD_UNIT"
    else
      systemctl start "$SYSTEMD_UNIT"
    fi
    sleep 2
  else
    echo "systemctl not found; running loop script directly"
    run_as_openclaw "
      set -euo pipefail
      \"$TARGET_BIN_DIR/kyoshin-autonomy-loop.sh\"
    "
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
    echo '--- trading-capabilities.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/trading-capabilities.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/trading-capabilities.json\"
    else
      echo 'missing trading-capabilities.json'
    fi

    echo
    echo '--- leader-follow.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/leader-follow.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/leader-follow.json\"
    else
      echo 'missing leader-follow.json'
    fi

    echo
    echo '--- leader-follow-state.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/leader-follow-state.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/leader-follow-state.json\"
    else
      echo 'missing leader-follow-state.json'
    fi

    echo
    echo '--- singularity-paper.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/singularity-paper.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/singularity-paper.json\"
    else
      echo 'missing singularity-paper.json'
    fi

    echo
    echo '--- polymarket-geo.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/polymarket-geo.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/polymarket-geo.json\"
    else
      echo 'missing polymarket-geo.json'
    fi

    echo
    echo '--- trading-positions.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/trading-positions.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/trading-positions.json\"
    else
      echo 'missing trading-positions.json'
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
    echo '--- creator-fee-inflow-route-state.json ---'
    if [ -f \"$RUNTIME_STATE_DIR/creator-fee-inflow-route-state.json\" ]; then
      jq . \"$RUNTIME_STATE_DIR/creator-fee-inflow-route-state.json\"
    else
      echo 'missing creator-fee-inflow-route-state.json'
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
  echo "  - Optional: KYO_CLAWMART_STAKING_ADMIN_KEYPAIR_PATH=/path/to/admin-keypair.json"
  echo "Set creator-fee inflow routing:"
  echo "  - KYO_CREATOR_FEE_INFLOW_WALLET=Gxa8pZeSMGrNGTGLLyrPsqHgr6cUhBQrs7TEBhBSocYx"
  echo "  - KYO_CREATOR_FEE_INFLOW_KEYPAIR_PATH=/path/to/gxa8-wallet.json if the wallet is directly controlled"
  echo "  - Optional: KYO_CREATOR_FEE_INFLOW_ADMIN_KEYPAIR_PATH=/path/to/admin-keypair.json"
  echo "  - or KYO_CREATOR_FEE_INFLOW_ROUTE_CMD=... if inflow is claimed or routed indirectly"
  echo "Set trading routing credentials:"
  echo "  - KYO_TRADING_STAKING_KEYPAIR_PATH=/path/to/keypair.json (or KYO_TRADING_STAKING_ROUTE_CMD=...)"
  echo "  - Optional: KYO_TRADING_STAKING_ADMIN_KEYPAIR_PATH=/path/to/admin-keypair.json"
  echo "  - KYO_TRADING_POLYMARKET_PRIVATE_KEY_PATH=/path/to/evm.key"
  echo "  - KYO_TRADING_POLYMARKET_API_KEY/SECRET/PASSPHRASE (or allow API key derivation)"
  echo "  - polymarket bridge deps in $TARGET_BRIDGES_DIR/node_modules (@polymarket/clob-client + @ethersproject/wallet)"
  echo "  - limitless bridge deps in $TARGET_BRIDGES_DIR/node_modules (@limitless-exchange/sdk + ethers)"
  echo "  - KYO_TRADING_LIMITLESS_API_KEY=<limitless key>"
  echo "  - KYO_TRADING_LIMITLESS_PRIVATE_KEY_PATH=/path/to/evm.key (or KYO_TRADING_POLYMARKET_PRIVATE_KEY_PATH)"
  echo "  - KYO_TRADING_LIMITLESS_REQUIRE_SIGNED_PAYLOAD=false to use SDK fallback order signing"
  echo "  - KYO_TRADING_POLYMARKET_REQUIRE_GEO_ALLOWED=true to hard-block geo-restricted live orders"
  echo "  - KYO_TRADING_SINGULARITY_ENABLED=true and KYO_TRADING_SINGULARITY_API_BASE_URL=<url> for 5-minute paper training lane"
  echo "  - KYO_TRADING_MAX_TIME_TO_EXPIRY_MIN=1440 and KYO_TRADING_MAX_EVENT_CLUSTER_EXPOSURE_PCT=35"
  echo "  - KYO_TRADING_MICRO_LIVE_MAX_NOTIONAL_USD=75 and KYO_TRADING_ENFORCE_MICRO_LIVE_GATES=true"
  if [ "$has_systemctl" -eq 1 ]; then
    echo "and restart: sudo systemctl restart $SYSTEMD_UNIT"
  else
    echo "and rerun: sudo -u $OPENCLAW_USER -H bash -lc '$TARGET_BIN_DIR/kyoshin-autonomy-loop.sh'"
  fi
}

run "$@"
