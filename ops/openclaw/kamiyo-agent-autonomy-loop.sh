#!/usr/bin/env bash
set -euo pipefail
umask 077

if [ -z "${HOME:-}" ]; then
  HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
  export HOME
fi

NVM_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -v 2>/dev/null || true)"
  if [ -n "$NODE_VERSION" ]; then
    NVM_BIN="$HOME/.nvm/versions/node/$NODE_VERSION/bin"
  fi
fi

export PATH="$HOME/.npm-global/bin:$NVM_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

is_true() {
  case "${1:-}" in
    1 | true | TRUE | True | yes | YES | on | ON) return 0 ;;
    *) return 1 ;;
  esac
}

as_json_line() {
  tr -d '\n' <"$1"
}

ENV_FILE="$HOME/.openclaw/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

WORKSPACE_DIR="$HOME/.openclaw/workspace"
RUNTIME_DIR="$WORKSPACE_DIR/runtime"
STATE_DIR="$RUNTIME_DIR/state"
LOG_DIR="$RUNTIME_DIR/logs"
QUEUE_DIR="$RUNTIME_DIR/queue"
FEEDS_DIR="$RUNTIME_DIR/feeds"
TOOLS_DIR="$RUNTIME_DIR/tools"
MISSION_CONTROL_DIR="$RUNTIME_DIR/mission-control"
LEARNINGS_DIR="$WORKSPACE_DIR/.learnings"
mkdir -p "$STATE_DIR" "$LOG_DIR" "$QUEUE_DIR" "$FEEDS_DIR" "$TOOLS_DIR" "$MISSION_CONTROL_DIR" "$LEARNINGS_DIR"
chmod 700 "$RUNTIME_DIR" "$STATE_DIR" "$LOG_DIR" "$QUEUE_DIR" "$FEEDS_DIR" "$TOOLS_DIR" "$MISSION_CONTROL_DIR" "$LEARNINGS_DIR"

STATE_FILE="$STATE_DIR/autonomy-loop-state.json"
NIGHTLY_STATE_FILE="$STATE_DIR/nightly-mission-state.json"
MEMORY_EXTRACT_STATE_FILE="$STATE_DIR/memory-extract-state.json"
LOG_FILE="$LOG_DIR/autonomy-loop.jsonl"
RAW_DIR="$LOG_DIR/raw"
mkdir -p "$RAW_DIR"
chmod 700 "$RAW_DIR"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"

LOCK_FILE="$STATE_DIR/autonomy-loop.lock"
LOCK_DIR=""

NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY="$(date -u +%Y-%m-%d)"
CURRENT_HOUR_UTC="$(date -u +%H)"
START_EPOCH="$(date +%s)"
AGENT_TIMEOUT_SECONDS="${KYO_AGENT_TIMEOUT_SECONDS:-120}"
PROACTIVE_TIMEOUT_SECONDS="${KYO_PROACTIVE_TIMEOUT_SECONDS:-180}"
HEARTBEAT_MAX_ASSIGNMENTS="${KYO_HEARTBEAT_MAX_ASSIGNMENTS:-3}"
REQUIRE_RUNTIME_GUARDS="${KYO_REQUIRE_RUNTIME_GUARDS:-true}"
ENABLE_PROACTIVE_NIGHTLY="${KYO_ENABLE_PROACTIVE_NIGHTLY:-true}"
ENABLE_AGENT_HEARTBEAT="${KYO_ENABLE_AGENT_HEARTBEAT:-false}"
REQUIRE_GATEWAY_HEALTH="${KYO_REQUIRE_GATEWAY_HEALTH:-}"
REQUIRE_KAMIYO_AGENT_RUNTIME="${KYO_REQUIRE_KAMIYO_AGENT_RUNTIME:-true}"
REQUIRE_RUNTIME_ARTIFACT_CONTRACTS="${KYO_REQUIRE_RUNTIME_ARTIFACT_CONTRACTS:-true}"
PROACTIVE_HOUR_RAW="${KYO_PROACTIVE_HOUR_UTC:-2}"
MEMORY_EXTRACTION_HOUR_RAW="${KYO_MEMORY_EXTRACTION_HOUR_UTC:-23}"
REQUIRE_LEARNINGS="${KYO_REQUIRE_LEARNINGS:-true}"
REQUIRE_X402_FEED="${KYO_REQUIRE_X402_FEED:-false}"
REQUIRE_DX_TERMINAL_FEED="${KYO_REQUIRE_DX_TERMINAL_FEED:-false}"
REQUIRE_RECEIPT_SYNC="${KYO_REQUIRE_RECEIPT_SYNC:-false}"
ENABLE_SENTRY_PIPELINE="${KYO_ENABLE_SENTRY_PIPELINE:-true}"
REQUIRE_SENTRY_PIPELINE="${KYO_REQUIRE_SENTRY_PIPELINE:-false}"
ENABLE_MEMORY_EXTRACTION="${KYO_ENABLE_MEMORY_EXTRACTION:-true}"
REQUIRE_MEMORY_EXTRACTION="${KYO_REQUIRE_MEMORY_EXTRACTION:-false}"
ENABLE_CLAWMART_MONITOR="${KYO_ENABLE_CLAWMART_MONITOR:-true}"
REQUIRE_CLAWMART_MONITOR="${KYO_REQUIRE_CLAWMART_MONITOR:-false}"
ENABLE_CLAWMART_STAKING_ROUTE="${KYO_ENABLE_CLAWMART_STAKING_ROUTE:-true}"
REQUIRE_CLAWMART_STAKING_ROUTE="${KYO_REQUIRE_CLAWMART_STAKING_ROUTE:-true}"
ENABLE_CREATOR_FEE_INFLOW_ROUTE="${KYO_ENABLE_CREATOR_FEE_INFLOW_ROUTE:-false}"
REQUIRE_CREATOR_FEE_INFLOW_ROUTE="${KYO_REQUIRE_CREATOR_FEE_INFLOW_ROUTE:-false}"
ENABLE_REVENUE_GUARD="${KYO_ENABLE_REVENUE_GUARD:-true}"
REQUIRE_REVENUE_GUARD="${KYO_REQUIRE_REVENUE_GUARD:-true}"
ENABLE_TRADING_AGENT="${KYO_ENABLE_TRADING_AGENT:-false}"
REQUIRE_TRADING_AGENT="${KYO_REQUIRE_TRADING_AGENT:-false}"
ENABLE_X402_AGENTCASH="${KYO_ENABLE_X402_AGENTCASH:-true}"
REQUIRE_X402_AGENTCASH="${KYO_REQUIRE_X402_AGENTCASH:-false}"
ENABLE_DISTRIBUTION_ENGINE="${KYO_ENABLE_DISTRIBUTION_ENGINE:-true}"
REQUIRE_DISTRIBUTION_ENGINE="${KYO_REQUIRE_DISTRIBUTION_ENGINE:-false}"
ENABLE_OPERATOR_LOG="${KYO_ENABLE_OPERATOR_LOG:-true}"
REQUIRE_OPERATOR_LOG="${KYO_REQUIRE_OPERATOR_LOG:-false}"

if [ -z "$REQUIRE_GATEWAY_HEALTH" ]; then
  if is_true "$ENABLE_AGENT_HEARTBEAT"; then
    REQUIRE_GATEWAY_HEALTH=true
  else
    REQUIRE_GATEWAY_HEALTH=false
  fi
fi

if ! [[ "$PROACTIVE_HOUR_RAW" =~ ^[0-9]+$ ]] || [ "$PROACTIVE_HOUR_RAW" -lt 0 ] || [ "$PROACTIVE_HOUR_RAW" -gt 23 ]; then
  PROACTIVE_HOUR_RAW=2
