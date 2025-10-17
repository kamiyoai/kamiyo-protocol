#!/bin/bash

# Kamiyo Database Backup Script
# Performs comprehensive database backup to S3/Spaces

set -e

# Load environment variables
if [ -f ".env.production" ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

# Configuration
BACKUP_DIR="/tmp/kamiyo_backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="kamiyo_backup_${TIMESTAMP}"
S3_BUCKET="${BACKUP_S3_BUCKET:-kamiyo-backups}"
S3_REGION="${BACKUP_S3_REGION:-us-east-1}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "=========================================="
echo "Kamiyo Database Backup"
echo "=========================================="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Backup Name: $BACKUP_NAME"
echo "S3 Bucket: $S3_BUCKET"
echo "=========================================="
echo ""

# ============================================
# 1. PostgreSQL Database Backup
# ============================================
log_info "Starting PostgreSQL backup..."

# Extract database credentials from DATABASE_URL
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\(.*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\(.*\)/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*\/\/\(.*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/.*:\(.*\)@.*/\1/p')

# Set password for pg_dump
export PGPASSWORD="$DB_PASS"

# Full database dump
DUMP_FILE="$BACKUP_DIR/${BACKUP_NAME}.sql"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --format=plain \
    --no-owner \
    --no-acl \
    --verbose \
    > "$DUMP_FILE" 2>&1

if [ $? -eq 0 ]; then
    log_info "PostgreSQL dump completed: $(du -h $DUMP_FILE | cut -f1)"
else
    log_error "PostgreSQL dump failed!"
fi

# Custom format backup (smaller, supports parallel restore)
CUSTOM_DUMP_FILE="$BACKUP_DIR/${BACKUP_NAME}.dump"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    --verbose \
    > "$CUSTOM_DUMP_FILE" 2>&1

if [ $? -eq 0 ]; then
    log_info "Custom format dump completed: $(du -h $CUSTOM_DUMP_FILE | cut -f1)"
fi

# ============================================
# 2. Schema-only Backup
# ============================================
log_info "Creating schema-only backup..."

SCHEMA_FILE="$BACKUP_DIR/${BACKUP_NAME}_schema.sql"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --schema-only \
    --no-owner \
    --no-acl \
    > "$SCHEMA_FILE" 2>&1

if [ $? -eq 0 ]; then
    log_info "Schema backup completed: $(du -h $SCHEMA_FILE | cut -f1)"
fi

# ============================================
# 3. Data-only Backup (for critical tables)
# ============================================
log_info "Creating data-only backup for critical tables..."

DATA_FILE="$BACKUP_DIR/${BACKUP_NAME}_data.sql"
CRITICAL_TABLES="users exploits subscriptions payments api_keys"

pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --data-only \
    --no-owner \
    --no-acl \
    $(for table in $CRITICAL_TABLES; do echo "-t $table"; done) \
    > "$DATA_FILE" 2>&1

if [ $? -eq 0 ]; then
    log_info "Data-only backup completed: $(du -h $DATA_FILE | cut -f1)"
fi

# Unset password
unset PGPASSWORD

# ============================================
# 4. Redis Cache Backup
# ============================================
log_info "Backing up Redis cache..."

REDIS_HOST=$(echo $REDIS_URL | sed -n 's/.*@\(.*\):.*/\1/p' || echo "localhost")
REDIS_PORT=$(echo $REDIS_URL | sed -n 's/.*:\([0-9]*\).*/\1/p' || echo "6379")

# Trigger Redis save
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGSAVE 2>/dev/null || log_warn "Redis backup skipped"

# ============================================
# 5. Configuration Backup
# ============================================
log_info "Backing up configuration files..."

CONFIG_DIR="$BACKUP_DIR/${BACKUP_NAME}_config"
mkdir -p "$CONFIG_DIR"

# Copy important configs (without secrets)
[ -f "docker-compose.production.yml" ] && cp docker-compose.production.yml "$CONFIG_DIR/"
[ -f ".env.production.template" ] && cp .env.production.template "$CONFIG_DIR/"
[ -f "nginx/nginx.conf" ] && cp nginx/nginx.conf "$CONFIG_DIR/"
[ -d "database/migrations" ] && cp -r database/migrations "$CONFIG_DIR/"

# Create manifest
cat > "$CONFIG_DIR/manifest.json" <<EOF
{
  "backup_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_name": "$BACKUP_NAME",
  "database": "$DB_NAME",
  "files_included": [
    "docker-compose.production.yml",
    ".env.production.template",
    "nginx.conf",
    "database/migrations"
  ]
}
EOF

log_info "Configuration backup completed"

# ============================================
# 6. Compress Backups
# ============================================
log_info "Compressing backups..."

cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" \
    "${BACKUP_NAME}.sql" \
    "${BACKUP_NAME}.dump" \
    "${BACKUP_NAME}_schema.sql" \
    "${BACKUP_NAME}_data.sql" \
    "${BACKUP_NAME}_config/"

ARCHIVE_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
log_info "Archive created: ${BACKUP_NAME}.tar.gz ($ARCHIVE_SIZE)"

# ============================================
# 7. Upload to S3/Spaces
# ============================================
log_info "Uploading to S3/Spaces..."

# Check if AWS CLI or s3cmd is available
if command -v aws &> /dev/null; then
    # Using AWS CLI
    aws s3 cp "${BACKUP_NAME}.tar.gz" \
        "s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz" \
        --region "$S3_REGION" \
        --storage-class STANDARD_IA

    if [ $? -eq 0 ]; then
        log_info "Backup uploaded to S3: s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz"

        # Upload metadata
        cat > "${BACKUP_NAME}_metadata.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "size": "$ARCHIVE_SIZE",
  "database": "$DB_NAME",
  "type": "full",
  "retention_days": $RETENTION_DAYS
}
EOF

        aws s3 cp "${BACKUP_NAME}_metadata.json" \
            "s3://${S3_BUCKET}/backups/${BACKUP_NAME}_metadata.json" \
            --region "$S3_REGION"
    else
        log_error "S3 upload failed!"
    fi

elif command -v s3cmd &> /dev/null; then
    # Using s3cmd
    s3cmd put "${BACKUP_NAME}.tar.gz" \
        "s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz"

    if [ $? -eq 0 ]; then
        log_info "Backup uploaded to S3: s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz"
    else
        log_error "S3 upload failed!"
    fi
else
    log_warn "Neither aws-cli nor s3cmd found. Backup saved locally only."
    log_warn "Local backup: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
fi

# ============================================
# 8. Cleanup Old Backups
# ============================================
log_info "Cleaning up old backups..."

# Remove local backups older than 7 days
find "$BACKUP_DIR" -name "kamiyo_backup_*.tar.gz" -mtime +7 -delete
LOCAL_CLEANED=$(find "$BACKUP_DIR" -name "kamiyo_backup_*.tar.gz" -mtime +7 | wc -l)
log_info "Removed $LOCAL_CLEANED old local backups"

# Remove S3 backups older than retention period
if command -v aws &> /dev/null; then
    CUTOFF_DATE=$(date -u -d "$RETENTION_DAYS days ago" +%Y-%m-%d 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%Y-%m-%d 2>/dev/null)

    aws s3 ls "s3://${S3_BUCKET}/backups/" --region "$S3_REGION" | \
    while read -r line; do
        FILE_DATE=$(echo $line | awk '{print $1}')
        FILE_NAME=$(echo $line | awk '{print $4}')

        if [[ "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
            aws s3 rm "s3://${S3_BUCKET}/backups/${FILE_NAME}" --region "$S3_REGION"
            log_info "Removed old S3 backup: $FILE_NAME"
        fi
    done
fi

# ============================================
# 9. Verify Backup Integrity
# ============================================
log_info "Verifying backup integrity..."

# Test archive integrity
if tar -tzf "${BACKUP_NAME}.tar.gz" > /dev/null 2>&1; then
    log_info "Backup archive integrity: OK"
else
    log_error "Backup archive is corrupted!"
fi

# Test SQL dump can be read
if head -n 1 "${BACKUP_NAME}.sql" | grep -q "PostgreSQL"; then
    log_info "SQL dump integrity: OK"
else
    log_warn "SQL dump may be corrupted"
fi

# ============================================
# 10. Notification
# ============================================
log_info "Sending backup notification..."

# Send notification (if configured)
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"✅ Kamiyo backup completed: $BACKUP_NAME ($ARCHIVE_SIZE)\"}" \
        > /dev/null 2>&1
fi

if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    curl -X POST "$DISCORD_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"content\":\"✅ Kamiyo backup completed: $BACKUP_NAME ($ARCHIVE_SIZE)\"}" \
        > /dev/null 2>&1
fi

# ============================================
# Summary
# ============================================
echo ""
echo "=========================================="
echo "Backup Summary"
echo "=========================================="
echo "Backup Name:    $BACKUP_NAME"
echo "Archive Size:   $ARCHIVE_SIZE"
echo "Location:       s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz"
echo "Local Copy:     $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
echo "Completed:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="
echo ""
echo -e "${GREEN}✅ BACKUP COMPLETED SUCCESSFULLY${NC}"
