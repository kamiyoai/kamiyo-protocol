#!/bin/bash

# Kamiyo Backup Scheduler
# Sets up automated daily backups using cron

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

echo "=========================================="
echo "Kamiyo Backup Scheduler Setup"
echo "=========================================="
echo ""

# Get the absolute path to the backup script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKUP_SCRIPT="$SCRIPT_DIR/backup_database.sh"

if [ ! -f "$BACKUP_SCRIPT" ]; then
    log_error "Backup script not found: $BACKUP_SCRIPT"
fi

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# ============================================
# 1. Configure Backup Schedule
# ============================================

echo "Select backup schedule:"
echo "  1) Daily at 2:00 AM (recommended)"
echo "  2) Daily at custom time"
echo "  3) Every 6 hours"
echo "  4) Every 12 hours"
echo "  5) Custom cron expression"
read -p "Choice [1-5]: " SCHEDULE_CHOICE

case $SCHEDULE_CHOICE in
    1)
        CRON_SCHEDULE="0 2 * * *"
        DESCRIPTION="Daily at 2:00 AM"
        ;;
    2)
        read -p "Enter hour (0-23): " HOUR
        read -p "Enter minute (0-59): " MINUTE
        CRON_SCHEDULE="$MINUTE $HOUR * * *"
        DESCRIPTION="Daily at $HOUR:$MINUTE"
        ;;
    3)
        CRON_SCHEDULE="0 */6 * * *"
        DESCRIPTION="Every 6 hours"
        ;;
    4)
        CRON_SCHEDULE="0 */12 * * *"
        DESCRIPTION="Every 12 hours"
        ;;
    5)
        read -p "Enter cron expression: " CRON_SCHEDULE
        DESCRIPTION="Custom: $CRON_SCHEDULE"
        ;;
    *)
        log_error "Invalid choice"
        ;;
esac

# ============================================
# 2. Configure Log Rotation
# ============================================

LOG_DIR="/var/log/kamiyo"
LOG_FILE="$LOG_DIR/backup.log"

# Create log directory
sudo mkdir -p "$LOG_DIR"
sudo chown $USER:$USER "$LOG_DIR"

# Setup logrotate
log_info "Setting up log rotation..."
sudo tee /etc/logrotate.d/kamiyo-backup > /dev/null <<EOF
$LOG_FILE {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 $USER $USER
    sharedscripts
    postrotate
        # Optionally restart services
    endscript
}
EOF

log_info "Log rotation configured: $LOG_FILE"

# ============================================
# 3. Add Cron Job
# ============================================

log_info "Adding cron job..."

# Create cron entry
CRON_ENTRY="$CRON_SCHEDULE $BACKUP_SCRIPT >> $LOG_FILE 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    log_warn "Cron job already exists. Removing old entry..."
    crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

log_info "Cron job added: $DESCRIPTION"

# ============================================
# 4. Setup Monitoring
# ============================================

log_info "Setting up backup monitoring..."

# Create monitoring script
MONITOR_SCRIPT="$SCRIPT_DIR/monitor_backups.sh"

cat > "$MONITOR_SCRIPT" <<'EOF'
#!/bin/bash

# Kamiyo Backup Monitor
# Checks if backups are running successfully

set -e

# Configuration
S3_BUCKET="${BACKUP_S3_BUCKET:-kamiyo-backups}"
S3_REGION="${BACKUP_S3_REGION:-us-east-1}"
ALERT_THRESHOLD_HOURS=26  # Alert if no backup in 26 hours (for daily backups)