fi
PROACTIVE_HOUR_UTC="$(printf '%02d' "$((10#$PROACTIVE_HOUR_RAW))")"

if ! [[ "$MEMORY_EXTRACTION_HOUR_RAW" =~ ^[0-9]+$ ]] || [ "$MEMORY_EXTRACTION_HOUR_RAW" -lt 0 ] || [ "$MEMORY_EXTRACTION_HOUR_RAW" -gt 23 ]; then
  MEMORY_EXTRACTION_HOUR_RAW=23
fi
MEMORY_EXTRACTION_HOUR_UTC="$(printf '%02d' "$((10#$MEMORY_EXTRACTION_HOUR_RAW))")"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    printf '{"at":"%s","event":"autonomy_tick","status":"skipped","reason":"lock_busy"}\n' "$NOW_ISO" >>"$LOG_FILE"
    exit 0
  fi
else
  LOCK_DIR="${LOCK_FILE}.d"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '{"at":"%s","event":"autonomy_tick","status":"skipped","reason":"lock_busy"}\n' "$NOW_ISO" >>"$LOG_FILE"
    exit 0
  fi
fi

TMP_DIR="$(mktemp -d "$STATE_DIR/tmp.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
  if [ -n "$LOCK_DIR" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ ! -s "$STATE_FILE" ]; then
  cat >"$STATE_FILE" <<EOF
{"cycles":0,"lastSuccessAt":null,"lastErrorAt":null,"lastError":null}
EOF
  chmod 600 "$STATE_FILE"
fi

if [ ! -s "$NIGHTLY_STATE_FILE" ]; then
  cat >"$NIGHTLY_STATE_FILE" <<EOF
{"lastRunDate":null}
EOF
  chmod 600 "$NIGHTLY_STATE_FILE"
fi

if [ ! -s "$MEMORY_EXTRACT_STATE_FILE" ]; then
  cat >"$MEMORY_EXTRACT_STATE_FILE" <<EOF
{"lastRunDate":null}
EOF
  chmod 600 "$MEMORY_EXTRACT_STATE_FILE"
fi

TODAY_MEMORY="$WORKSPACE_DIR/memory/${TODAY}.md"
mkdir -p "$(dirname "$TODAY_MEMORY")"
chmod 700 "$(dirname "$TODAY_MEMORY")"
if [ ! -f "$TODAY_MEMORY" ]; then
  printf '# %s\n' "$TODAY" >"$TODAY_MEMORY"
  chmod 600 "$TODAY_MEMORY"
fi

MISSION_STATEMENT_FILE="$WORKSPACE_DIR/MISSION_STATEMENT.md"
mission_statement="$(awk 'NF && $1 !~ /^#/ {print; exit}' "$MISSION_STATEMENT_FILE" 2>/dev/null || true)"
if [ -z "$mission_statement" ]; then
  mission_statement='Operate Kamiyo Agent as a 24/7 autonomous AI organization with auditable earnings and SOL routing.'
fi

cycles="$(jq -r '.cycles // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
if ! [[ "$cycles" =~ ^[0-9]+$ ]]; then
  cycles=0
fi
next_cycles=$((cycles + 1))
prev_success_json="$(jq -c '.lastSuccessAt // null' "$STATE_FILE" 2>/dev/null || echo null)"
last_nightly_run_date="$(jq -r '.lastRunDate // ""' "$NIGHTLY_STATE_FILE" 2>/dev/null || true)"
last_memory_extract_date="$(jq -r '.lastRunDate // ""' "$MEMORY_EXTRACT_STATE_FILE" 2>/dev/null || true)"

feed_sync_ok=1
feed_sync_summary='{"ok":false,"error":"not_run"}'
x402_feed_ok=1
x402_feed_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-x402-feed.py" ]; then
  if "$HOME/bin/kamiyo-agent-x402-feed.py" >"$TMP_DIR/x402-feed.json" 2>"$TMP_DIR/x402-feed.err"; then
    x402_feed_summary="$(as_json_line "$TMP_DIR/x402-feed.json")"
    x402_feed_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/x402-feed.json" 2>/dev/null || echo true)"
    x402_feed_accepted="$(jq -r '.accepted // 0' "$TMP_DIR/x402-feed.json" 2>/dev/null || echo 0)"
    if is_true "$REQUIRE_X402_FEED"; then
      if [ "$x402_feed_inner_ok" != "true" ] || ! [[ "$x402_feed_accepted" =~ ^[0-9]+$ ]] || [ "$x402_feed_accepted" -le 0 ]; then
        x402_feed_ok=0
      fi
    fi
  else
    if [ -s "$TMP_DIR/x402-feed.json" ]; then
      x402_feed_summary="$(as_json_line "$TMP_DIR/x402-feed.json")"
    else
      x402_feed_err="$(tr -d '\n' <"$TMP_DIR/x402-feed.err" | sed 's/"/\\"/g')"
      x402_feed_summary="{\"ok\":false,\"error\":\"$x402_feed_err\"}"
    fi
    if is_true "$REQUIRE_X402_FEED"; then
      x402_feed_ok=0
    fi
  fi
else
  x402_feed_summary='{"ok":false,"error":"missing_x402_feed_builder"}'
  if is_true "$REQUIRE_X402_FEED"; then
    x402_feed_ok=0
  fi
fi

dx_terminal_feed_ok=1
dx_terminal_feed_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-dx-terminal-feed.py" ]; then
  if "$HOME/bin/kamiyo-agent-dx-terminal-feed.py" >"$TMP_DIR/dx-terminal-feed.json" 2>"$TMP_DIR/dx-terminal-feed.err"; then
    dx_terminal_feed_summary="$(as_json_line "$TMP_DIR/dx-terminal-feed.json")"
    dx_terminal_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/dx-terminal-feed.json" 2>/dev/null || echo true)"
    dx_terminal_accepted="$(jq -r '.accepted // 0' "$TMP_DIR/dx-terminal-feed.json" 2>/dev/null || echo 0)"
    if is_true "$REQUIRE_DX_TERMINAL_FEED"; then
      if [ "$dx_terminal_inner_ok" != "true" ] || ! [[ "$dx_terminal_accepted" =~ ^[0-9]+$ ]] || [ "$dx_terminal_accepted" -le 0 ]; then
        dx_terminal_feed_ok=0
      fi
    fi
  else
    if [ -s "$TMP_DIR/dx-terminal-feed.json" ]; then
      dx_terminal_feed_summary="$(as_json_line "$TMP_DIR/dx-terminal-feed.json")"
    else
      dx_terminal_feed_err="$(tr -d '\n' <"$TMP_DIR/dx-terminal-feed.err" | sed 's/"/\\"/g')"
      dx_terminal_feed_summary="{\"ok\":false,\"error\":\"$dx_terminal_feed_err\"}"
    fi
    if is_true "$REQUIRE_DX_TERMINAL_FEED"; then
      dx_terminal_feed_ok=0
    fi
  fi
else
  dx_terminal_feed_summary='{"ok":false,"error":"missing_dx_terminal_feed_builder"}'
  if is_true "$REQUIRE_DX_TERMINAL_FEED"; then
    dx_terminal_feed_ok=0
  fi
fi

if [ -x "$HOME/bin/kamiyo-agent-sync-feed-config.py" ]; then
  if "$HOME/bin/kamiyo-agent-sync-feed-config.py" >"$TMP_DIR/feed-sync.json" 2>"$TMP_DIR/feed-sync.err"; then
    feed_sync_summary="$(as_json_line "$TMP_DIR/feed-sync.json")"
  else
    feed_sync_ok=0
    feed_sync_err="$(tr -d '\n' <"$TMP_DIR/feed-sync.err" | sed 's/"/\\"/g')"
    feed_sync_summary="{\"ok\":false,\"error\":\"$feed_sync_err\"}"
  fi
fi

gateway_ok=1
gateway_error=""
gateway_summary='{"ok":true,"status":"skipped"}'
if is_true "$REQUIRE_GATEWAY_HEALTH"; then
  gateway_ok=0
  for _ in 1 2 3; do
    if openclaw gateway health --json >"$TMP_DIR/gateway-health.json" 2>"$TMP_DIR/gateway-health.err"; then
      gateway_ok=1
      break
    fi
    sleep 2
  done
  if [ "$gateway_ok" -eq 1 ]; then
    gateway_summary="$(as_json_line "$TMP_DIR/gateway-health.json")"
  else
    if [ -f "$TMP_DIR/gateway-health.err" ]; then
      gateway_error="$(tr -d '\n' <"$TMP_DIR/gateway-health.err" | sed 's/"/\\"/g')"
    fi
    gateway_summary="{\"ok\":false,\"error\":\"${gateway_error:-health_check_failed}\"}"
  fi
fi

context_ok=1
context_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-context-guard.py" ]; then
  if "$HOME/bin/kamiyo-agent-context-guard.py" >"$TMP_DIR/context-guard.json" 2>"$TMP_DIR/context-guard.err"; then
    context_summary="$(as_json_line "$TMP_DIR/context-guard.json")"
    context_missing_count="$(jq -r '.requiredMissing | length // 0' "$TMP_DIR/context-guard.json" 2>/dev/null || echo 1)"
    if [ "$context_missing_count" -gt 0 ]; then
      context_ok=0
    fi
  else
    context_ok=0
    context_err="$(tr -d '\n' <"$TMP_DIR/context-guard.err" | sed 's/"/\\"/g')"
    context_summary="{\"ok\":false,\"error\":\"$context_err\"}"
  fi
else
  context_summary='{"ok":false,"error":"missing_context_guard"}'
  if is_true "$REQUIRE_RUNTIME_GUARDS"; then
    context_ok=0
  fi
fi

sentry_pipeline_ok=1
sentry_pipeline_summary='{"ok":true,"status":"disabled"}'
if is_true "$ENABLE_SENTRY_PIPELINE"; then
  sentry_pipeline_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-sentry-pipeline.py" ]; then
    if "$HOME/bin/kamiyo-agent-sentry-pipeline.py" >"$TMP_DIR/sentry-pipeline.json" 2>"$TMP_DIR/sentry-pipeline.err"; then
      sentry_pipeline_summary="$(as_json_line "$TMP_DIR/sentry-pipeline.json")"
      sentry_pipeline_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/sentry-pipeline.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_SENTRY_PIPELINE"; then
        if [ "$sentry_pipeline_inner_ok" != "true" ]; then
          sentry_pipeline_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/sentry-pipeline.json" ]; then
        sentry_pipeline_summary="$(as_json_line "$TMP_DIR/sentry-pipeline.json")"
      else
        sentry_pipeline_err="$(tr -d '\n' <"$TMP_DIR/sentry-pipeline.err" | sed 's/"/\\"/g')"
        sentry_pipeline_summary="{\"ok\":false,\"error\":\"$sentry_pipeline_err\"}"
      fi
      if is_true "$REQUIRE_SENTRY_PIPELINE"; then
        sentry_pipeline_ok=0
      fi
    fi
  else
    sentry_pipeline_summary='{"ok":false,"error":"missing_sentry_pipeline"}'
    if is_true "$REQUIRE_SENTRY_PIPELINE"; then
      sentry_pipeline_ok=0
    fi
  fi
fi

tool_health_ok=1
tool_health_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-tool-health.py" ]; then
  if "$HOME/bin/kamiyo-agent-tool-health.py" >"$TMP_DIR/tool-health.json" 2>"$TMP_DIR/tool-health.err"; then
    tool_health_summary="$(as_json_line "$TMP_DIR/tool-health.json")"
    critical_failures="$(jq -r '.criticalFailures | length // 0' "$TMP_DIR/tool-health.json" 2>/dev/null || echo 1)"
    if [ "$critical_failures" -gt 0 ]; then
      tool_health_ok=0
      if ! is_true "$ENABLE_AGENT_HEARTBEAT"; then
        non_gateway_critical="$(jq -r '(.criticalFailures // []) | map(select(. != "openclaw_gateway")) | length' "$TMP_DIR/tool-health.json" 2>/dev/null || echo 1)"
        if [ "$non_gateway_critical" -eq 0 ]; then
          tool_health_ok=1
          tool_health_summary="$(jq -c '. + {"ok": true, "downgradedCriticalFailures": ["openclaw_gateway"]}' "$TMP_DIR/tool-health.json" 2>/dev/null || as_json_line "$TMP_DIR/tool-health.json")"
        fi
      fi
    fi
  else
    tool_health_ok=0
    tool_health_err="$(tr -d '\n' <"$TMP_DIR/tool-health.err" | sed 's/"/\\"/g')"
    tool_health_summary="{\"ok\":false,\"error\":\"$tool_health_err\"}"
  fi
else
  tool_health_summary='{"ok":false,"error":"missing_tool_health"}'
  if is_true "$REQUIRE_RUNTIME_GUARDS"; then
    tool_health_ok=0
  fi
fi

marketplace_ok=1
marketplace_summary='{"ok":false,"error":"not_run"}'
if "$HOME/bin/kamiyo-agent-marketplace-intake.py" >"$TMP_DIR/marketplace-intake.json" 2>"$TMP_DIR/marketplace-intake.err"; then
  marketplace_summary="$(as_json_line "$TMP_DIR/marketplace-intake.json")"
else
  marketplace_ok=0
  intake_err="$(tr -d '\n' <"$TMP_DIR/marketplace-intake.err" | sed 's/"/\\"/g')"
  marketplace_summary="{\"ok\":false,\"error\":\"$intake_err\"}"
fi

receipt_sync_ok=1
receipt_sync_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-receipt-sync.py" ]; then
  if "$HOME/bin/kamiyo-agent-receipt-sync.py" >"$TMP_DIR/receipt-sync.json" 2>"$TMP_DIR/receipt-sync.err"; then
    receipt_sync_summary="$(as_json_line "$TMP_DIR/receipt-sync.json")"
    receipt_sync_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/receipt-sync.json" 2>/dev/null || echo true)"
    receipt_sync_status="$(jq -r '.status // "ok"' "$TMP_DIR/receipt-sync.json" 2>/dev/null || echo ok)"
    if is_true "$REQUIRE_RECEIPT_SYNC"; then
      if [ "$receipt_sync_inner_ok" != "true" ] || [ "$receipt_sync_status" = "skipped" ]; then
        receipt_sync_ok=0
      fi
    fi
  else
    if [ -s "$TMP_DIR/receipt-sync.json" ]; then
      receipt_sync_summary="$(as_json_line "$TMP_DIR/receipt-sync.json")"
    else
      receipt_sync_err="$(tr -d '\n' <"$TMP_DIR/receipt-sync.err" | sed 's/"/\\"/g')"
      receipt_sync_summary="{\"ok\":false,\"error\":\"$receipt_sync_err\"}"
    fi
    if is_true "$REQUIRE_RECEIPT_SYNC"; then
      receipt_sync_ok=0
    fi
  fi
else
  receipt_sync_summary='{"ok":false,"error":"missing_receipt_sync"}'
  if is_true "$REQUIRE_RECEIPT_SYNC"; then
    receipt_sync_ok=0
  fi
fi

governor_ok=1
governor_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-swarm-governor.py" ]; then
  if "$HOME/bin/kamiyo-agent-swarm-governor.py" >"$TMP_DIR/swarm-governor.json" 2>"$TMP_DIR/swarm-governor.err"; then
    governor_summary="$(as_json_line "$TMP_DIR/swarm-governor.json")"
  else
    governor_ok=0
    governor_err="$(tr -d '\n' <"$TMP_DIR/swarm-governor.err" | sed 's/"/\\"/g')"
    governor_summary="{\"ok\":false,\"error\":\"$governor_err\"}"
  fi
else
  governor_summary='{"ok":false,"error":"missing_swarm_governor"}'
  if is_true "$REQUIRE_RUNTIME_GUARDS"; then
    governor_ok=0
  fi
fi

planner_ok=1
planner_summary='{"ok":false,"error":"not_run"}'
if "$HOME/bin/kamiyo-agent-swarm-planner.py" >"$TMP_DIR/swarm-planner.json" 2>"$TMP_DIR/swarm-planner.err"; then
  planner_summary="$(as_json_line "$TMP_DIR/swarm-planner.json")"
else
  planner_ok=0
  planner_err="$(tr -d '\n' <"$TMP_DIR/swarm-planner.err" | sed 's/"/\\"/g')"
  planner_summary="{\"ok\":false,\"error\":\"$planner_err\"}"
fi

runtime_bridge_ok=1
runtime_bridge_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-runtime-bridge.py" ]; then
  if "$HOME/bin/kamiyo-agent-runtime-bridge.py" >"$TMP_DIR/runtime-bridge.json" 2>"$TMP_DIR/runtime-bridge.err"; then
    runtime_bridge_summary="$(as_json_line "$TMP_DIR/runtime-bridge.json")"
  else
    if [ -s "$TMP_DIR/runtime-bridge.json" ]; then
      runtime_bridge_summary="$(as_json_line "$TMP_DIR/runtime-bridge.json")"
    else
      runtime_bridge_err="$(tr -d '\n' <"$TMP_DIR/runtime-bridge.err" | sed 's/"/\\"/g')"
      runtime_bridge_summary="{\"ok\":false,\"error\":\"$runtime_bridge_err\"}"
    fi
    if is_true "$REQUIRE_KAMIYO_AGENT_RUNTIME"; then
      runtime_bridge_ok=0
    fi
  fi
else
  runtime_bridge_summary='{"ok":false,"error":"missing_runtime_bridge"}'
  if is_true "$REQUIRE_KAMIYO_AGENT_RUNTIME"; then
    runtime_bridge_ok=0
  fi
fi

mission_control_ok=1
mission_control_summary='{"ok":false,"error":"not_run"}'
trading_feed_ok=1
trading_feed_summary='{"ok":true,"status":"disabled"}'
trading_exec_ok=1
trading_exec_summary='{"ok":true,"status":"disabled"}'
trading_route_ok=1
trading_route_summary='{"ok":true,"status":"disabled"}'
if ! is_true "$ENABLE_TRADING_AGENT" && is_true "$REQUIRE_TRADING_AGENT"; then
  trading_feed_ok=0
  trading_exec_ok=0
  trading_route_ok=0
  trading_feed_summary='{"ok":false,"status":"blocked","reason":"trading_agent_required"}'
  trading_exec_summary='{"ok":false,"status":"blocked","reason":"trading_agent_required"}'
  trading_route_summary='{"ok":false,"status":"blocked","reason":"trading_agent_required"}'
fi

revenue_guard_ok=1
revenue_guard_summary='{"ok":true,"status":"disabled"}'
revenue_guard_blocks_paid=0
if is_true "$ENABLE_REVENUE_GUARD"; then
  revenue_guard_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-revenue-guard.py" ]; then
    if "$HOME/bin/kamiyo-agent-revenue-guard.py" >"$TMP_DIR/revenue-guard.json" 2>"$TMP_DIR/revenue-guard.err"; then
      revenue_guard_summary="$(as_json_line "$TMP_DIR/revenue-guard.json")"
      revenue_guard_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/revenue-guard.json" 2>/dev/null || echo true)"
      revenue_guard_block_paid_value="$(jq -r '.blockPaidExecution // false' "$TMP_DIR/revenue-guard.json" 2>/dev/null || echo false)"
      if [ "$revenue_guard_block_paid_value" = "true" ]; then
        revenue_guard_blocks_paid=1
      fi
      if is_true "$REQUIRE_REVENUE_GUARD"; then
        if [ "$revenue_guard_inner_ok" != "true" ]; then
          revenue_guard_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/revenue-guard.json" ]; then
        revenue_guard_summary="$(as_json_line "$TMP_DIR/revenue-guard.json")"
      else
        revenue_guard_err="$(tr -d '\n' <"$TMP_DIR/revenue-guard.err" | sed 's/"/\\"/g')"
        revenue_guard_summary="{\"ok\":false,\"error\":\"$revenue_guard_err\"}"
      fi
      if is_true "$REQUIRE_REVENUE_GUARD"; then
        revenue_guard_ok=0
      fi
    fi
  else
    revenue_guard_summary='{"ok":false,"error":"missing_revenue_guard"}'
    if is_true "$REQUIRE_REVENUE_GUARD"; then
      revenue_guard_ok=0
    fi
  fi
fi

if is_true "$ENABLE_TRADING_AGENT"; then
  trading_feed_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-trading-feed.py" ]; then
    if "$HOME/bin/kamiyo-agent-trading-feed.py" >"$TMP_DIR/trading-feed.json" 2>"$TMP_DIR/trading-feed.err"; then
      trading_feed_summary="$(as_json_line "$TMP_DIR/trading-feed.json")"
      trading_feed_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/trading-feed.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_TRADING_AGENT"; then
        if [ "$trading_feed_inner_ok" != "true" ]; then
          trading_feed_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/trading-feed.json" ]; then
        trading_feed_summary="$(as_json_line "$TMP_DIR/trading-feed.json")"
      else
        trading_feed_err="$(tr -d '\n' <"$TMP_DIR/trading-feed.err" | sed 's/"/\\"/g')"
        trading_feed_summary="{\"ok\":false,\"error\":\"$trading_feed_err\"}"
      fi
      if is_true "$REQUIRE_TRADING_AGENT"; then
        trading_feed_ok=0
      fi
    fi
  else
    trading_feed_summary='{"ok":false,"error":"missing_trading_feed"}'
    if is_true "$REQUIRE_TRADING_AGENT"; then
      trading_feed_ok=0
    fi
  fi

  trading_exec_summary='{"ok":false,"error":"not_run"}'
  if [ "$revenue_guard_blocks_paid" -eq 1 ]; then
    trading_exec_summary='{"ok":false,"status":"blocked","reason":"revenue_guard_block_paid_execution"}'
  elif [ -x "$HOME/bin/kamiyo-agent-trading-exec.py" ]; then
    if "$HOME/bin/kamiyo-agent-trading-exec.py" >"$TMP_DIR/trading-exec.json" 2>"$TMP_DIR/trading-exec.err"; then
      trading_exec_summary="$(as_json_line "$TMP_DIR/trading-exec.json")"
      trading_exec_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/trading-exec.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_TRADING_AGENT"; then
        if [ "$trading_exec_inner_ok" != "true" ]; then
          trading_exec_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/trading-exec.json" ]; then
        trading_exec_summary="$(as_json_line "$TMP_DIR/trading-exec.json")"
      else
        trading_exec_err="$(tr -d '\n' <"$TMP_DIR/trading-exec.err" | sed 's/"/\\"/g')"
        trading_exec_summary="{\"ok\":false,\"error\":\"$trading_exec_err\"}"
      fi
      if is_true "$REQUIRE_TRADING_AGENT"; then
        trading_exec_ok=0
      fi
    fi
  else
    trading_exec_summary='{"ok":false,"error":"missing_trading_exec"}'
    if is_true "$REQUIRE_TRADING_AGENT"; then
      trading_exec_ok=0
    fi
  fi

  trading_route_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-trading-staking-route.py" ]; then
    if "$HOME/bin/kamiyo-agent-trading-staking-route.py" >"$TMP_DIR/trading-route.json" 2>"$TMP_DIR/trading-route.err"; then
      trading_route_summary="$(as_json_line "$TMP_DIR/trading-route.json")"
      trading_route_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/trading-route.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_TRADING_AGENT"; then
        if [ "$trading_route_inner_ok" != "true" ]; then
          trading_route_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/trading-route.json" ]; then
        trading_route_summary="$(as_json_line "$TMP_DIR/trading-route.json")"
      else
        trading_route_err="$(tr -d '\n' <"$TMP_DIR/trading-route.err" | sed 's/"/\\"/g')"
        trading_route_summary="{\"ok\":false,\"error\":\"$trading_route_err\"}"
      fi
      if is_true "$REQUIRE_TRADING_AGENT"; then
        trading_route_ok=0
      fi
    fi
  else
    trading_route_summary='{"ok":false,"error":"missing_trading_route"}'
    if is_true "$REQUIRE_TRADING_AGENT"; then
      trading_route_ok=0
    fi
  fi
fi

x402_agentcash_ok=1
x402_agentcash_summary='{"ok":true,"status":"disabled"}'
if is_true "$ENABLE_X402_AGENTCASH"; then
  x402_agentcash_summary='{"ok":false,"error":"not_run"}'
  if [ "$revenue_guard_blocks_paid" -eq 1 ]; then
    x402_agentcash_summary='{"ok":false,"status":"blocked","reason":"revenue_guard_block_paid_execution"}'
  elif [ -x "$HOME/bin/kamiyo-agent-x402-agentcash.py" ]; then
    if "$HOME/bin/kamiyo-agent-x402-agentcash.py" >"$TMP_DIR/x402-agentcash.json" 2>"$TMP_DIR/x402-agentcash.err"; then
      x402_agentcash_summary="$(as_json_line "$TMP_DIR/x402-agentcash.json")"
      x402_agentcash_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/x402-agentcash.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_X402_AGENTCASH"; then
        if [ "$x402_agentcash_inner_ok" != "true" ]; then
          x402_agentcash_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/x402-agentcash.json" ]; then
        x402_agentcash_summary="$(as_json_line "$TMP_DIR/x402-agentcash.json")"
      else
        x402_agentcash_err="$(tr -d '\n' <"$TMP_DIR/x402-agentcash.err" | sed 's/"/\\"/g')"
        x402_agentcash_summary="{\"ok\":false,\"error\":\"$x402_agentcash_err\"}"
      fi
      if is_true "$REQUIRE_X402_AGENTCASH"; then
        x402_agentcash_ok=0
      fi
    fi
  else
    x402_agentcash_summary='{"ok":false,"error":"missing_x402_agentcash"}'
    if is_true "$REQUIRE_X402_AGENTCASH"; then
      x402_agentcash_ok=0
    fi
  fi
fi

clawmart_staking_route_ok=1
clawmart_staking_route_summary='{"ok":true,"status":"disabled"}'
if is_true "$ENABLE_CLAWMART_STAKING_ROUTE"; then
  clawmart_staking_route_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-clawmart-staking-route.py" ]; then
    if "$HOME/bin/kamiyo-agent-clawmart-staking-route.py" >"$TMP_DIR/clawmart-staking-route.json" 2>"$TMP_DIR/clawmart-staking-route.err"; then
      clawmart_staking_route_summary="$(as_json_line "$TMP_DIR/clawmart-staking-route.json")"
      clawmart_staking_route_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/clawmart-staking-route.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_CLAWMART_STAKING_ROUTE"; then
        if [ "$clawmart_staking_route_inner_ok" != "true" ]; then
          clawmart_staking_route_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/clawmart-staking-route.json" ]; then
        clawmart_staking_route_summary="$(as_json_line "$TMP_DIR/clawmart-staking-route.json")"
      else
        clawmart_staking_route_err="$(tr -d '\n' <"$TMP_DIR/clawmart-staking-route.err" | sed 's/"/\\"/g')"
        clawmart_staking_route_summary="{\"ok\":false,\"error\":\"$clawmart_staking_route_err\"}"
      fi
      if is_true "$REQUIRE_CLAWMART_STAKING_ROUTE"; then
        clawmart_staking_route_ok=0
      fi
    fi
  else
    clawmart_staking_route_summary='{"ok":false,"error":"missing_clawmart_staking_route"}'
    if is_true "$REQUIRE_CLAWMART_STAKING_ROUTE"; then
      clawmart_staking_route_ok=0
    fi
  fi
fi

creator_fee_inflow_route_ok=1
creator_fee_inflow_route_summary='{"ok":true,"status":"disabled"}'
if is_true "$ENABLE_CREATOR_FEE_INFLOW_ROUTE"; then
  creator_fee_inflow_route_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-creator-fee-inflow-route.py" ]; then
    if "$HOME/bin/kamiyo-agent-creator-fee-inflow-route.py" >"$TMP_DIR/creator-fee-inflow-route.json" 2>"$TMP_DIR/creator-fee-inflow-route.err"; then
      creator_fee_inflow_route_summary="$(as_json_line "$TMP_DIR/creator-fee-inflow-route.json")"
      creator_fee_inflow_route_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/creator-fee-inflow-route.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_CREATOR_FEE_INFLOW_ROUTE"; then
        if [ "$creator_fee_inflow_route_inner_ok" != "true" ]; then
          creator_fee_inflow_route_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/creator-fee-inflow-route.json" ]; then
        creator_fee_inflow_route_summary="$(as_json_line "$TMP_DIR/creator-fee-inflow-route.json")"
      else
        creator_fee_inflow_route_err="$(tr -d '\n' <"$TMP_DIR/creator-fee-inflow-route.err" | sed 's/"/\\"/g')"
        creator_fee_inflow_route_summary="{\"ok\":false,\"error\":\"$creator_fee_inflow_route_err\"}"
      fi
      if is_true "$REQUIRE_CREATOR_FEE_INFLOW_ROUTE"; then
        creator_fee_inflow_route_ok=0
      fi
    fi
  else
    creator_fee_inflow_route_summary='{"ok":false,"error":"missing_creator_fee_inflow_route"}'
    if is_true "$REQUIRE_CREATOR_FEE_INFLOW_ROUTE"; then
      creator_fee_inflow_route_ok=0
    fi
  fi
fi

clawmart_monitor_ok=1
clawmart_monitor_summary='{"ok":true,"status":"disabled"}'
if is_true "$ENABLE_CLAWMART_MONITOR"; then
  clawmart_monitor_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-clawmart-monitor.py" ]; then
    if "$HOME/bin/kamiyo-agent-clawmart-monitor.py" >"$TMP_DIR/clawmart-monitor.json" 2>"$TMP_DIR/clawmart-monitor.err"; then
      clawmart_monitor_summary="$(as_json_line "$TMP_DIR/clawmart-monitor.json")"
      clawmart_monitor_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/clawmart-monitor.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_CLAWMART_MONITOR"; then
        if [ "$clawmart_monitor_inner_ok" != "true" ]; then
          clawmart_monitor_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/clawmart-monitor.json" ]; then
        clawmart_monitor_summary="$(as_json_line "$TMP_DIR/clawmart-monitor.json")"
      else
        clawmart_monitor_err="$(tr -d '\n' <"$TMP_DIR/clawmart-monitor.err" | sed 's/"/\\"/g')"
        clawmart_monitor_summary="{\"ok\":false,\"error\":\"$clawmart_monitor_err\"}"
      fi
      if is_true "$REQUIRE_CLAWMART_MONITOR"; then
        clawmart_monitor_ok=0
      fi
    fi
  else
    clawmart_monitor_summary='{"ok":false,"error":"missing_clawmart_monitor"}'
    if is_true "$REQUIRE_CLAWMART_MONITOR"; then
      clawmart_monitor_ok=0
    fi
  fi
fi

distribution_engine_ok=1
distribution_engine_summary='{"ok":true,"status":"disabled"}'
if is_true "$ENABLE_DISTRIBUTION_ENGINE"; then
  distribution_engine_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-distribution-engine.py" ]; then
    if "$HOME/bin/kamiyo-agent-distribution-engine.py" >"$TMP_DIR/distribution-engine.json" 2>"$TMP_DIR/distribution-engine.err"; then
      distribution_engine_summary="$(as_json_line "$TMP_DIR/distribution-engine.json")"
      distribution_engine_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/distribution-engine.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_DISTRIBUTION_ENGINE"; then
        if [ "$distribution_engine_inner_ok" != "true" ]; then
          distribution_engine_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/distribution-engine.json" ]; then
        distribution_engine_summary="$(as_json_line "$TMP_DIR/distribution-engine.json")"
      else
        distribution_engine_err="$(tr -d '\n' <"$TMP_DIR/distribution-engine.err" | sed 's/"/\\"/g')"
        distribution_engine_summary="{\"ok\":false,\"error\":\"$distribution_engine_err\"}"
      fi
      if is_true "$REQUIRE_DISTRIBUTION_ENGINE"; then
        distribution_engine_ok=0
      fi
    fi
  else
    distribution_engine_summary='{"ok":false,"error":"missing_distribution_engine"}'
    if is_true "$REQUIRE_DISTRIBUTION_ENGINE"; then
      distribution_engine_ok=0
    fi
  fi
fi

mission_control_ok=1
mission_control_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-mission-control.py" ]; then
  if "$HOME/bin/kamiyo-agent-mission-control.py" >"$TMP_DIR/mission-control.json" 2>"$TMP_DIR/mission-control.err"; then
    mission_control_summary="$(as_json_line "$TMP_DIR/mission-control.json")"
  else
    mission_control_ok=0
    mission_control_err="$(tr -d '\n' <"$TMP_DIR/mission-control.err" | sed 's/"/\\"/g')"
    mission_control_summary="{\"ok\":false,\"error\":\"$mission_control_err\"}"
  fi
else
  mission_control_summary='{"ok":false,"error":"missing_mission_control"}'
  if is_true "$REQUIRE_RUNTIME_GUARDS"; then
    mission_control_ok=0
  fi
fi

artifact_contracts_ok=1
artifact_contracts_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-artifact-contracts.py" ]; then
  if "$HOME/bin/kamiyo-agent-artifact-contracts.py" >"$TMP_DIR/artifact-contracts.json" 2>"$TMP_DIR/artifact-contracts.err"; then
    artifact_contracts_summary="$(as_json_line "$TMP_DIR/artifact-contracts.json")"
    artifact_contracts_errors="$(jq -r '.errors | length // 0' "$TMP_DIR/artifact-contracts.json" 2>/dev/null || echo 1)"
    if [ "$artifact_contracts_errors" -gt 0 ]; then
      artifact_contracts_ok=0
    fi
  else
    artifact_contracts_ok=0
    artifact_contracts_err="$(tr -d '\n' <"$TMP_DIR/artifact-contracts.err" | sed 's/"/\\"/g')"
    artifact_contracts_summary="{\"ok\":false,\"error\":\"$artifact_contracts_err\"}"
  fi
else
  artifact_contracts_summary='{"ok":false,"error":"missing_artifact_contracts"}'
  if is_true "$REQUIRE_RUNTIME_ARTIFACT_CONTRACTS"; then
    artifact_contracts_ok=0
  fi
fi

assignment_count="$(jq -r '.assignments | length' "$QUEUE_DIR/assignments.json" 2>/dev/null || echo 0)"
opportunity_count="$(jq -r '.accepted // ((.opportunities // []) | length) // 0' "$FEEDS_DIR/opportunities.json" 2>/dev/null || echo 0)"

read -r -d '' HEARTBEAT_MSG <<'EOF' || true
Autonomy heartbeat run.

Execute one Kamiyo Agent control-loop tick with the following rules:
- Read SOUL.md, IDENTITY.md, MEMORY.md, AGENTS.md, soul.md, identity.md, heartbeat.md, MISSION_STATEMENT.md, USER_PROFILE.md, GOALS.md, AMBITIONS.md, WORKING-MEMORY.md, .learnings/LEARNINGS.md and memory/TODAY.md.
- Read runtime/feeds/opportunities.json, runtime/queue/assignments.json and runtime/mission-control/board.json.
- Process up to HEARTBEAT_MAX assignments that are safe, compliant, and auditable.
- If credentials or external endpoints are missing, do not fake success. Record blockers and next concrete action.
- Update WORKING-MEMORY.md with current state, blockers, and next cycle priorities.
- Update MEMORY.md only with durable preferences or policy facts learned during this cycle.
- Append one concise log line to memory/TODAY.md.
- If any failure/degraded condition is detected, append mistake/correction/rule to .learnings/LEARNINGS.md.
- If a required tool is missing, propose or scaffold the minimal tool needed in Mission Control backlog.
- Keep responses concise and factual.
- If no safe action exists, reply HEARTBEAT_OK with reason.
EOF

heartbeat_msg="${HEARTBEAT_MSG//TODAY/$TODAY}"
heartbeat_msg="${heartbeat_msg//HEARTBEAT_MAX/$HEARTBEAT_MAX_ASSIGNMENTS}"
heartbeat_msg+=$'\n'
heartbeat_msg+="Mission: $mission_statement"$'\n'
heartbeat_msg+="Context: opportunities=$opportunity_count assignments=$assignment_count cycle=$next_cycles timestamp=$NOW_ISO gateway_ok=$gateway_ok"

run_json_file="$RAW_DIR/agent-${TODAY}-${next_cycles}.json"
agent_ok=1
agent_reply=""
agent_error=""

if is_true "$ENABLE_AGENT_HEARTBEAT"; then
  if openclaw agent --agent main --local --message "$heartbeat_msg" --timeout "$AGENT_TIMEOUT_SECONDS" --json >"$run_json_file" 2>"$TMP_DIR/agent.err"; then
    agent_reply="$(jq -r '.payloads[0].text // ""' "$run_json_file" | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-1800)"
    if printf '%s' "$agent_reply" | grep -Eq '^(LLM request rejected:|Provider request failed:|Authentication error:|Insufficient credits:)'; then
      agent_ok=0
      agent_error="$agent_reply"
    fi
  else
    agent_ok=0
    agent_error="$(tr -d '\n' <"$TMP_DIR/agent.err" | sed 's/"/\\"/g')"
  fi
else
  agent_reply="agent_heartbeat_disabled"
fi

proactive_ok=1
proactive_summary='{"ok":true,"status":"not_due"}'
if is_true "$ENABLE_PROACTIVE_NIGHTLY"; then
  if ! is_true "$ENABLE_AGENT_HEARTBEAT"; then
    proactive_summary='{"ok":true,"status":"skipped_agent_heartbeat_disabled"}'
  elif [ "$CURRENT_HOUR_UTC" = "$PROACTIVE_HOUR_UTC" ] && [ "$last_nightly_run_date" != "$TODAY" ]; then
    read -r -d '' PROACTIVE_MSG <<'EOF' || true
Nightly proactive mission.

Create one concrete action that moves the mission forward and can be executed safely in unattended mode.
Requirements:
- Prefer actions that improve earning capacity, reliability, or tool coverage.
- If blocked, create a concrete unblock plan with exact next command/file edits.
- Update WORKING-MEMORY.md and append one log line in memory/TODAY.md.
- Output one short status summary.
EOF
    proactive_msg="$PROACTIVE_MSG"$'\n'"Mission statement: $mission_statement"
    proactive_json_file="$RAW_DIR/proactive-${TODAY}-${next_cycles}.json"
    proactive_reply=""
    proactive_err=""
    if openclaw agent --agent main --local --message "$proactive_msg" --timeout "$PROACTIVE_TIMEOUT_SECONDS" --json >"$proactive_json_file" 2>"$TMP_DIR/proactive.err"; then
      proactive_reply="$(jq -r '.payloads[0].text // ""' "$proactive_json_file" | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-1800)"
      if printf '%s' "$proactive_reply" | grep -Eq '^(LLM request rejected:|Provider request failed:|Authentication error:|Insufficient credits:)'; then
        proactive_ok=0
        proactive_err="$proactive_reply"
      else
        cat >"$NIGHTLY_STATE_FILE" <<EOF
{"lastRunDate":"$TODAY","lastRunAt":"$NOW_ISO","cycle":$next_cycles}
EOF
        chmod 600 "$NIGHTLY_STATE_FILE"
        last_nightly_run_date="$TODAY"
      fi
    else
      proactive_ok=0
      proactive_err="$(tr -d '\n' <"$TMP_DIR/proactive.err" | sed 's/"/\\"/g')"
    fi
    if [ "$proactive_ok" -eq 1 ]; then
      proactive_summary="{\"ok\":true,\"status\":\"executed\",\"reply\":\"$proactive_reply\"}"
    else
      proactive_summary="{\"ok\":false,\"status\":\"failed\",\"error\":\"$proactive_err\"}"
    fi
  fi
else
  proactive_summary='{"ok":true,"status":"disabled"}'
fi

if (( next_cycles % 12 == 0 )); then
  openclaw security audit --deep --json >"$RAW_DIR/security-audit-${TODAY}-${next_cycles}.json" 2>"$RAW_DIR/security-audit-${TODAY}-${next_cycles}.err" || true
fi

END_EPOCH="$(date +%s)"
DURATION_MS=$(((END_EPOCH - START_EPOCH) * 1000))

combined_error=""

if [ "$agent_ok" -eq 1 ] \
  && [ "$proactive_ok" -eq 1 ] \
  && [ "$x402_feed_ok" -eq 1 ] \
  && [ "$dx_terminal_feed_ok" -eq 1 ] \
  && [ "$marketplace_ok" -eq 1 ] \
  && [ "$receipt_sync_ok" -eq 1 ] \
  && [ "$planner_ok" -eq 1 ] \
  && [ "$feed_sync_ok" -eq 1 ] \
  && [ "$gateway_ok" -eq 1 ] \
  && [ "$runtime_bridge_ok" -eq 1 ] \
  && [ "$context_ok" -eq 1 ] \
  && [ "$sentry_pipeline_ok" -eq 1 ] \
  && [ "$tool_health_ok" -eq 1 ] \
  && [ "$governor_ok" -eq 1 ] \
  && [ "$revenue_guard_ok" -eq 1 ] \
  && [ "$trading_feed_ok" -eq 1 ] \
  && [ "$trading_exec_ok" -eq 1 ] \
  && [ "$trading_route_ok" -eq 1 ] \
  && [ "$x402_agentcash_ok" -eq 1 ] \
  && [ "$clawmart_staking_route_ok" -eq 1 ] \
  && [ "$creator_fee_inflow_route_ok" -eq 1 ] \
  && [ "$clawmart_monitor_ok" -eq 1 ] \
  && [ "$distribution_engine_ok" -eq 1 ] \
  && [ "$mission_control_ok" -eq 1 ] \
  && [ "$artifact_contracts_ok" -eq 1 ]; then
  cat >"$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":"$NOW_ISO","lastErrorAt":null,"lastError":null,"lastNightlyMissionDate":"$last_nightly_run_date","lastMemoryExtractDate":"$last_memory_extract_date"}
EOF
  status="ok"
else
  status="degraded"
  if [ "$agent_ok" -ne 1 ]; then
    combined_error+="agent:$agent_error;"
  fi
  if [ "$proactive_ok" -ne 1 ]; then
    combined_error+="proactive_failed;"
  fi
  if [ "$marketplace_ok" -ne 1 ]; then
    combined_error+="marketplace_failed;"
  fi
  if [ "$receipt_sync_ok" -ne 1 ]; then
    combined_error+="receipt_sync_failed;"
  fi
  if [ "$x402_feed_ok" -ne 1 ]; then
    combined_error+="x402_feed_failed;"
  fi
  if [ "$dx_terminal_feed_ok" -ne 1 ]; then
    combined_error+="dx_terminal_feed_failed;"
  fi
  if [ "$planner_ok" -ne 1 ]; then
    combined_error+="planner_failed;"
  fi
  if [ "$feed_sync_ok" -ne 1 ]; then
    combined_error+="feed_sync_failed;"
  fi
  if [ "$gateway_ok" -ne 1 ]; then
    combined_error+="gateway:${gateway_error:-health_check_failed};"
  fi
  if [ "$runtime_bridge_ok" -ne 1 ]; then
    combined_error+="runtime_bridge_failed;"
  fi
  if [ "$context_ok" -ne 1 ]; then
    combined_error+="context_incomplete;"
  fi
  if [ "$sentry_pipeline_ok" -ne 1 ]; then
    combined_error+="sentry_pipeline_failed;"
  fi
  if [ "$tool_health_ok" -ne 1 ]; then
    combined_error+="tool_health_failed;"
  fi
  if [ "$governor_ok" -ne 1 ]; then
    combined_error+="governor_failed;"
  fi
  if [ "$revenue_guard_ok" -ne 1 ]; then
    combined_error+="revenue_guard_failed;"
  fi
  if [ "$trading_feed_ok" -ne 1 ]; then
    combined_error+="trading_feed_failed;"
  fi
  if [ "$trading_exec_ok" -ne 1 ]; then
    combined_error+="trading_exec_failed;"
  fi
  if [ "$trading_route_ok" -ne 1 ]; then
    combined_error+="trading_route_failed;"
  fi
  if [ "$x402_agentcash_ok" -ne 1 ]; then
    combined_error+="x402_agentcash_failed;"
  fi
  if [ "$clawmart_staking_route_ok" -ne 1 ]; then
    combined_error+="clawmart_staking_route_failed;"
  fi
  if [ "$creator_fee_inflow_route_ok" -ne 1 ]; then
    combined_error+="creator_fee_inflow_route_failed;"
  fi
  if [ "$clawmart_monitor_ok" -ne 1 ]; then
    combined_error+="clawmart_monitor_failed;"
  fi
  if [ "$distribution_engine_ok" -ne 1 ]; then
    combined_error+="distribution_engine_failed;"
  fi
  if [ "$mission_control_ok" -ne 1 ]; then
    combined_error+="mission_control_failed;"
  fi
  if [ "$artifact_contracts_ok" -ne 1 ]; then
    combined_error+="artifact_contracts_failed;"
  fi
  cat >"$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":$prev_success_json,"lastErrorAt":"$NOW_ISO","lastError":"$combined_error","lastNightlyMissionDate":"$last_nightly_run_date","lastMemoryExtractDate":"$last_memory_extract_date"}
EOF
fi

learning_ok=1
learning_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kamiyo-agent-learnings.py" ]; then
  if "$HOME/bin/kamiyo-agent-learnings.py" --status "$status" --cycle "$next_cycles" --error "$combined_error" --at "$NOW_ISO" >"$TMP_DIR/learnings.json" 2>"$TMP_DIR/learnings.err"; then
    learning_summary="$(as_json_line "$TMP_DIR/learnings.json")"
  else
    learning_ok=0
    learning_err="$(tr -d '\n' <"$TMP_DIR/learnings.err" | sed 's/"/\\"/g')"
    learning_summary="{\"ok\":false,\"error\":\"$learning_err\"}"
  fi
else
  learning_summary='{"ok":false,"error":"missing_learnings_script"}'
  if is_true "$REQUIRE_LEARNINGS"; then
    learning_ok=0
  fi
fi

if [ "$status" = "ok" ] && [ "$learning_ok" -ne 1 ]; then
  status="degraded"
  combined_error+="learnings_failed;"
  cat >"$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":$prev_success_json,"lastErrorAt":"$NOW_ISO","lastError":"$combined_error","lastNightlyMissionDate":"$last_nightly_run_date","lastMemoryExtractDate":"$last_memory_extract_date"}
EOF
fi

memory_extract_ok=1
memory_extract_summary='{"ok":true,"status":"disabled"}'
if is_true "$ENABLE_MEMORY_EXTRACTION"; then
  if [ "$CURRENT_HOUR_UTC" = "$MEMORY_EXTRACTION_HOUR_UTC" ] && [ "$last_memory_extract_date" != "$TODAY" ]; then
    if [ -x "$HOME/bin/kamiyo-agent-memory-extract.py" ]; then
      if "$HOME/bin/kamiyo-agent-memory-extract.py" --date "$TODAY" >"$TMP_DIR/memory-extract.json" 2>"$TMP_DIR/memory-extract.err"; then
        memory_extract_summary="$(as_json_line "$TMP_DIR/memory-extract.json")"
        cat >"$MEMORY_EXTRACT_STATE_FILE" <<EOF
{"lastRunDate":"$TODAY","lastRunAt":"$NOW_ISO","cycle":$next_cycles}
EOF
        chmod 600 "$MEMORY_EXTRACT_STATE_FILE"
        last_memory_extract_date="$TODAY"
      else
        memory_extract_err="$(tr -d '\n' <"$TMP_DIR/memory-extract.err" | sed 's/"/\\"/g')"
        memory_extract_summary="{\"ok\":false,\"status\":\"failed\",\"error\":\"$memory_extract_err\"}"
        if is_true "$REQUIRE_MEMORY_EXTRACTION"; then
          memory_extract_ok=0
        fi
      fi
    else
      memory_extract_summary='{"ok":false,"status":"failed","error":"missing_memory_extract_script"}'
      if is_true "$REQUIRE_MEMORY_EXTRACTION"; then
        memory_extract_ok=0
      fi
    fi
  else
    memory_extract_summary="{\"ok\":true,\"status\":\"not_due\",\"lastRunDate\":\"$last_memory_extract_date\"}"
  fi
fi

if [ "$status" = "ok" ] && [ "$memory_extract_ok" -ne 1 ]; then
  status="degraded"
  combined_error+="memory_extract_failed;"
  cat >"$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":$prev_success_json,"lastErrorAt":"$NOW_ISO","lastError":"$combined_error","lastNightlyMissionDate":"$last_nightly_run_date","lastMemoryExtractDate":"$last_memory_extract_date"}
