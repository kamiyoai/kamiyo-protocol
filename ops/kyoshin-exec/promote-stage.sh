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

apply_stage_caps() {
  case "$1" in
    canary_0)
      set_kv "KAMIYO_SOL_DAILY_CAP" "0.005"
      set_kv "KAMIYO_SOL_PER_TX_CAP" "0.001"
      set_kv "KAMIYO_MAX_TX_PER_DAY" "1"
      ;;
    canary_1)
      set_kv "KAMIYO_SOL_DAILY_CAP" "0.02"
      set_kv "KAMIYO_SOL_PER_TX_CAP" "0.003"
      set_kv "KAMIYO_MAX_TX_PER_DAY" "4"
      ;;
    canary_2)
      set_kv "KAMIYO_SOL_DAILY_CAP" "0.05"
      set_kv "KAMIYO_SOL_PER_TX_CAP" "0.01"
      set_kv "KAMIYO_MAX_TX_PER_DAY" "10"
      set_kv "KAMIYO_AUTO_STAKE_AVAILABLE_BPS" "1000"
      set_kv "KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX" "25000000"
      ;;
    full)
      if [[ -z "$(get_kv KAMIYO_SOL_DAILY_CAP)" ]]; then
        set_kv "KAMIYO_SOL_DAILY_CAP" "0.05"
      fi
      if [[ -z "$(get_kv KAMIYO_SOL_PER_TX_CAP)" ]]; then
        set_kv "KAMIYO_SOL_PER_TX_CAP" "0.01"
      fi
      if [[ -z "$(get_kv KAMIYO_MAX_TX_PER_DAY)" ]]; then
        set_kv "KAMIYO_MAX_TX_PER_DAY" "10"
      fi
      ;;
  esac
}

validate_before_mutation() {
  local target_stage="$1"
  local target_hard_stop="$2"
  local stage_num
  local operator_path
  local operator_private
  local staking_pool
  local allowlist
  local require_allowlist

  if [[ "$target_hard_stop" == "true" ]]; then
    return
  fi

  operator_path="$(get_kv KAMIYO_OPERATOR_KEYPAIR_PATH)"
  operator_private="$(get_kv KAMIYO_OPERATOR_PRIVATE_KEY)"
  if [[ -z "$operator_path" && -z "$operator_private" ]]; then
    echo "blocked: hard-stop=false requires operator keypair (KAMIYO_OPERATOR_KEYPAIR_PATH or KAMIYO_OPERATOR_PRIVATE_KEY)" >&2
    exit 2
  fi
  if [[ -n "$operator_path" && ! -f "$operator_path" ]]; then
    echo "blocked: operator keypair path does not exist: $operator_path" >&2
    exit 2
  fi

  stage_num="$(stage_rank "$target_stage")"
  require_allowlist="$(get_kv KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST)"
  staking_pool="$(get_kv KAMIYO_STAKING_POOL)"
  allowlist="$(get_kv KAMIYO_ALLOWED_STAKING_POOLS)"

  if [[ "$stage_num" -ge 2 ]]; then
    if [[ -z "$staking_pool" ]]; then
      echo "blocked: stage $target_stage with hard-stop=false requires KAMIYO_STAKING_POOL" >&2
      exit 2
    fi
    if [[ "$require_allowlist" == "true" ]]; then
      if [[ -z "$allowlist" ]]; then
        echo "blocked: allowlist required but KAMIYO_ALLOWED_STAKING_POOLS is empty" >&2
        exit 2
      fi
      if [[ ",$allowlist," != *",$staking_pool,"* ]]; then
        echo "blocked: staking pool is not in KAMIYO_ALLOWED_STAKING_POOLS" >&2
        exit 2
      fi
    fi
  fi
}

[[ $# -ge 1 ]] || usage
stage="$1"
hard_stop="${2:-$(get_kv KAMIYO_EXECUTION_HARD_STOP)}"

case "$stage" in
  canary_0|canary_1|canary_2|full) ;;
  *) usage ;;
esac

case "$hard_stop" in
  true|false) ;;
  *) usage ;;
esac

validate_before_mutation "$stage" "$hard_stop"
set_kv "KAMIYO_EXECUTION_STAGE" "$stage"
set_kv "KAMIYO_EXECUTION_HARD_STOP" "$hard_stop"
apply_stage_caps "$stage"

systemctl daemon-reload
systemctl restart "$SERVICE"
sleep 2

systemctl --no-pager --full status "$SERVICE" | sed -n '1,25p'
echo "---- effective policy env ----"
grep -E '^(KAMIYO_EXECUTION_STAGE|KAMIYO_EXECUTION_HARD_STOP|KAMIYO_SOL_DAILY_CAP|KAMIYO_SOL_PER_TX_CAP|KAMIYO_MAX_TX_PER_DAY|KAMIYO_AUTO_STAKE_AVAILABLE_BPS|KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX)=' "$ENV_FILE"
