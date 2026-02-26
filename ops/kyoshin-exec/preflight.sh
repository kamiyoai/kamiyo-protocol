#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/etc/kamiyo/kyoshin-exec.env}"
STATUS_URL="${2:-http://127.0.0.1:4020/status}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE" >&2
  exit 1
fi

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

stage="$(get_kv KAMIYO_EXECUTION_STAGE)"
hard_stop="$(get_kv KAMIYO_EXECUTION_HARD_STOP)"
operator_path="$(get_kv KAMIYO_OPERATOR_KEYPAIR_PATH)"
operator_private="$(get_kv KAMIYO_OPERATOR_PRIVATE_KEY)"
staking_pool="$(get_kv KAMIYO_STAKING_POOL)"
allowlist="$(get_kv KAMIYO_ALLOWED_STAKING_POOLS)"
require_allowlist="$(get_kv KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST)"
http_token="$(get_kv KYOSHIN_HTTP_TOKEN)"

echo "stage=$stage"
echo "hard_stop=$hard_stop"
echo "operator_keypair_path_set=$([[ -n "$operator_path" ]] && echo yes || echo no)"
echo "operator_private_key_set=$([[ -n "$operator_private" ]] && echo yes || echo no)"
echo "staking_pool_set=$([[ -n "$staking_pool" ]] && echo yes || echo no)"
echo "allowlist_set=$([[ -n "$allowlist" ]] && echo yes || echo no)"
echo "require_allowlist=${require_allowlist:-unset}"

if [[ "$hard_stop" == "false" ]]; then
  if [[ -z "$operator_path" && -z "$operator_private" ]]; then
    echo "fail: hard-stop is false but no operator key configured" >&2
    exit 2
  fi
  if [[ -n "$operator_path" && ! -f "$operator_path" ]]; then
    echo "fail: operator keypair path does not exist: $operator_path" >&2
    exit 2
  fi
fi

if [[ "$hard_stop" == "false" && ( "$stage" == "canary_2" || "$stage" == "full" ) ]]; then
  if [[ -z "$staking_pool" ]]; then
    echo "fail: stage $stage requires KAMIYO_STAKING_POOL when hard-stop is false" >&2
    exit 2
  fi
  if [[ "$require_allowlist" == "true" ]]; then
    if [[ -z "$allowlist" ]]; then
      echo "fail: allowlist required but empty" >&2
      exit 2
    fi
    if [[ ",$allowlist," != *",$staking_pool,"* ]]; then
      echo "fail: staking pool not in allowlist" >&2
      exit 2
    fi
  fi
fi

if [[ -n "$http_token" ]]; then
  curl -sS --max-time 10 -H "authorization: Bearer ${http_token}" "$STATUS_URL" >/dev/null
  echo "http_status_check=ok"
else
  echo "http_status_check=skipped_no_token"
fi

echo "preflight=ok"
