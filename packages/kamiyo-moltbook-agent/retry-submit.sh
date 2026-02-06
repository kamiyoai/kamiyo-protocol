#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
while true; do
  output=$(npx tsx submit-final.ts 2>&1)
  echo "$output"
  if echo "$output" | grep -q "SUCCESS"; then
    echo "DONE!"
    exit 0
  fi
  echo "Retrying in 5 minutes..."
  sleep 300
done
