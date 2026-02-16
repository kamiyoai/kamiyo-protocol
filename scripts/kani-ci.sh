#!/bin/bash

set -euo pipefail

out_dir="${KANI_OUT_DIR:-kani-results}"
mkdir -p "${out_dir}"

log="${out_dir}/kani.log"
summary="${out_dir}/summary.md"

: >"${log}"

pkgs=("$@")
if [ "${#pkgs[@]}" -eq 0 ]; then
  pkgs=(kani-solana kamiyo hive kamiyo-staking)
fi

args=()
mode="default"
if [ "${KANI_FULL:-}" = "1" ]; then
  args=(--features kani-full)
  mode="full"
fi

sha="${GITHUB_SHA:-}"
if [ -z "${sha}" ]; then
  sha="$(git rev-parse HEAD 2>/dev/null || true)"
fi

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

kani_version="unknown"
if command -v kani >/dev/null 2>&1; then
  kani_version="$(kani --version 2>/dev/null || echo unknown)"
fi

rustc_version="unknown"
if command -v rustc >/dev/null 2>&1; then
  rustc_version="$(rustc --version 2>/dev/null || echo unknown)"
fi

cargo_version="unknown"
if command -v cargo >/dev/null 2>&1; then
  cargo_version="$(cargo --version 2>/dev/null || echo unknown)"
fi

{
  echo "# Kani verification summary"
  echo
  if [ -n "${sha}" ]; then
    echo "- commit: \`${sha}\`"
  fi
  echo "- mode: \`${mode}\`"
  echo "- started (UTC): \`${started}\`"
  echo "- kani: \`${kani_version}\`"
  echo "- rustc: \`${rustc_version}\`"
  echo "- cargo: \`${cargo_version}\`"
  echo
  echo "## Packages"
} >"${summary}"

for pkg in "${pkgs[@]}"; do
  pkg_log="${out_dir}/kani-${pkg}.log"
  : >"${pkg_log}"

  t0="$(date +%s)"
  {
    echo
    echo "[kani] ===== ${pkg} ====="
    if [ "${#args[@]}" -eq 0 ]; then
      echo "[kani] cargo kani -p ${pkg}"
    else
      echo "[kani] cargo kani -p ${pkg} ${args[*]}"
    fi
  } | tee -a "${log}" "${pkg_log}"

  if [ "${#args[@]}" -eq 0 ]; then
    cargo kani -p "${pkg}" 2>&1 | tee -a "${log}" "${pkg_log}"
  else
    cargo kani -p "${pkg}" "${args[@]}" 2>&1 | tee -a "${log}" "${pkg_log}"
  fi
  t1="$(date +%s)"
  echo "- \`${pkg}\`: ok ($((t1 - t0))s)" >>"${summary}"
done

finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo
  echo "- finished (UTC): \`${finished}\`"
  echo "- log: \`${log}\`"
} >>"${summary}"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  cat "${summary}" >>"${GITHUB_STEP_SUMMARY}"
fi
