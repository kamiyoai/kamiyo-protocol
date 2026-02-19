#!/usr/bin/env bash
set -euo pipefail

LABEL="ai.kamiyo.operator"
UID_VALUE="$(id -u)"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$UID_VALUE/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "uninstalled: $LABEL"
