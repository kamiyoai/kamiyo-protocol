#!/usr/bin/env bash
set -euo pipefail

SERVICE="${SERVICE:-kamiyo-kyoshin-exec.service}"
ENV_FILE="${ENV_FILE:-/etc/kamiyo/kyoshin-exec.env}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4020/health}"

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

log() {
  echo "[kyoshin-watchdog] $*"
}

restart_service() {
  log "restarting ${SERVICE}"
  systemctl restart "$SERVICE"
}

if [[ ! -f "$ENV_FILE" ]]; then
  log "missing env file: $ENV_FILE"
  exit 1
fi

if ! systemctl is-active --quiet "$SERVICE"; then
  log "service not active"
  restart_service
  exit 0
fi

db_path="$(get_kv KAMIYO_DB_PATH)"
main_pid="$(systemctl show -p MainPID --value "$SERVICE")"
declare -a pids=()
if [[ -n "$db_path" ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    pids+=("$pid")
  done < <(
    for proc_dir in /proc/[0-9]*; do
      pid="${proc_dir##*/}"
      [[ -r "$proc_dir/environ" ]] || continue
      if tr '\0' '\n' < "$proc_dir/environ" | grep -Fxq "KAMIYO_DB_PATH=${db_path}"; then
        echo "$pid"
      fi
    done | sort -n
  )
fi

if [[ "${#pids[@]}" -gt 1 ]]; then
  keep_pid=""
  if [[ -n "$main_pid" ]]; then
    for pid in "${pids[@]}"; do
      if [[ "$pid" == "$main_pid" ]]; then
        keep_pid="$pid"
        break
      fi
    done
  fi
  if [[ -z "$keep_pid" ]]; then
    keep_pid="${pids[0]}"
  fi

  declare -a kill_list=()
  for pid in "${pids[@]}"; do
    if [[ "$pid" != "$keep_pid" ]]; then
      kill_list+=("$pid")
    fi
  done

  if [[ "${#kill_list[@]}" -gt 0 ]]; then
    log "duplicate runtime processes detected for db=${db_path}; keeping pid=${keep_pid}; terminating: ${kill_list[*]}"
    for pid in "${kill_list[@]}"; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 2
    for pid in "${kill_list[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid" 2>/dev/null || true
      fi
    done
  fi
fi

token="$(get_kv KYOSHIN_HTTP_TOKEN)"
curl_args=(--fail --silent --show-error --max-time 10)
if [[ -n "$token" ]]; then
  curl_args+=(-H "authorization: Bearer ${token}")
fi

if ! curl "${curl_args[@]}" "$HEALTH_URL" >/dev/null; then
  log "health check failed: ${HEALTH_URL}"
  restart_service
  exit 0
fi

log "ok"
