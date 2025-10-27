#!/bin/bash
# Stop Kamiyo Watcher service

echo "Stopping Kamiyo Watcher service..."

launchctl unload ~/Library/LaunchAgents/com.kamiyo.watcher.plist 2>/dev/null || true

echo "✅ Kamiyo Watcher stopped"
