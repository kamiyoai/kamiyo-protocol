#!/bin/bash
# KAMIYO Database Backup Script
# Backs up SQLite database to timestamped file with optional S3 upload
# Usage: ./scripts/backup_database.sh [--s3]

set -e

# Configuration
DB_PATH="${DATABASE_PATH:-data/kamiyo.db}"
BACKUP_DIR="${BACKUP_DIR:-backups/database}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/kamiyo_backup_${TIMESTAMP}.db"
LATEST_LINK="${BACKUP_DIR}/latest.db"

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
UPLOAD_S3=false
if [[ "$1" == "--s3" ]]; then
    UPLOAD_S3=true
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "KAMIYO Database Backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}✗ Database not found at: $DB_PATH${NC}"
    exit 1
fi

# Get database size
DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
echo -e "${YELLOW}Database:${NC} $DB_PATH ($DB_SIZE)"
echo -e "${YELLOW}Backup to:${NC} $BACKUP_FILE"
echo ""

# Create backup using SQLite backup command (hot backup)
echo "Creating backup..."
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Backup created successfully${NC} ($BACKUP_SIZE)"

    # Create symlink to latest backup
    ln -sf "$(basename "$BACKUP_FILE")" "$LATEST_LINK"
    echo -e "${GREEN}✓ Updated latest backup link${NC}"
else
    echo -e "${RED}✗ Backup failed${NC}"
    exit 1
fi

# Compress backup
echo ""
echo "Compressing backup..."
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"
COMPRESSED_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✓ Compressed${NC} ($COMPRESSED_SIZE)"

# Upload to S3 if requested
if [ "$UPLOAD_S3" = true ]; then
    echo ""
    echo "Uploading to S3..."

    if [ -z "$BACKUP_S3_BUCKET" ]; then
        echo -e "${RED}✗ BACKUP_S3_BUCKET not set in .env${NC}"
        exit 1
    fi

    S3_PATH="s3://${BACKUP_S3_BUCKET}/database/$(basename "$BACKUP_FILE")"

    if command -v aws &> /dev/null; then
        aws s3 cp "$BACKUP_FILE" "$S3_PATH" \
            --storage-class STANDARD_IA \
            --metadata "timestamp=${TIMESTAMP},database=kamiyo"

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Uploaded to S3:${NC} $S3_PATH"
        else
            echo -e "${RED}✗ S3 upload failed${NC}"
        fi
    else
        echo -e "${RED}✗ AWS CLI not installed${NC}"
    fi
fi

# Clean up old backups
echo ""
echo "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "kamiyo_backup_*.db.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo -e "${GREEN}✓ Deleted ${DELETED_COUNT} old backup(s)${NC}"

# Show backup statistics
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backup Statistics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "kamiyo_backup_*.db.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo -e "Total backups: ${GREEN}${TOTAL_BACKUPS}${NC}"
echo -e "Total size: ${GREEN}${TOTAL_SIZE}${NC}"
echo ""
echo -e "${GREEN}✓ Backup complete!${NC}"
echo ""
