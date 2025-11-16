#!/bin/bash
# Check Kamiyo Watcher status

echo "Kamiyo Watcher Status:"
echo "====================="
echo ""

if launchctl list | grep -q com.kamiyo.watcher; then
    echo "✅ Service is RUNNING"
    echo ""
    launchctl list com.kamiyo.watcher
    echo ""
    echo "Recent logs:"
    echo "------------"
    tail -20 ~/Projekter/kamiyo/logs/watcher.log 2>/dev/null || echo "No logs yet"
else
    echo "❌ Service is NOT RUNNING"
    echo ""
    echo "Start with: ./scripts/start_watcher.sh"
fi
