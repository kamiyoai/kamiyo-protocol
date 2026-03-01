#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-status}"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME}"
OPENCLAW_USER="${OPENCLAW_USER:-$(id -un)}"
ENV_FILE="${ENV_FILE:-$OPENCLAW_HOME/.openclaw/.env}"
ROLLOUT_SCRIPT="${ROLLOUT_SCRIPT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/rollout-artifact-contracts.sh}"
USE_SUDO="${USE_SUDO:-false}"
SYSTEMCTL_REQUIRED="${SYSTEMCTL_REQUIRED:-false}"
ENFORCE_REVENUE_GATES="${ENFORCE_REVENUE_GATES:-false}"
FAIL_ON_TICK_ERROR="${FAIL_ON_TICK_ERROR:-false}"

usage() {
  cat <<'EOF'
Usage:
  kyoshin-trading-cutover.sh status
  kyoshin-trading-cutover.sh paper
  kyoshin-trading-cutover.sh live

Modes:
  status  show current trading cutover readiness and latest runtime state
  paper   set paper-safe trading env and run rollout+tick
  live    require live execution/routing secrets, set live env, run rollout+tick
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

ensure_env_file() {
  mkdir -p "$(dirname "$ENV_FILE")"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

env_get() {
  local key="$1"
  awk -F= -v k="$key" '$1==k {print substr($0, index($0, "=")+1); found=1} END{if(!found) print ""}' "$ENV_FILE"
}

env_has() {
  local key="$1"
  local value
  value="$(env_get "$key")"
  [ -n "${value// }" ]
}

env_set() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  awk -F= -v k="$key" -v v="$value" '
    BEGIN { updated=0 }
    $1==k { if (!updated) { print k "=" v; updated=1 } next }
    { print }
    END { if (!updated) print k "=" v }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

print_presence() {
  local key="$1"
  if env_has "$key"; then
    echo "$key=present"
  else
    echo "$key=missing"
  fi
}

show_status() {
  echo "mode=$(env_get KYO_TRADING_EXECUTION_MODE)"
  echo "enabled=$(env_get KYO_ENABLE_TRADING_AGENT)"
  echo "required=$(env_get KYO_REQUIRE_TRADING_AGENT)"
  print_presence "KYO_TRADING_DFLOW_API_KEY"
  print_presence "KYO_TRADING_DFLOW_EXEC_CMD"
  print_presence "KYO_TRADING_STAKING_KEYPAIR_PATH"
  print_presence "KYO_TRADING_STAKING_ROUTE_CMD"
  print_presence "KYO_TRADING_KALSHI_API_KEY_ID"
  print_presence "KYO_TRADING_KALSHI_PRIVATE_KEY_PATH"
  local state_dir="$OPENCLAW_HOME/.openclaw/workspace/runtime/state"
  local receipts_dir="$OPENCLAW_HOME/.openclaw/workspace/runtime/receipts"
  if [ -f "$state_dir/revenue-guard.json" ]; then
    echo "revenue_guard=$(jq -c '{ok,status,reasons,blockPaidExecution}' "$state_dir/revenue-guard.json")"
  else
    echo "revenue_guard=missing"
  fi
  if [ -f "$state_dir/trading-feed.json" ]; then
    echo "trading_feed=$(jq -c '{ok,status,accepted,sourceStats}' "$state_dir/trading-feed.json")"
  else
    echo "trading_feed=missing"
  fi
  if [ -f "$state_dir/trading-exec.json" ]; then
    echo "trading_exec=$(jq -c '{ok,status,openedTrades,closedTrades,openPositions,weeklyRealizedNetUsd}' "$state_dir/trading-exec.json")"
  else
    echo "trading_exec=missing"
  fi
  if [ -f "$state_dir/trading-route.json" ]; then
    echo "trading_route=$(jq -c '{ok,status,totalProfitBasisUsd,unroutedProfitUsd,routeAmountSol}' "$state_dir/trading-route.json")"
  else
    echo "trading_route=missing"
  fi
  if [ -f "$receipts_dir/revenue-ledger.jsonl" ]; then
    echo "revenue_ledger_rows=$(wc -l <"$receipts_dir/revenue-ledger.jsonl" | tr -d '[:space:]')"
  else
    echo "revenue_ledger_rows=missing"
  fi
}

assert_live_secrets() {
  local missing=()
  if ! env_has "KYO_TRADING_DFLOW_API_KEY" && ! env_has "KYO_TRADING_DFLOW_EXEC_CMD"; then
    missing+=("KYO_TRADING_DFLOW_API_KEY|KYO_TRADING_DFLOW_EXEC_CMD")
  fi
  if ! env_has "KYO_TRADING_STAKING_KEYPAIR_PATH" && ! env_has "KYO_TRADING_STAKING_ROUTE_CMD"; then
    missing+=("KYO_TRADING_STAKING_KEYPAIR_PATH|KYO_TRADING_STAKING_ROUTE_CMD")
  fi
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "live cutover blocked: missing required secret groups:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    exit 1
  fi
}

apply_paper_defaults() {
  env_set "KYO_ENABLE_TRADING_AGENT" "true"
  env_set "KYO_REQUIRE_TRADING_AGENT" "true"
  env_set "KYO_TRADING_EXECUTION_MODE" "paper"
  env_set "KYO_TRADING_STAKING_DRY_RUN" "true"
  env_set "KYO_TRADING_VENUES" "dflow,kalshi"
  env_set "KYO_TRADING_KALSHI_SIGNAL_ONLY" "true"
  env_set "KYO_TRADING_DFLOW_API_BASE_URL" "https://dev-prediction-markets-api.dflow.net"
  env_set "KYO_TRADING_DFLOW_MARKETS_PATH" "/api/v1/markets"
  env_set "KYO_TRADING_DFLOW_MARKETS_STATUS" "active"
  env_set "KYO_TRADING_MAX_NOTIONAL_USD_PER_DAY" "750"
  env_set "KYO_TRADING_MAX_OPEN_POSITIONS" "6"
  env_set "KYO_TRADING_MAX_MARKET_EXPOSURE_USD" "150"
  env_set "KYO_TRADING_MAX_DRAWDOWN_PCT" "8"
  env_set "KYO_TRADING_WEEKLY_LOSS_CAP_USD" "300"
  env_set "KYO_TRADING_TAKE_PROFIT_PCT" "12"
  env_set "KYO_TRADING_STOP_LOSS_PCT" "8"
  env_set "KYO_TRADING_MAX_HOLD_HOURS" "72"
  env_set "KYO_TRADING_ROUTE_NET_BPS" "5000"
  env_set "KYO_TRADING_ROUTE_MIN_SOL" "0.000001"
  env_set "KYO_TRADING_ROUTE_LAG_TOLERANCE_USD" "1.0"
  env_set "KYO_TRADING_STAKING_POOL_URL" "https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d"
}

apply_live_defaults() {
  env_set "KYO_ENABLE_TRADING_AGENT" "true"
  env_set "KYO_REQUIRE_TRADING_AGENT" "true"
  env_set "KYO_TRADING_EXECUTION_MODE" "live"
  env_set "KYO_TRADING_STAKING_DRY_RUN" "false"
}

run_rollout() {
  OPENCLAW_HOME="$OPENCLAW_HOME" \
  OPENCLAW_USER="$OPENCLAW_USER" \
  USE_SUDO="$USE_SUDO" \
  SYSTEMCTL_REQUIRED="$SYSTEMCTL_REQUIRED" \
  ENFORCE_REVENUE_GATES="$ENFORCE_REVENUE_GATES" \
  FAIL_ON_TICK_ERROR="$FAIL_ON_TICK_ERROR" \
    bash "$ROLLOUT_SCRIPT"
}

main() {
  require_cmd awk
  require_cmd jq
  require_cmd bash
  ensure_env_file

  case "$MODE" in
    status)
      show_status
      ;;
    paper)
      apply_paper_defaults
      run_rollout
      show_status
      ;;
    live)
      assert_live_secrets
      apply_live_defaults
      run_rollout
      show_status
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"

