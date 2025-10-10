#!/bin/bash
# scripts/backup-scheduler.sh
# Cron-based backup scheduler for automated daily backups

set -e

BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"  # Default: 2 AM daily

echo "📅 Kamiyo Backup Scheduler"
echo "=========================="
echo "Schedule: $BACKUP_SCHEDULE"
echo ""

# Create crontab entry
CRON_CMD="$BACKUP_SCHEDULE /scripts/backup-database.sh >> /var/log/backup.log 2>&1"

# Install cron job
echo "$CRON_CMD" | crontab -

echo "✅ Backup schedule installed"
echo ""
echo "Cron schedule format:"
echo "  Minute (0-59)"
echo "  Hour (0-23)"
echo "  Day of month (1-31)"
echo "  Month (1-12)"
echo "  Day of week (0-6, 0=Sunday)"
echo ""
echo "Examples:"
echo "  0 2 * * *     = Daily at 2:00 AM"
echo "  0 */6 * * *   = Every 6 hours"
echo "  0 2 * * 0     = Weekly on Sunday at 2:00 AM"
echo "  0 2 1 * *     = Monthly on 1st at 2:00 AM"
echo ""

# Start cron daemon
echo "Starting cron daemon..."
cron -f