# Get latest backup timestamp
if command -v aws &> /dev/null; then
    LATEST_BACKUP=$(aws s3 ls "s3://${S3_BUCKET}/backups/" --region "$S3_REGION" | \
        grep "kamiyo_backup_.*\.tar\.gz" | \
        sort -r | \
        head -1 | \
        awk '{print $1, $2}')

    if [ -z "$LATEST_BACKUP" ]; then
        echo "ERROR: No backups found in S3"
        exit 1
    fi

    BACKUP_DATE=$(echo "$LATEST_BACKUP" | awk '{print $1}')
    BACKUP_TIME=$(echo "$LATEST_BACKUP" | awk '{print $2}')
    BACKUP_TIMESTAMP="$BACKUP_DATE $BACKUP_TIME"

    # Calculate age in hours
    BACKUP_EPOCH=$(date -d "$BACKUP_TIMESTAMP" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$BACKUP_TIMESTAMP" +%s 2>/dev/null)
    CURRENT_EPOCH=$(date +%s)
    AGE_HOURS=$(( ($CURRENT_EPOCH - $BACKUP_EPOCH) / 3600 ))

    echo "Latest backup: $BACKUP_TIMESTAMP ($AGE_HOURS hours ago)"

    if [ $AGE_HOURS -gt $ALERT_THRESHOLD_HOURS ]; then
        echo "WARNING: Backup is older than $ALERT_THRESHOLD_HOURS hours!"

        # Send alert (if configured)
        if [ -n "$SLACK_WEBHOOK_URL" ]; then
            curl -X POST "$SLACK_WEBHOOK_URL" \
                -H 'Content-Type: application/json' \
                -d "{\"text\":\"⚠️ Kamiyo backup is $AGE_HOURS hours old!\"}" \
                > /dev/null 2>&1
        fi

        exit 1
    else
        echo "Backup status: OK"
        exit 0
    fi
else
    echo "WARNING: AWS CLI not installed, cannot monitor S3 backups"
    exit 0
fi
EOF

chmod +x "$MONITOR_SCRIPT"

# Add monitoring to cron (run every hour)
MONITOR_CRON="0 * * * * $MONITOR_SCRIPT >> $LOG_DIR/backup_monitor.log 2>&1"

if ! crontab -l 2>/dev/null | grep -q "$MONITOR_SCRIPT"; then
    (crontab -l 2>/dev/null; echo "$MONITOR_CRON") | crontab -
    log_info "Backup monitoring enabled (hourly checks)"
fi

# ============================================
# 5. Setup Alerts
# ============================================

log_info "Setting up backup alerts..."

# Create alert script
ALERT_SCRIPT="$SCRIPT_DIR/backup_alert.sh"

cat > "$ALERT_SCRIPT" <<'EOF'
#!/bin/bash

# Kamiyo Backup Alert Script
# Sends notifications about backup status

BACKUP_NAME="$1"
STATUS="$2"  # success or failure
MESSAGE="$3"

# Slack notification
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    if [ "$STATUS" == "success" ]; then
        EMOJI="✅"
        COLOR="good"
    else
        EMOJI="❌"
        COLOR="danger"
    fi

    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"attachments\": [{
                \"color\": \"$COLOR\",
                \"title\": \"$EMOJI Kamiyo Backup $STATUS\",
                \"text\": \"$MESSAGE\",
                \"fields\": [
                    {\"title\": \"Backup\", \"value\": \"$BACKUP_NAME\", \"short\": true},
                    {\"title\": \"Time\", \"value\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"short\": true}
                ]
            }]
        }" > /dev/null 2>&1
fi

# Discord notification
if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    if [ "$STATUS" == "success" ]; then
        EMOJI="✅"
    else
        EMOJI="❌"
    fi

    curl -X POST "$DISCORD_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"embeds\": [{
                \"title\": \"$EMOJI Kamiyo Backup $STATUS\",
                \"description\": \"$MESSAGE\",
                \"fields\": [
                    {\"name\": \"Backup\", \"value\": \"$BACKUP_NAME\", \"inline\": true},
                    {\"name\": \"Time\", \"value\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"inline\": true}
                ]
            }]
        }" > /dev/null 2>&1
fi

# Email notification (if configured)
if [ -n "$BACKUP_ALERT_EMAIL" ] && command -v mail &> /dev/null; then
    echo "$MESSAGE" | mail -s "Kamiyo Backup $STATUS: $BACKUP_NAME" "$BACKUP_ALERT_EMAIL"
fi
EOF

chmod +x "$ALERT_SCRIPT"

# ============================================
# 6. Test Backup
# ============================================

echo ""
read -p "Run test backup now? (yes/no): " RUN_TEST

if [ "$RUN_TEST" == "yes" ]; then
    log_info "Running test backup..."
    $BACKUP_SCRIPT
    log_info "Test backup completed"
fi

# ============================================
# Summary
# ============================================

echo ""
echo "=========================================="
echo "Backup Scheduler Setup Complete"
echo "=========================================="
echo "Schedule:         $DESCRIPTION"
echo "Cron Expression:  $CRON_SCHEDULE"
echo "Backup Script:    $BACKUP_SCRIPT"
echo "Log File:         $LOG_FILE"
echo "Monitor Script:   $MONITOR_SCRIPT"
echo "Alert Script:     $ALERT_SCRIPT"
echo "=========================================="
echo ""
echo "View scheduled backups:"
echo "  crontab -l | grep backup"
echo ""
echo "View backup logs:"
echo "  tail -f $LOG_FILE"
echo ""
echo "Manual backup:"
echo "  $BACKUP_SCRIPT"
echo ""
echo -e "${GREEN}✅ BACKUP SCHEDULER CONFIGURED${NC}"
