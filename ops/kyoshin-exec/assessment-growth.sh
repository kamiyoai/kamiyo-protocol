#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="__KAMIYO_APP_ROOT__"
MODE="${1:-auto}"
ENV_FILE="${ENV_FILE:-/etc/kamiyo/kyoshin-exec.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ "$MODE" != "auto" && "$MODE" != "bootstrap" && "$MODE" != "daily" ]]; then
  echo "invalid mode: $MODE (expected auto|bootstrap|daily)" >&2
  exit 1
fi

if [[ "${KYO_ASSESS_LIVE:-false}" != "true" ]]; then
  echo "KYO_ASSESS_LIVE must be true in $ENV_FILE before running live assessment growth" >&2
  exit 1
fi

if [[ -z "${KYO_ASSESS_STATE_PATH:-}" ]]; then
  state_dir="output/kyoshin-exec"
  if [[ -n "${KAMIYO_DB_PATH:-}" ]]; then
    state_dir="$(dirname "${KAMIYO_DB_PATH}")"
  fi
  export KYO_ASSESS_STATE_PATH="${state_dir}/assessment-growth-state.json"
fi

cd "$APP_ROOT"
if [[ "$MODE" == "auto" ]]; then
  exec corepack pnpm exec tsx scripts/kyoshin-assessment-growth.ts
fi

exec env KYO_ASSESS_MODE="$MODE" corepack pnpm exec tsx scripts/kyoshin-assessment-growth.ts
