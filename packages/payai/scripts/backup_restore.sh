#!/bin/bash

# Kamiyo Database Restore Script
# Restores database from S3/local backup

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_question() {
    echo -e "${BLUE}[?]${NC} $1"
}

# Load environment variables
if [ -f ".env.production" ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

# Configuration
RESTORE_DIR="/tmp/kamiyo_restore"
S3_BUCKET="${BACKUP_S3_BUCKET:-kamiyo-backups}"
S3_REGION="${BACKUP_S3_REGION:-us-east-1}"

echo "=========================================="
echo "Kamiyo Database Restore"
echo "=========================================="
echo ""

# ============================================
# 1. Select Backup to Restore
# ============================================

if [ -z "$1" ]; then
    log_info "Available backups:"
    echo ""

    # List S3 backups
    if command -v aws &> /dev/null; then
        log_info "S3 Backups:"
        aws s3 ls "s3://${S3_BUCKET}/backups/" --region "$S3_REGION" | grep "kamiyo_backup_.*\.tar\.gz" | nl
        echo ""
    fi

    # List local backups
    if [ -d "/tmp/kamiyo_backups" ]; then
        log_info "Local Backups:"
        ls -lh /tmp/kamiyo_backups/*.tar.gz 2>/dev/null | awk '{print $9, "("$5")"}' | nl || echo "  No local backups found"
        echo ""
    fi

    log_question "Enter backup name or S3 path:"
    read BACKUP_NAME

    if [ -z "$BACKUP_NAME" ]; then
        log_error "No backup specified"
    fi
else
    BACKUP_NAME="$1"
fi

echo ""
echo -e "${RED}=========================================="
echo "⚠️  WARNING: DATABASE RESTORE"
echo "==========================================${NC}"
echo "This will OVERWRITE the current database!"
echo "Database: $DB_NAME"
echo "Backup: $BACKUP_NAME"
echo ""
log_question "Are you sure you want to continue? (yes/no)"
read CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log_error "Restore cancelled by user"
fi

# ============================================
# 2. Download Backup from S3
# ============================================

mkdir -p "$RESTORE_DIR"
BACKUP_FILE="$RESTORE_DIR/restore.tar.gz"

if [[ "$BACKUP_NAME" == s3://* ]]; then
    # Download from S3 using full path
    log_info "Downloading from S3: $BACKUP_NAME"
    aws s3 cp "$BACKUP_NAME" "$BACKUP_FILE" --region "$S3_REGION" || log_error "Download failed"

elif [[ "$BACKUP_NAME" == *".tar.gz" ]]; then
    # Check if it's a local file
    if [ -f "$BACKUP_NAME" ]; then
        log_info "Using local backup: $BACKUP_NAME"
        cp "$BACKUP_NAME" "$BACKUP_FILE"
    elif [ -f "/tmp/kamiyo_backups/$BACKUP_NAME" ]; then
        log_info "Using local backup: /tmp/kamiyo_backups/$BACKUP_NAME"
        cp "/tmp/kamiyo_backups/$BACKUP_NAME" "$BACKUP_FILE"
    else
        # Try downloading from S3
        log_info "Downloading from S3: $BACKUP_NAME"
        aws s3 cp "s3://${S3_BUCKET}/backups/${BACKUP_NAME}" "$BACKUP_FILE" --region "$S3_REGION" || log_error "Download failed"
    fi
else
    # Assume it's a backup name without extension
    log_info "Downloading from S3: ${BACKUP_NAME}.tar.gz"
    aws s3 cp "s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz" "$BACKUP_FILE" --region "$S3_REGION" || log_error "Download failed"
fi

log_info "Backup downloaded: $(du -h $BACKUP_FILE | cut -f1)"

# ============================================
# 3. Extract Backup
# ============================================

log_info "Extracting backup..."
cd "$RESTORE_DIR"
tar -xzf restore.tar.gz

# Find the backup base name
BACKUP_BASE=$(tar -tzf restore.tar.gz | head -1 | cut -d'/' -f1 | sed 's/\..*//')
log_info "Backup base name: $BACKUP_BASE"

# ============================================
# 4. Pre-Restore Database Backup
# ============================================

log_warn "Creating safety backup of current database..."

# Extract database credentials
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\(.*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\(.*\)/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*\/\/\(.*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/.*:\(.*\)@.*/\1/p')

export PGPASSWORD="$DB_PASS"

SAFETY_BACKUP="$RESTORE_DIR/pre_restore_backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    > "$SAFETY_BACKUP" 2>&1

log_info "Safety backup created: $(du -h $SAFETY_BACKUP | cut -f1)"

# ============================================
# 5. Restore Options
# ============================================

echo ""
log_question "Select restore method:"
echo "  1) Full restore (drop & recreate database)"
echo "  2) Restore schema only"
echo "  3) Restore data only (keep current schema)"
echo "  4) Restore specific tables"
echo "  5) Test restore (dry run)"
read -p "Choice [1-5]: " RESTORE_METHOD

case $RESTORE_METHOD in
    1)
        log_warn "Performing FULL restore (destructive)..."

        # Terminate all connections
        log_info "Terminating database connections..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
EOF

        # Drop and recreate database
        log_info "Dropping database: $DB_NAME"
        dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" --if-exists

        log_info "Creating database: $DB_NAME"
        createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"

        # Restore from custom format (faster)
        if [ -f "${BACKUP_BASE}.dump" ]; then
            log_info "Restoring from custom format..."
            pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                --jobs=4 \
                --no-owner \
                --no-acl \
                --verbose \
                "${BACKUP_BASE}.dump" 2>&1
        elif [ -f "${BACKUP_BASE}.sql" ]; then
            log_info "Restoring from SQL dump..."
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "${BACKUP_BASE}.sql"
        else
            log_error "No restore file found"
        fi

        log_info "Full restore completed"
        ;;

    2)
        log_info "Restoring schema only..."

        if [ -f "${BACKUP_BASE}_schema.sql" ]; then
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "${BACKUP_BASE}_schema.sql"
            log_info "Schema restore completed"
        else
            log_error "Schema backup not found"
        fi
        ;;

    3)
        log_info "Restoring data only (keeping current schema)..."

        if [ -f "${BACKUP_BASE}_data.sql" ]; then
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "${BACKUP_BASE}_data.sql"
            log_info "Data restore completed"
        else
            log_error "Data backup not found"
        fi
        ;;

    4)
        log_question "Enter table names (space-separated):"
        read TABLES

        if [ -f "${BACKUP_BASE}.dump" ]; then
            for table in $TABLES; do
                log_info "Restoring table: $table"
                pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                    --table="$table" \
                    --no-owner \
                    --no-acl \
                    "${BACKUP_BASE}.dump" 2>&1 || log_warn "Table $table may not exist in backup"
            done
        else
            log_error "Custom format backup not found (required for table-specific restore)"
        fi
        ;;

    5)
        log_info "Performing dry run (test restore)..."

        # Create temporary test database
        TEST_DB="${DB_NAME}_restore_test"
        log_info "Creating test database: $TEST_DB"
        createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB" || true

        if [ -f "${BACKUP_BASE}.dump" ]; then
            pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" \
                --jobs=4 \
                --no-owner \
                --no-acl \
                "${BACKUP_BASE}.dump" 2>&1
        elif [ -f "${BACKUP_BASE}.sql" ]; then
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" < "${BACKUP_BASE}.sql"
        fi

        log_info "Test restore completed. Test database: $TEST_DB"
        log_warn "Remember to drop test database when done: dropdb $TEST_DB"
        ;;

    *)
        log_error "Invalid choice"
        ;;
