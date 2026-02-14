#!/bin/bash

set -euo pipefail

pkgs=("$@")
if [ "${#pkgs[@]}" -eq 0 ]; then
  pkgs=(kamiyo hive kamiyo-staking)
fi

args=()
if [ "${KANI_FULL:-}" = "1" ]; then
  args=(--features kani-full)
fi

for pkg in "${pkgs[@]}"; do
  echo "[kani] cargo kani -p ${pkg} ${args[*]}"
  cargo kani -p "${pkg}" "${args[@]}"
done
