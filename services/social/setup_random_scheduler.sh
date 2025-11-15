#!/bin/bash
# Setup continuous random scheduler for AI agent quote tweeting
# This runs as a background service that posts twice daily at random times

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
SCRIPT_PATH="$PROJECT_DIR/social/random_scheduler.py"

# Check if script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: $SCRIPT_PATH not found"
    exit 1
fi

# Make script executable
chmod +x "$SCRIPT_PATH"

echo "Random AI Agent Quote Tweet Scheduler Setup"
echo "==========================================="
echo ""
echo "This scheduler posts twice daily at random times:"
echo "  - Morning window: 8 AM - 12 PM (random time)"
echo "  - Evening window: 4 PM - 10 PM (random time)"
echo ""
echo "To run the scheduler:"
echo "  1. As a foreground process (for testing):"
echo "     python3 $SCRIPT_PATH"
echo ""
echo "  2. As a background process:"
echo "     nohup python3 $SCRIPT_PATH > /tmp/kamiyo_scheduler.log 2>&1 &"
echo ""
echo "  3. As a systemd service (recommended for production):"
echo "     sudo cp social/kamiyo-scheduler.service /etc/systemd/system/"
echo "     sudo systemctl enable kamiyo-scheduler"
echo "     sudo systemctl start kamiyo-scheduler"
echo ""
echo "Logs will be written to:"
echo "  /tmp/kamiyo_ai_agent_poster.log (application log)"
echo ""
echo "To stop the background process:"
echo "  pkill -f random_scheduler.py"
echo ""
