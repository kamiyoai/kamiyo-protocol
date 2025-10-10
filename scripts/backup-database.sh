#!/bin/bash
# scripts/backup-database.sh
# Automated PostgreSQL database backup with compression and rotation

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_NAME="${POSTGRES_DB:-kamiyo_exploits}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATE=$(date +"%Y-%m-%d")
BACKUP_FILE="${BACKUP_DIR}/kamiyo_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

echo "🗄️  Kamiyo Database Backup"
echo "=========================="
echo "Date: $DATE $TIMESTAMP"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

# Perform backup
echo "Creating backup..."
if command -v pg_dump &> /dev/null; then
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -F c \
        -f "$BACKUP_FILE" \
        --verbose \
        2>&1 | tail -5

    echo "✅ Backup created: $BACKUP_FILE"
else
    echo "❌ Error: pg_dump not found"
    exit 1
fi

# Compress backup
echo "Compressing backup..."
gzip "$BACKUP_FILE"
BACKUP_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
echo "✅ Compressed: $COMPRESSED_FILE ($BACKUP_SIZE)"

# Create symlink to latest backup
ln -sf "$COMPRESSED_FILE" "${BACKUP_DIR}/latest.sql.gz"
echo "✅ Latest backup symlink updated"

# Upload to S3 if configured
if [ ! -z "$AWS_S3_BUCKET" ]; then
    echo ""
    echo "Uploading to S3..."

    if command -v aws &> /dev/null; then
        S3_PATH="s3://${AWS_S3_BUCKET}/backups/${DATE}/kamiyo_${TIMESTAMP}.sql.gz"

        aws s3 cp "$COMPRESSED_FILE" "$S3_PATH" --storage-class STANDARD_IA

        echo "✅ Uploaded to: $S3_PATH"
    else
        echo "⚠️  Warning: aws CLI not found, skipping S3 upload"
    fi
fi

# Cleanup old backups
echo ""
echo "Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "kamiyo_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
REMAINING=$(find "$BACKUP_DIR" -name "kamiyo_*.sql.gz" -type f | wc -l)
echo "✅ Cleanup complete. $REMAINING backups remaining."

# Summary
echo ""
echo "=========================="
echo "✅ Backup complete!"
echo "   File: $COMPRESSED_FILE"
echo "   Size: $BACKUP_SIZE"
echo "   Retention: $RETENTION_DAYS days"

if [ ! -z "$AWS_S3_BUCKET" ]; then
    echo "   S3: $S3_PATH"
fi

echo ""
