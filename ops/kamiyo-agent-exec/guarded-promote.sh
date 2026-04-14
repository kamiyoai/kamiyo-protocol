#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/kamiyo/kamiyo-agent-exec.env}"
PROMOTE_BIN="${PROMOTE_BIN:-/usr/local/bin/kamiyo-agent-exec-stage}"
PREFLIGHT_BIN="${PREFLIGHT_BIN:-/usr/local/bin/kamiyo-agent-exec-preflight}"

usage() {
  echo "usage: $0 <canary_0|canary_1|canary_2|full> [true|false]" >&2
  echo "       $0 --gate-check" >&2
  exit 1
}

get_kv() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#*=}"
}

stage_rank() {
  case "$1" in
    canary_0) echo 0 ;;
    canary_1) echo 1 ;;
    canary_2) echo 2 ;;
    full) echo 3 ;;
    *) return 1 ;;
  esac
}

gate_summary_from_economics() {
  local economics_json="$1"
  local min_settled="$2"
  local min_executed="$3"
  local min_net_sol="$4"
  local max_pending="$5"
  ECONOMICS_JSON="$economics_json" python3 - "$min_settled" "$min_executed" "$min_net_sol" "$max_pending" <<'PY'
import json
import os
import sys

min_settled = int(float(sys.argv[1]))
min_executed = int(float(sys.argv[2]))
min_net_sol = float(sys.argv[3])
max_pending = int(float(sys.argv[4]))
raw = os.environ.get("ECONOMICS_JSON", "").strip()
if not raw:
    raise ValueError("missing economics payload")
data = json.loads(raw)

lane_rows = ((data.get("laneSummary") or {}).get("byLaneAndKind") or [])
settled_jobs = 0
for row in lane_rows:
    if not isinstance(row, dict):
        continue
    if str(row.get("kind") or "") != "job":
        continue
    events = int(row.get("events") or 0)
    settled_jobs += max(0, events)

revenue = data.get("revenue") or {}
net_sol = float(revenue.get("netSol") or 0.0)
intake = data.get("intake") or {}
pending = int(intake.get("pending") or 0)
jobs = data.get("jobs") or {}
executed_jobs = int(jobs.get("executed") or 0)

checks = {
    "min_settled_jobs": settled_jobs >= min_settled,
    "min_executed_jobs": executed_jobs >= min_executed,
    "min_net_sol": net_sol >= min_net_sol,
    "max_pending_intake": pending <= max_pending,
}
ok = all(checks.values())
summary = {
    "ok": ok,
    "settled_jobs": settled_jobs,
    "executed_jobs": executed_jobs,
    "net_sol": net_sol,
    "pending_intake": pending,
    "checks": checks,
    "thresholds": {
        "min_settled_jobs": min_settled,
        "min_executed_jobs": min_executed,
        "min_net_sol": min_net_sol,
        "max_pending_intake": max_pending,
    },
}
print(json.dumps(summary))
sys.exit(0 if ok else 2)
PY
}

evaluate_gates() {
  local host port token economics_url
  host="$(get_kv KAMIYO_AGENT_HTTP_HOST)"
  port="$(get_kv KAMIYO_AGENT_HTTP_PORT)"
  token="$(get_kv KAMIYO_AGENT_HTTP_TOKEN)"

  if [[ -z "$host" ]]; then host="127.0.0.1"; fi
  if [[ -z "$port" ]]; then port="4020"; fi
  economics_url="http://${host}:${port}/economics"

  local min_settled min_executed min_net_sol max_pending economics summary
  min_settled="${KAMIYO_CANARY_GATE_MIN_SETTLED_JOBS:-$(get_kv KAMIYO_CANARY_GATE_MIN_SETTLED_JOBS)}"
  min_executed="${KAMIYO_CANARY_GATE_MIN_EXECUTED_JOBS:-$(get_kv KAMIYO_CANARY_GATE_MIN_EXECUTED_JOBS)}"
  min_net_sol="${KAMIYO_CANARY_GATE_MIN_NET_SOL:-$(get_kv KAMIYO_CANARY_GATE_MIN_NET_SOL)}"
  max_pending="${KAMIYO_CANARY_GATE_MAX_PENDING_INTAKE:-$(get_kv KAMIYO_CANARY_GATE_MAX_PENDING_INTAKE)}"
  if [[ -z "$min_settled" ]]; then min_settled="1"; fi
  if [[ -z "$min_executed" ]]; then min_executed="1"; fi
  if [[ -z "$min_net_sol" ]]; then min_net_sol="0"; fi
  if [[ -z "$max_pending" ]]; then max_pending="200"; fi

  if [[ -n "$token" ]]; then
    economics="$(curl -fsS --max-time 12 -H "authorization: Bearer ${token}" "$economics_url")"
  else
    economics="$(curl -fsS --max-time 12 "$economics_url")"
  fi

  if ! summary="$(gate_summary_from_economics "$economics" "$min_settled" "$min_executed" "$min_net_sol" "$max_pending")"; then
    echo "$summary"
    return 2
  fi
  echo "$summary"
  return 0
}

if [[ $# -ge 1 && "$1" == "--gate-check" ]]; then
  if evaluate_gates; then
    exit 0
  fi
  exit 2
fi

[[ $# -ge 1 ]] || usage
target_stage="$1"
target_hard_stop="${2:-$(get_kv KAMIYO_EXECUTION_HARD_STOP)}"
current_stage="$(get_kv KAMIYO_EXECUTION_STAGE)"
current_hard_stop="$(get_kv KAMIYO_EXECUTION_HARD_STOP)"

case "$target_stage" in
  canary_0|canary_1|canary_2|full) ;;
  *) usage ;;
esac
case "$target_hard_stop" in
  true|false) ;;
  *) usage ;;
esac
case "$current_stage" in
  canary_0|canary_1|canary_2|full) ;;
  *) echo "invalid current stage in env: $current_stage" >&2; exit 1 ;;
esac
case "$current_hard_stop" in
  true|false) ;;
  *) echo "invalid current hard stop in env: $current_hard_stop" >&2; exit 1 ;;
esac

if [[ "$target_hard_stop" == "false" ]]; then
  "$PREFLIGHT_BIN" "$ENV_FILE" >/dev/null
fi

target_rank="$(stage_rank "$target_stage")"
current_rank="$(stage_rank "$current_stage")"
if [[ "$target_rank" -gt "$current_rank" && "$target_hard_stop" == "false" ]]; then
  echo "pre-promotion canary gate check"
  if ! evaluate_gates; then
    echo "blocked: canary gate check failed before promotion" >&2
    exit 2
  fi
fi

"$PROMOTE_BIN" "$target_stage" "$target_hard_stop"

grace_seconds="${KAMIYO_CANARY_GATE_GRACE_SECONDS:-$(get_kv KAMIYO_CANARY_GATE_GRACE_SECONDS)}"
if [[ -z "$grace_seconds" ]]; then grace_seconds="900"; fi
if ! [[ "$grace_seconds" =~ ^[0-9]+$ ]]; then grace_seconds="900"; fi

if [[ "$target_rank" -gt "$current_rank" && "$target_hard_stop" == "false" && "$grace_seconds" -gt 0 ]]; then
  echo "post-promotion canary gate check in ${grace_seconds}s"
  sleep "$grace_seconds"
  if ! evaluate_gates; then
    echo "gate failed after promotion, rolling back to ${current_stage}/${current_hard_stop}" >&2
    "$PROMOTE_BIN" "$current_stage" "$current_hard_stop"
    exit 3
  fi
fi

echo "guarded promotion complete: ${target_stage}/${target_hard_stop}"
