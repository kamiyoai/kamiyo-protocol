#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
pnpm run show:trustlayer

echo
echo "Press Enter to close..."
read -r _
