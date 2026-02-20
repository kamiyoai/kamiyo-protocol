#!/usr/bin/env bash
set -euo pipefail

if [ -z "${HOME:-}" ]; then
  HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
  export HOME
fi
export PATH="$HOME/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

ENV_FILE="$HOME/.openclaw/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

RUNTIME_DIR="$HOME/.openclaw/workspace/runtime"
STATE_DIR="$RUNTIME_DIR/state"
LOG_DIR="$RUNTIME_DIR/logs"
QUEUE_DIR="$RUNTIME_DIR/queue"
FEEDS_DIR="$RUNTIME_DIR/feeds"
mkdir -p "$STATE_DIR" "$LOG_DIR" "$QUEUE_DIR" "$FEEDS_DIR"
chmod 700 "$RUNTIME_DIR" "$STATE_DIR" "$LOG_DIR" "$QUEUE_DIR" "$FEEDS_DIR"

STATE_FILE="$STATE_DIR/autonomy-loop-state.json"
LOG_FILE="$LOG_DIR/autonomy-loop.jsonl"
RAW_DIR="$LOG_DIR/raw"
mkdir -p "$RAW_DIR"
chmod 700 "$RAW_DIR"

NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY="$(date -u +%Y-%m-%d)"
START_EPOCH="$(date +%s)"

if [ ! -s "$STATE_FILE" ]; then
  cat > "$STATE_FILE" <<EOF
{"cycles":0,"lastSuccessAt":null,"lastErrorAt":null,"lastError":null}
EOF
fi

TODAY_MEMORY="$HOME/.openclaw/workspace/memory/${TODAY}.md"
if [ ! -f "$TODAY_MEMORY" ]; then
  printf '# %s\n' "$TODAY" > "$TODAY_MEMORY"
  chmod 600 "$TODAY_MEMORY"
fi

cycles="$(jq -r '.cycles // 0' "$STATE_FILE" 2>/dev/null || echo 0)"
if ! [[ "$cycles" =~ ^[0-9]+$ ]]; then
  cycles=0
fi
next_cycles=$((cycles + 1))

prev_success_json="$(jq -c '.lastSuccessAt // null' "$STATE_FILE" 2>/dev/null || echo null)"

gateway_ok=0
for _ in 1 2 3; do
  if openclaw gateway health --json >/tmp/kyoshin-gateway-health.json 2>/tmp/kyoshin-gateway-health.err; then
    gateway_ok=1
    break
  fi
  sleep 2
done

marketplace_ok=1
marketplace_summary='{"ok":false,"error":"not_run"}'
if "$HOME/bin/kyoshin-marketplace-intake.py" >/tmp/kyoshin-marketplace-intake.json 2>/tmp/kyoshin-marketplace-intake.err; then
  marketplace_summary="$(cat /tmp/kyoshin-marketplace-intake.json)"
else
  marketplace_ok=0
  intake_err="$(tr -d '\n' </tmp/kyoshin-marketplace-intake.err | sed 's/"/\\"/g')"
  marketplace_summary="{\"ok\":false,\"error\":\"$intake_err\"}"
fi

planner_ok=1
planner_summary='{"ok":false,"error":"not_run"}'
if "$HOME/bin/kyoshin-swarm-planner.py" >/tmp/kyoshin-swarm-planner.json 2>/tmp/kyoshin-swarm-planner.err; then
  planner_summary="$(cat /tmp/kyoshin-swarm-planner.json)"
else
  planner_ok=0
  planner_err="$(tr -d '\n' </tmp/kyoshin-swarm-planner.err | sed 's/"/\\"/g')"
  planner_summary="{\"ok\":false,\"error\":\"$planner_err\"}"
fi

assignment_count="$(jq -r '.assignments | length' "$QUEUE_DIR/assignments.json" 2>/dev/null || echo 0)"
opportunity_count="$(jq -r '.accepted // ((.opportunities // []) | length) // 0' "$FEEDS_DIR/opportunities.json" 2>/dev/null || echo 0)"

read -r -d '' HEARTBEAT_MSG <<'EOF' || true
Autonomy heartbeat run.

Execute one Kyoshin control-loop tick with the following rules:
- Read WORKING-MEMORY.md and memory/TODAY.md.
- Read runtime/feeds/opportunities.json and runtime/queue/assignments.json.
- Process up to 3 highest-value queued assignments that are safe and auditable.
- If credentials or external endpoints are missing, do not fake success. Record blockers and next concrete action.
- Update WORKING-MEMORY.md with current state, blockers, and next cycle priorities.
- Append one concise log line to memory/TODAY.md.
- Keep responses concise and factual.
- If no safe action exists, reply HEARTBEAT_OK with reason.
EOF

heartbeat_msg="${HEARTBEAT_MSG//TODAY/$TODAY}"
heartbeat_msg+=$'\n'
heartbeat_msg+="Context: opportunities=$opportunity_count assignments=$assignment_count cycle=$next_cycles timestamp=$NOW_ISO gateway_ok=$gateway_ok"

run_json_file="$RAW_DIR/agent-${TODAY}-${next_cycles}.json"
agent_ok=1
agent_reply=""
agent_error=""

if openclaw agent --agent main --local --message "$heartbeat_msg" --timeout 300 --json >"$run_json_file" 2>/tmp/kyoshin-agent.err; then
  agent_reply="$(jq -r '.payloads[0].text // ""' "$run_json_file" | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-1800)"
else
  agent_ok=0
  agent_error="$(tr -d '\n' </tmp/kyoshin-agent.err | sed 's/"/\\"/g')"
fi

if (( next_cycles % 12 == 0 )); then
  openclaw security audit --deep --json >"$RAW_DIR/security-audit-${TODAY}-${next_cycles}.json" 2>"$RAW_DIR/security-audit-${TODAY}-${next_cycles}.err" || true
fi

END_EPOCH="$(date +%s)"
DURATION_MS=$(((END_EPOCH - START_EPOCH) * 1000))

if [ "$agent_ok" -eq 1 ] && [ "$marketplace_ok" -eq 1 ] && [ "$planner_ok" -eq 1 ]; then
  cat > "$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":"$NOW_ISO","lastErrorAt":null,"lastError":null}
EOF
  status="ok"
else
  status="degraded"
  combined_error=""
  if [ "$agent_ok" -ne 1 ]; then
    combined_error+="agent:$agent_error;"
  fi
  if [ "$marketplace_ok" -ne 1 ]; then
    combined_error+="marketplace_failed;"
  fi
  if [ "$planner_ok" -ne 1 ]; then
    combined_error+="planner_failed;"
  fi
  cat > "$STATE_FILE" <<EOF
{"cycles":$next_cycles,"lastSuccessAt":$prev_success_json,"lastErrorAt":"$NOW_ISO","lastError":"$combined_error"}
EOF
fi

printf '{"at":"%s","event":"autonomy_tick","status":"%s","cycle":%d,"durationMs":%d,"gatewayOk":%d,"marketplace":%s,"planner":%s,"opportunities":%d,"assignments":%d,"agentOk":%d,"agentReply":"%s"}\n' \
  "$NOW_ISO" "$status" "$next_cycles" "$DURATION_MS" "$gateway_ok" "$marketplace_summary" "$planner_summary" "$opportunity_count" "$assignment_count" "$agent_ok" "$agent_reply" \
  >> "$LOG_FILE"

chmod 600 "$STATE_FILE" "$LOG_FILE"
if [ "$status" = "ok" ]; then
  exit 0
fi
exit 1
