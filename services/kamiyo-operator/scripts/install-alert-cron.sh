#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$SCRIPT_DIR/run-alert-check.sh"

if [ ! -x "$RUNNER" ]; then
  chmod +x "$RUNNER"
fi

JOB="*/5 * * * * $RUNNER"
CURRENT="$(crontab -l 2>/dev/null || true)"

if echo "$CURRENT" | grep -F "$RUNNER" >/dev/null; then
  echo "alert cron already installed"
  exit 0
fi

{
  echo "$CURRENT"
  echo "$JOB"
} | crontab -

echo "installed alert cron: $JOB"
