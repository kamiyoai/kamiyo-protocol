#!/usr/bin/env bash
set -euo pipefail

LABEL="ai.kamiyo.operator"
UID_VALUE="$(id -u)"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -f "$PLIST_PATH" ]; then
  echo "not installed: $PLIST_PATH"
  exit 1
fi

echo "installed: $PLIST_PATH"
launchctl print "gui/$UID_VALUE/$LABEL"