esac

unset PGPASSWORD

# ============================================
# 6. Post-Restore Verification
# ============================================

log_info "Verifying restore..."

export PGPASSWORD="$DB_PASS"

# Check table count
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
log_info "Tables restored: $TABLE_COUNT"

# Check critical tables
CRITICAL_TABLES=("users" "exploits" "subscriptions")
for table in "${CRITICAL_TABLES[@]}"; do
    ROW_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
    log_info "Table $table: $ROW_COUNT rows"
done

unset PGPASSWORD

# ============================================
# 7. Post-Restore Tasks
# ============================================

log_info "Running post-restore tasks..."

export PGPASSWORD="$DB_PASS"

# Analyze tables
log_info "Analyzing tables..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "ANALYZE;" 2>&1 > /dev/null

# Vacuum database
log_info "Vacuuming database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "VACUUM ANALYZE;" 2>&1 > /dev/null

# Reindex
log_info "Reindexing database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "REINDEX DATABASE $DB_NAME;" 2>&1 > /dev/null || log_warn "Reindex may require exclusive lock"

unset PGPASSWORD

# ============================================
# 8. Cleanup
# ============================================

log_info "Cleaning up..."

# Keep safety backup, remove extracted files
rm -f "$RESTORE_DIR/restore.tar.gz"
rm -rf "$RESTORE_DIR/${BACKUP_BASE}"*

log_info "Safety backup preserved at: $SAFETY_BACKUP"

# ============================================
# 9. Notification
# ============================================

if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"🔄 Kamiyo database restored from: $BACKUP_NAME\"}" \
        > /dev/null 2>&1
fi

# ============================================
# Summary
# ============================================

echo ""
echo "=========================================="
echo "Restore Summary"
echo "=========================================="
echo "Backup:         $BACKUP_NAME"
echo "Database:       $DB_NAME"
echo "Tables:         $TABLE_COUNT"
echo "Safety Backup:  $SAFETY_BACKUP"
echo "Completed:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="
echo ""
echo -e "${GREEN}✅ RESTORE COMPLETED SUCCESSFULLY${NC}"
echo ""
log_warn "Important: Verify application functionality before resuming production traffic"
