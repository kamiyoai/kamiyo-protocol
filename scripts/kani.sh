#!/bin/bash

set -euo pipefail

pkgs=("$@")
if [ "${#pkgs[@]}" -eq 0 ]; then
  pkgs=(kamiyo hive kamiyo-staking)
fi

for pkg in "${pkgs[@]}"; do
  echo "[kani] cargo kani -p ${pkg}"
  cargo kani -p "${pkg}"
done

