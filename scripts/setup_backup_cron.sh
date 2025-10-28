#!/bin/bash
# Setup automated database backups via cron
# Backs up database daily at 3 AM

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
BACKUP_SCRIPT="$PROJECT_ROOT/scripts/backup_database.sh"

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Setting up KAMIYO Database Backup Automation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo -e "${RED}✗ Backup script not found at: $BACKUP_SCRIPT${NC}"
    exit 1
fi

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"
echo -e "${GREEN}✓ Made backup script executable${NC}"

# Create cron job entry
CRON_COMMAND="0 3 * * * cd $PROJECT_ROOT && $BACKUP_SCRIPT >> $PROJECT_ROOT/logs/backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo -e "${YELLOW}⚠ Cron job already exists${NC}"
    echo ""
    echo "Current backup cron jobs:"
    crontab -l | grep "$BACKUP_SCRIPT"
    echo ""
    read -p "Replace existing cron job? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    # Remove existing cron job
    crontab -l | grep -v "$BACKUP_SCRIPT" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_COMMAND") | crontab -

echo -e "${GREEN}✓ Cron job added successfully${NC}"
echo ""
echo "Backup Schedule:"
echo "  Time: 3:00 AM daily"
echo "  Command: $BACKUP_SCRIPT"
echo "  Log: $PROJECT_ROOT/logs/backup.log"
echo ""

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"
echo -e "${GREEN}✓ Created logs directory${NC}"

# Test backup script
echo ""
read -p "Run test backup now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    "$BACKUP_SCRIPT"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Backup automation configured!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To view cron jobs: crontab -l"
echo "To edit cron jobs: crontab -e"
echo "To view backup logs: tail -f logs/backup.log"
echo ""
