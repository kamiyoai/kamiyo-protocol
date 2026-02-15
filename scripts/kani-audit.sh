#!/bin/bash

set -euo pipefail

log="${1:-}"
if [ -z "${log}" ]; then
  log="${KANI_OUT_DIR:-kani-results}/kani.log"
fi

audit_one() {
  local file="${1}"

  if [ ! -f "${file}" ]; then
    echo "[audit] missing kani log: ${file}" >&2
    return 2
  fi

  if grep -Eq 'VERIFICATION.*FAILED' "${file}"; then
    echo "[audit] ${file}: verification failures present" >&2
    return 1
  fi

  if ! grep -Eq 'VERIFICATION.*SUCCESSFUL' "${file}"; then
    echo "[audit] ${file}: no successful verification marker found" >&2
    return 1
  fi

  local cover_lines=""
  cover_lines="$(grep -E '\\*\\* [0-9]+ of [0-9]+ cover properties satisfied' "${file}" || true)"
  if [ -z "${cover_lines}" ]; then
    if [ "${KANI_EXPECT_COVERS:-}" = "1" ]; then
      echo "[audit] ${file}: expected cover properties, but none were reported" >&2
      return 1
    fi
    return 0
  fi

  local satisfied=""
  local total=""
  local unsatisfied=""
  read -r satisfied total unsatisfied <<<"$(
    printf '%s\n' "${cover_lines}" |
      awk '{s+=$2; t+=$4; if ($2 != $4) u+=($4-$2)} END {print s, t, u}'
  )"

  if [ "${KANI_EXPECT_COVERS:-}" = "1" ] && [ "${total:-0}" -eq 0 ]; then
    echo "[audit] ${file}: expected cover properties, but total is 0" >&2
    return 1
  fi

  if [ "${unsatisfied:-0}" -ne 0 ]; then
    echo "[audit] ${file}: cover properties not all satisfied: ${satisfied}/${total}" >&2
    return 1
  fi

  echo "[audit] ${file}: cover properties satisfied: ${satisfied}/${total}"
}

dir="$(dirname "${log}")"
shopt -s nullglob
pkg_logs=("${dir}"/kani-*.log)
shopt -u nullglob

logs_to_audit=("${log}")
if [ "${#pkg_logs[@]}" -gt 0 ] && { [ "${KANI_EXPECT_COVERS:-}" = "1" ] || [ "${KANI_AUDIT_PER_PACKAGE:-}" = "1" ]; }; then
  logs_to_audit=()
  for f in "${pkg_logs[@]}"; do
    if [ "$(basename "${f}")" = "kani.log" ]; then
      continue
    fi
    logs_to_audit+=("${f}")
  done
fi

if [ "${#logs_to_audit[@]}" -eq 0 ]; then
  echo "[audit] no per-package logs found; falling back to ${log}" >&2
  logs_to_audit=("${log}")
fi

for f in "${logs_to_audit[@]}"; do
  audit_one "${f}"
done
