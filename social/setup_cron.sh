#!/bin/bash
# Setup daily cron job for AI agent quote tweeting

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
SCRIPT_PATH="$PROJECT_DIR/social/run_daily.py"

# Check if script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: $SCRIPT_PATH not found"
    exit 1
fi

# Create cron jobs (runs twice daily at 10 AM and 6 PM)
CRON_CMD_MORNING="0 10 * * * cd $PROJECT_DIR && $SCRIPT_PATH >> /tmp/kamiyo_cron.log 2>&1"
CRON_CMD_EVENING="0 18 * * * cd $PROJECT_DIR && $SCRIPT_PATH >> /tmp/kamiyo_cron.log 2>&1"

# Check if cron jobs already exist
crontab -l 2>/dev/null | grep -q "$SCRIPT_PATH"
if [ $? -eq 0 ]; then
    echo "Cron jobs already exist"
    echo "Current cron jobs:"
    crontab -l | grep kamiyo
    exit 0
fi

# Add both cron jobs
(crontab -l 2>/dev/null; echo "$CRON_CMD_MORNING"; echo "$CRON_CMD_EVENING") | crontab -

echo "Cron jobs added successfully!"
echo "The AI agent quote tweet will run twice daily:"
echo "  - Morning: 10:00 AM"
echo "  - Evening: 6:00 PM"
echo ""
echo "To view cron jobs: crontab -l"
echo "To remove cron job: crontab -e (then delete the line)"
echo ""
echo "Logs will be written to:"
echo "  /tmp/kamiyo_ai_agent_poster.log (application log)"
echo "  /tmp/kamiyo_cron.log (cron execution log)"
