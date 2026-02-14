#!/bin/bash

set -euo pipefail

log="${1:-}"
if [ -z "${log}" ]; then
  log="${KANI_OUT_DIR:-kani-results}/kani.log"
fi

if [ ! -f "${log}" ]; then
  echo "[audit] missing kani log: ${log}" >&2
  exit 2
fi

if ! grep -q 'VERIFICATION:- SUCCESSFUL' "${log}"; then
  echo "[audit] no successful verification marker found" >&2
  exit 1
fi

cover_lines="$(grep -E '\\*\\* [0-9]+ of [0-9]+ cover properties satisfied' "${log}" || true)"
if [ -z "${cover_lines}" ]; then
  if [ "${KANI_EXPECT_COVERS:-}" = "1" ]; then
    echo "[audit] expected cover properties, but none were reported" >&2
    exit 1
  fi
  exit 0
fi

read -r satisfied total unsatisfied <<<"$(
  printf '%s\n' "${cover_lines}" |
    awk '{s+=$2; t+=$4; if ($2 != $4) u+=($4-$2)} END {print s, t, u}'
)"

if [ "${KANI_EXPECT_COVERS:-}" = "1" ] && [ "${total:-0}" -eq 0 ]; then
  echo "[audit] expected cover properties, but total is 0" >&2
  exit 1
fi

if [ "${unsatisfied:-0}" -ne 0 ]; then
  echo "[audit] cover properties not all satisfied: ${satisfied}/${total}" >&2
  exit 1
fi

echo "[audit] cover properties satisfied: ${satisfied}/${total}"