EOF
fi

operator_log_ok=1
operator_log_summary='{"ok":true,"status":"disabled"}'
if is_true "$ENABLE_OPERATOR_LOG"; then
  operator_log_summary='{"ok":false,"error":"not_run"}'
  if [ -x "$HOME/bin/kamiyo-agent-operator-log.py" ]; then
    if "$HOME/bin/kamiyo-agent-operator-log.py" --status "$status" --cycle "$next_cycles" --error "$combined_error" --at "$NOW_ISO" >"$TMP_DIR/operator-log.json" 2>"$TMP_DIR/operator-log.err"; then
      operator_log_summary="$(as_json_line "$TMP_DIR/operator-log.json")"
      operator_log_inner_ok="$(jq -r '.ok // true' "$TMP_DIR/operator-log.json" 2>/dev/null || echo true)"
      if is_true "$REQUIRE_OPERATOR_LOG"; then
        if [ "$operator_log_inner_ok" != "true" ]; then
          operator_log_ok=0
        fi
      fi
    else
      if [ -s "$TMP_DIR/operator-log.json" ]; then
        operator_log_summary="$(as_json_line "$TMP_DIR/operator-log.json")"
      else
        operator_log_err="$(tr -d '\n' <"$TMP_DIR/operator-log.err" | sed 's/"/\\"/g')"
        operator_log_summary="{\"ok\":false,\"error\":\"$operator_log_err\"}"
      fi
      if is_true "$REQUIRE_OPERATOR_LOG"; then
        operator_log_ok=0
      fi
    fi
  else
    operator_log_summary='{"ok":false,"error":"missing_operator_log"}'
    if is_true "$REQUIRE_OPERATOR_LOG"; then
      operator_log_ok=0
    fi
  fi
