#!/usr/bin/env bash
set -euo pipefail
umask 077

if [ -z "${HOME:-}" ]; then
  HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
  export HOME
fi
export PATH="$HOME/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

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
  # shellcheck disable=SC1090
  source "$ENV_FILE"
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
LOG_FILE="$LOG_DIR/autonomy-loop.jsonl"
RAW_DIR="$LOG_DIR/raw"
mkdir -p "$RAW_DIR"
chmod 700 "$RAW_DIR"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"

LOCK_FILE="$STATE_DIR/autonomy-loop.lock"
exec 9>"$LOCK_FILE"

NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY="$(date -u +%Y-%m-%d)"
CURRENT_HOUR_UTC="$(date -u +%H)"
START_EPOCH="$(date +%s)"
AGENT_TIMEOUT_SECONDS="${KYO_AGENT_TIMEOUT_SECONDS:-120}"
PROACTIVE_TIMEOUT_SECONDS="${KYO_PROACTIVE_TIMEOUT_SECONDS:-180}"
HEARTBEAT_MAX_ASSIGNMENTS="${KYO_HEARTBEAT_MAX_ASSIGNMENTS:-3}"
REQUIRE_RUNTIME_GUARDS="${KYO_REQUIRE_RUNTIME_GUARDS:-true}"
ENABLE_PROACTIVE_NIGHTLY="${KYO_ENABLE_PROACTIVE_NIGHTLY:-true}"
PROACTIVE_HOUR_RAW="${KYO_PROACTIVE_HOUR_UTC:-2}"
REQUIRE_LEARNINGS="${KYO_REQUIRE_LEARNINGS:-true}"

if ! [[ "$PROACTIVE_HOUR_RAW" =~ ^[0-9]+$ ]] || [ "$PROACTIVE_HOUR_RAW" -lt 0 ] || [ "$PROACTIVE_HOUR_RAW" -gt 23 ]; then
  PROACTIVE_HOUR_RAW=2
fi
PROACTIVE_HOUR_UTC="$(printf '%02d' "$PROACTIVE_HOUR_RAW")"

if ! flock -n 9; then
  printf '{"at":"%s","event":"autonomy_tick","status":"skipped","reason":"lock_busy"}\n' "$NOW_ISO" >>"$LOG_FILE"
  exit 0
fi

TMP_DIR="$(mktemp -d "$STATE_DIR/tmp.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
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
  mission_statement='Operate Kyoshin as a 24/7 autonomous AI organization with auditable earnings and SOL routing.'
fi

cycles="$(jq -r '.cycles // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
if ! [[ "$cycles" =~ ^[0-9]+$ ]]; then
  cycles=0
fi
next_cycles=$((cycles + 1))
prev_success_json="$(jq -c '.lastSuccessAt // null' "$STATE_FILE" 2>/dev/null || echo null)"
last_nightly_run_date="$(jq -r '.lastRunDate // ""' "$NIGHTLY_STATE_FILE" 2>/dev/null || true)"

feed_sync_ok=1
feed_sync_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kyoshin-sync-feed-config.py" ]; then
  if "$HOME/bin/kyoshin-sync-feed-config.py" >"$TMP_DIR/feed-sync.json" 2>"$TMP_DIR/feed-sync.err"; then
    feed_sync_summary="$(as_json_line "$TMP_DIR/feed-sync.json")"
  else
    feed_sync_ok=0
    feed_sync_err="$(tr -d '\n' <"$TMP_DIR/feed-sync.err" | sed 's/"/\\"/g')"
    feed_sync_summary="{\"ok\":false,\"error\":\"$feed_sync_err\"}"
  fi
fi

gateway_ok=0
gateway_error=""
for _ in 1 2 3; do
  if openclaw gateway health --json >"$TMP_DIR/gateway-health.json" 2>"$TMP_DIR/gateway-health.err"; then
    gateway_ok=1
    break
  fi
  sleep 2
done
if [ "$gateway_ok" -ne 1 ] && [ -f "$TMP_DIR/gateway-health.err" ]; then
  gateway_error="$(tr -d '\n' <"$TMP_DIR/gateway-health.err" | sed 's/"/\\"/g')"
fi

context_ok=1
context_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kyoshin-context-guard.py" ]; then
  if "$HOME/bin/kyoshin-context-guard.py" >"$TMP_DIR/context-guard.json" 2>"$TMP_DIR/context-guard.err"; then
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

tool_health_ok=1
tool_health_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kyoshin-tool-health.py" ]; then
  if "$HOME/bin/kyoshin-tool-health.py" >"$TMP_DIR/tool-health.json" 2>"$TMP_DIR/tool-health.err"; then
    tool_health_summary="$(as_json_line "$TMP_DIR/tool-health.json")"
    critical_failures="$(jq -r '.criticalFailures | length // 0' "$TMP_DIR/tool-health.json" 2>/dev/null || echo 1)"
    if [ "$critical_failures" -gt 0 ]; then
      tool_health_ok=0
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
if "$HOME/bin/kyoshin-marketplace-intake.py" >"$TMP_DIR/marketplace-intake.json" 2>"$TMP_DIR/marketplace-intake.err"; then
  marketplace_summary="$(as_json_line "$TMP_DIR/marketplace-intake.json")"
else
  marketplace_ok=0
  intake_err="$(tr -d '\n' <"$TMP_DIR/marketplace-intake.err" | sed 's/"/\\"/g')"
  marketplace_summary="{\"ok\":false,\"error\":\"$intake_err\"}"
fi

