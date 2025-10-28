#!/bin/bash
# Setup daily cron job for AI agent quote tweeting

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
SCRIPT_PATH="$PROJECT_DIR/social/run_daily.py"

# Check if script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: $SCRIPT_PATH not found"
    exit 1
fi

# Create cron job (runs daily at 10 AM)
CRON_CMD="0 10 * * * cd $PROJECT_DIR && $SCRIPT_PATH >> /tmp/kamiyo_cron.log 2>&1"

# Check if cron job already exists
crontab -l 2>/dev/null | grep -q "$SCRIPT_PATH"
if [ $? -eq 0 ]; then
    echo "Cron job already exists"
    echo "Current cron jobs:"
    crontab -l | grep kamiyo
    exit 0
fi

# Add cron job
(crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -

echo "Cron job added successfully!"
echo "The AI agent quote tweet will run daily at 10:00 AM"
echo ""
echo "To view cron jobs: crontab -l"
echo "To remove cron job: crontab -e (then delete the line)"
echo ""
echo "Logs will be written to:"
echo "  /tmp/kamiyo_ai_agent_poster.log (application log)"
echo "  /tmp/kamiyo_cron.log (cron execution log)"