fi

if [ "$status" = "ok" ] && [ "$operator_log_ok" -ne 1 ]; then
  status="degraded"
  combined_error+="operator_log_failed;"
  cat >"$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":$prev_success_json,"lastErrorAt":"$NOW_ISO","lastError":"$combined_error","lastNightlyMissionDate":"$last_nightly_run_date","lastMemoryExtractDate":"$last_memory_extract_date"}
EOF
fi

if [ "$status" = "ok" ]; then
  cat >"$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":"$NOW_ISO","lastErrorAt":null,"lastError":null,"lastNightlyMissionDate":"$last_nightly_run_date","lastMemoryExtractDate":"$last_memory_extract_date"}
EOF
fi

printf '{"at":"%s","event":"autonomy_tick","status":"%s","cycle":%d,"durationMs":%d,"x402Feed":%s,"dxTerminalFeed":%s,"feedSync":%s,"gatewayOk":%d,"gateway":%s,"runtimeBridge":%s,"context":%s,"sentryPipeline":%s,"toolHealth":%s,"marketplace":%s,"receiptSync":%s,"governor":%s,"planner":%s,"revenueGuard":%s,"tradingFeed":%s,"tradingExec":%s,"tradingRoute":%s,"x402AgentCash":%s,"clawMartStakingRoute":%s,"creatorFeeInflowRoute":%s,"clawMartMonitor":%s,"distributionEngine":%s,"missionControl":%s,"artifactContracts":%s,"learning":%s,"memoryExtract":%s,"operatorLog":%s,"proactive":%s,"opportunities":%d,"assignments":%d,"agentOk":%d,"agentReply":"%s"}\n' \
  "$NOW_ISO" "$status" "$next_cycles" "$DURATION_MS" "$x402_feed_summary" "$dx_terminal_feed_summary" "$feed_sync_summary" "$gateway_ok" "$gateway_summary" "$runtime_bridge_summary" "$context_summary" "$sentry_pipeline_summary" "$tool_health_summary" "$marketplace_summary" "$receipt_sync_summary" "$governor_summary" "$planner_summary" "$revenue_guard_summary" "$trading_feed_summary" "$trading_exec_summary" "$trading_route_summary" "$x402_agentcash_summary" "$clawmart_staking_route_summary" "$creator_fee_inflow_route_summary" "$clawmart_monitor_summary" "$distribution_engine_summary" "$mission_control_summary" "$artifact_contracts_summary" "$learning_summary" "$memory_extract_summary" "$operator_log_summary" "$proactive_summary" "$opportunity_count" "$assignment_count" "$agent_ok" "$agent_reply" \
  >>"$LOG_FILE"

chmod 600 "$STATE_FILE" "$NIGHTLY_STATE_FILE" "$MEMORY_EXTRACT_STATE_FILE" "$LOG_FILE"
if [ "$status" = "ok" ]; then
  exit 0
fi
exit 1
