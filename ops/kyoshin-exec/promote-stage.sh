#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=/etc/kamiyo/kyoshin-exec.env
SERVICE=kamiyo-kyoshin-exec.service

usage() {
  echo "usage: $0 <canary_0|canary_1|canary_2|full> [true|false]" >&2
  exit 1
}

set_kv() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >>"$ENV_FILE"
  fi
}

[[ $# -ge 1 ]] || usage
stage="$1"
hard_stop="${2:-}"

case "$stage" in
  canary_0|canary_1|canary_2|full) ;;
  *) usage ;;
esac

if [[ -n "$hard_stop" ]]; then
  case "$hard_stop" in
    true|false) ;;
    *) usage ;;
  esac
fi

set_kv "KAMIYO_EXECUTION_STAGE" "$stage"
if [[ -n "$hard_stop" ]]; then
  set_kv "KAMIYO_EXECUTION_HARD_STOP" "$hard_stop"
fi

systemctl daemon-reload
systemctl restart "$SERVICE"
sleep 2

systemctl --no-pager --full status "$SERVICE" | sed -n '1,25p'
echo "---- effective policy env ----"
grep -E '^(KAMIYO_EXECUTION_STAGE|KAMIYO_EXECUTION_HARD_STOP|KAMIYO_SOL_DAILY_CAP|KAMIYO_SOL_PER_TX_CAP|KAMIYO_MAX_TX_PER_DAY)=' "$ENV_FILE"
