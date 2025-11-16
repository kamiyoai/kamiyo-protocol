#!/bin/bash
# Start Kamiyo Watcher as launchd service

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting Kamiyo Watcher service..."

# Copy plist to LaunchAgents
cp "$PROJECT_DIR/com.kamiyo.watcher.plist" ~/Library/LaunchAgents/

# Load the service
launchctl unload ~/Library/LaunchAgents/com.kamiyo.watcher.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.kamiyo.watcher.plist

echo "✅ Kamiyo Watcher started successfully"
echo ""
echo "Useful commands:"
echo "  View logs:     tail -f $PROJECT_DIR/logs/watcher.log"
echo "  View errors:   tail -f $PROJECT_DIR/logs/watcher.error.log"
echo "  Stop service:  launchctl unload ~/Library/LaunchAgents/com.kamiyo.watcher.plist"
echo "  Restart:       launchctl kickstart -k gui/$(id -u)/com.kamiyo.watcher"
echo "  Status:        launchctl list | grep kamiyo"
