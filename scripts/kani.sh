#!/bin/bash

set -euo pipefail

pkgs=("$@")
if [ "${#pkgs[@]}" -eq 0 ]; then
  pkgs=(kani-solana kamiyo hive kamiyo-staking)
fi

features=()
if [ "${KANI_FULL:-}" = "1" ]; then
  features+=(kani-full)
fi
if [ "${KANI_AGENT:-}" = "1" ]; then
  features+=(solana-agent)
fi

args=()
if [ "${#features[@]}" -gt 0 ]; then
  IFS=','
  args=(--features "${features[*]}")
  unset IFS
fi

for pkg in "${pkgs[@]}"; do
  echo "[kani] cargo kani -p ${pkg} ${args[*]:-}"
  cargo kani -p "${pkg}" ${args[@]+"${args[@]}"}
done
