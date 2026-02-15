#!/bin/bash

set -euo pipefail

pkgs=("$@")
if [ "${#pkgs[@]}" -eq 0 ]; then
  pkgs=(kani-solana kamiyo hive kamiyo-staking)
fi

for pkg in "${pkgs[@]}"; do
  features=()

  if [ "${pkg}" = "kani-solana" ]; then
    features+=(kani)
  fi

  if [ "${KANI_FULL:-}" = "1" ]; then
    features+=(kani-full)
  fi

  args=()
  if [ "${#features[@]}" -gt 0 ]; then
    args=(--features "$(IFS=,; echo "${features[*]}")")
  fi

  echo "[kani] cargo kani -p ${pkg} ${args[*]}"
  cargo kani -p "${pkg}" "${args[@]}"
done