governor_ok=1
governor_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kyoshin-swarm-governor.py" ]; then
  if "$HOME/bin/kyoshin-swarm-governor.py" >"$TMP_DIR/swarm-governor.json" 2>"$TMP_DIR/swarm-governor.err"; then
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
if "$HOME/bin/kyoshin-swarm-planner.py" >"$TMP_DIR/swarm-planner.json" 2>"$TMP_DIR/swarm-planner.err"; then
  planner_summary="$(as_json_line "$TMP_DIR/swarm-planner.json")"
else
  planner_ok=0
  planner_err="$(tr -d '\n' <"$TMP_DIR/swarm-planner.err" | sed 's/"/\\"/g')"
  planner_summary="{\"ok\":false,\"error\":\"$planner_err\"}"
fi

mission_control_ok=1
mission_control_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kyoshin-mission-control.py" ]; then
  if "$HOME/bin/kyoshin-mission-control.py" >"$TMP_DIR/mission-control.json" 2>"$TMP_DIR/mission-control.err"; then
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

assignment_count="$(jq -r '.assignments | length' "$QUEUE_DIR/assignments.json" 2>/dev/null || echo 0)"
opportunity_count="$(jq -r '.accepted // ((.opportunities // []) | length) // 0' "$FEEDS_DIR/opportunities.json" 2>/dev/null || echo 0)"

read -r -d '' HEARTBEAT_MSG <<'EOF' || true
Autonomy heartbeat run.

Execute one Kyoshin control-loop tick with the following rules:
- Read soul.md, identity.md, heartbeat.md, MISSION_STATEMENT.md, USER_PROFILE.md, GOALS.md, AMBITIONS.md, WORKING-MEMORY.md, .learnings/LEARNINGS.md and memory/TODAY.md.
- Read runtime/feeds/opportunities.json, runtime/queue/assignments.json and runtime/mission-control/board.json.
- Process up to HEARTBEAT_MAX assignments that are safe, compliant, and auditable.
- If credentials or external endpoints are missing, do not fake success. Record blockers and next concrete action.
- Update WORKING-MEMORY.md with current state, blockers, and next cycle priorities.
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

proactive_ok=1
proactive_summary='{"ok":true,"status":"not_due"}'
if is_true "$ENABLE_PROACTIVE_NIGHTLY"; then
  if [ "$CURRENT_HOUR_UTC" = "$PROACTIVE_HOUR_UTC" ] && [ "$last_nightly_run_date" != "$TODAY" ]; then
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
  && [ "$marketplace_ok" -eq 1 ] \
  && [ "$planner_ok" -eq 1 ] \
  && [ "$feed_sync_ok" -eq 1 ] \
  && [ "$gateway_ok" -eq 1 ] \
  && [ "$context_ok" -eq 1 ] \
  && [ "$tool_health_ok" -eq 1 ] \
  && [ "$governor_ok" -eq 1 ] \
  && [ "$mission_control_ok" -eq 1 ]; then
  cat >"$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":"$NOW_ISO","lastErrorAt":null,"lastError":null,"lastNightlyMissionDate":"$last_nightly_run_date"}
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
  if [ "$planner_ok" -ne 1 ]; then
    combined_error+="planner_failed;"
  fi
  if [ "$feed_sync_ok" -ne 1 ]; then
    combined_error+="feed_sync_failed;"
  fi
  if [ "$gateway_ok" -ne 1 ]; then
    combined_error+="gateway:${gateway_error:-health_check_failed};"
  fi
  if [ "$context_ok" -ne 1 ]; then
    combined_error+="context_incomplete;"
  fi
  if [ "$tool_health_ok" -ne 1 ]; then
    combined_error+="tool_health_failed;"
  fi
  if [ "$governor_ok" -ne 1 ]; then
    combined_error+="governor_failed;"
  fi
  if [ "$mission_control_ok" -ne 1 ]; then
    combined_error+="mission_control_failed;"
  fi
  cat >"$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":$prev_success_json,"lastErrorAt":"$NOW_ISO","lastError":"$combined_error","lastNightlyMissionDate":"$last_nightly_run_date"}
EOF
fi

learning_ok=1
learning_summary='{"ok":false,"error":"not_run"}'
if [ -x "$HOME/bin/kyoshin-learnings.py" ]; then
  if "$HOME/bin/kyoshin-learnings.py" --status "$status" --cycle "$next_cycles" --error "$combined_error" --at "$NOW_ISO" >"$TMP_DIR/learnings.json" 2>"$TMP_DIR/learnings.err"; then
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
{"cycles":$next_cycles,"lastSuccessAt":$prev_success_json,"lastErrorAt":"$NOW_ISO","lastError":"$combined_error","lastNightlyMissionDate":"$last_nightly_run_date"}
EOF
fi

printf '{"at":"%s","event":"autonomy_tick","status":"%s","cycle":%d,"durationMs":%d,"feedSync":%s,"gatewayOk":%d,"context":%s,"toolHealth":%s,"marketplace":%s,"governor":%s,"planner":%s,"missionControl":%s,"learning":%s,"proactive":%s,"opportunities":%d,"assignments":%d,"agentOk":%d,"agentReply":"%s"}\n' \
  "$NOW_ISO" "$status" "$next_cycles" "$DURATION_MS" "$feed_sync_summary" "$gateway_ok" "$context_summary" "$tool_health_summary" "$marketplace_summary" "$governor_summary" "$planner_summary" "$mission_control_summary" "$learning_summary" "$proactive_summary" "$opportunity_count" "$assignment_count" "$agent_ok" "$agent_reply" \
  >>"$LOG_FILE"

chmod 600 "$STATE_FILE" "$NIGHTLY_STATE_FILE" "$LOG_FILE"
if [ "$status" = "ok" ]; then
  exit 0
fi
exit 1
