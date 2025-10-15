#!/bin/bash
# scripts/restore-database.sh
# Restore PostgreSQL database from backup

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_NAME="${POSTGRES_DB:-kamiyo_exploits}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"

# Check for backup file argument
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file|latest>"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/kamiyo_*.sql.gz 2>/dev/null || echo "  (no backups found)"
    echo ""
    echo "Examples:"
    echo "  $0 latest"
    echo "  $0 /backups/kamiyo_20251010_020000.sql.gz"
    exit 1
fi

# Handle 'latest' keyword
if [ "$BACKUP_FILE" = "latest" ]; then
    BACKUP_FILE="${BACKUP_DIR}/latest.sql.gz"
fi

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "⚠️  Kamiyo Database Restore"
echo "=========================="
echo "Backup file: $BACKUP_FILE"
echo "Backup size: $BACKUP_SIZE"
echo "Target database: $DB_NAME"
echo "Target host: $DB_HOST:$DB_PORT"
echo ""
echo "⚠️  WARNING: This will DROP and recreate the database!"
echo "   All current data will be lost."
echo ""

# Confirmation prompt
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo "Starting restore..."

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "Decompressing backup..."
    TEMP_FILE=$(mktemp)
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
    RESTORE_FILE="$TEMP_FILE"
else
    RESTORE_FILE="$BACKUP_FILE"
fi

# Drop existing database (if exists)
echo "Dropping existing database..."
PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -c "DROP DATABASE IF EXISTS $DB_NAME;" \
    postgres

# Create fresh database
echo "Creating fresh database..."
PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -c "CREATE DATABASE $DB_NAME;" \
    postgres

# Restore backup
echo "Restoring backup..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -v \
    "$RESTORE_FILE" \
    2>&1 | tail -10

# Cleanup temp file
if [ ! -z "$TEMP_FILE" ]; then
    rm -f "$TEMP_FILE"
fi

# Verify restore
echo ""
echo "Verifying restore..."
TABLE_COUNT=$(PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')

echo "Tables restored: $TABLE_COUNT"

echo ""
echo "=========================="
echo "✅ Database restore complete!"
echo "   Database: $DB_NAME"
echo "   Tables: $TABLE_COUNT"
echo ""
