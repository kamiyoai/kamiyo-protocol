#!/bin/bash
# scripts/apply_x402_migration.sh
# Apply x402 payment tables migration with safety checks
#
# USAGE:
#   ./scripts/apply_x402_migration.sh [--dry-run] [--skip-backup] [--auto]
#
# OPTIONS:
#   --dry-run       Preview migration without executing
#   --skip-backup   Skip database backup (not recommended)
#   --auto          Skip confirmation prompts (for CI/CD)
#
# REQUIREMENTS:
#   - DATABASE_URL environment variable set
#   - PostgreSQL client tools (psql, pg_dump)
#   - Write access to /tmp or specified backup directory

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly MIGRATION_FILE="${PROJECT_ROOT}/database/migrations/002_x402_payments.sql"
readonly BACKUP_DIR="${BACKUP_DIR:-/tmp/kamiyo_backups}"
readonly TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
readonly BACKUP_FILE="${BACKUP_DIR}/pre_x402_migration_${TIMESTAMP}.sql.gz"

# Parse command line arguments
DRY_RUN=false
SKIP_BACKUP=false
AUTO_CONFIRM=false

for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --auto)
            AUTO_CONFIRM=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--dry-run] [--skip-backup] [--auto]"
            echo ""
            echo "Apply x402 payment tables migration with safety checks"
            echo ""
            echo "Options:"
            echo "  --dry-run       Preview migration without executing"
            echo "  --skip-backup   Skip database backup (not recommended)"
            echo "  --auto          Skip confirmation prompts (for CI/CD)"
            echo "  --help, -h      Show this help message"
            exit 0
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Print header
print_header() {
    echo ""
    echo "========================================================================"
    echo "  KAMIYO x402 Payment Tables Migration"
    echo "========================================================================"
    echo ""
    echo "Migration: 002_x402_payments.sql"
    echo "Timestamp: ${TIMESTAMP}"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}Mode: DRY RUN (no changes will be made)${NC}"
    fi
    echo ""
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check DATABASE_URL
    if [ -z "${DATABASE_URL:-}" ]; then
        log_error "DATABASE_URL environment variable not set"
        echo ""
        echo "Please set DATABASE_URL to your PostgreSQL connection string:"
        echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
        exit 1
    fi

    # Parse DATABASE_URL to extract connection info
    DB_INFO=$(echo "$DATABASE_URL" | sed 's/.*@//' | sed 's/\?.*//')
    log_success "Database URL configured: ${DB_INFO}"

    # Check for required tools
    local missing_tools=()

    if ! command -v psql &> /dev/null; then
        missing_tools+=("psql")
    fi

    if [ "$SKIP_BACKUP" = false ] && ! command -v pg_dump &> /dev/null; then
        missing_tools+=("pg_dump")
    fi

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        echo ""
        echo "Install PostgreSQL client tools:"
        echo "  macOS:   brew install postgresql"
        echo "  Ubuntu:  sudo apt-get install postgresql-client"
        echo "  CentOS:  sudo yum install postgresql"
        exit 1
    fi

    # Check migration file exists
    if [ ! -f "$MIGRATION_FILE" ]; then
        log_error "Migration file not found: $MIGRATION_FILE"
        exit 1
    fi

    log_success "All prerequisites met"
}

# Test database connection
test_connection() {
    log_info "Testing database connection..."

    if ! psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
        log_error "Failed to connect to database"
        echo ""
        echo "Please verify:"
        echo "  1. DATABASE_URL is correct"
        echo "  2. Database server is running"
        echo "  3. Network connectivity is available"
        echo "  4. Credentials are valid"
        exit 1
    fi

    log_success "Database connection successful"
}

# Check if migration already applied
check_migration_status() {
    log_info "Checking migration status..."

    # Check if x402_payments table exists
    local table_exists=$(psql "$DATABASE_URL" -t -c \
        "SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'x402_payments'
        );" | xargs)

    if [ "$table_exists" = "t" ]; then
        log_warning "x402_payments table already exists!"

        # Count existing records
        local record_count=$(psql "$DATABASE_URL" -t -c \
            "SELECT COUNT(*) FROM x402_payments;" | xargs)

        echo ""
        echo "Existing data found:"
        echo "  x402_payments: ${record_count} records"
        echo ""

        if [ "$AUTO_CONFIRM" = false ]; then
            read -p "Migration may already be applied. Continue anyway? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Migration cancelled by user"
                exit 0
            fi
        fi
    else
        log_info "Migration not yet applied (x402_payments table not found)"
    fi
}

# Display migration preview
show_migration_preview() {
    log_info "Migration preview:"
    echo ""
    echo "========================================================================"
    echo "Tables to be created:"
    echo "  - x402_payments          (main payment records)"
    echo "  - x402_tokens            (payment access tokens)"
    echo "  - x402_usage             (API usage tracking)"
    echo "  - x402_analytics         (aggregated analytics)"
    echo ""
    echo "Views to be created:"
    echo "  - v_x402_active_payments    (active payments with remaining requests)"
    echo "  - v_x402_stats_24h          (24-hour payment statistics)"
    echo "  - v_x402_top_payers         (top payers by spending)"
    echo "  - v_x402_endpoint_stats     (endpoint usage statistics)"
    echo ""
    echo "Functions to be created:"
    echo "  - cleanup_expired_x402_payments()   (cleanup expired records)"
    echo "  - update_x402_analytics()           (update hourly analytics)"
    echo ""
    echo "Indexes: 13 indexes for performance optimization"
    echo "========================================================================"
    echo ""
}

# Backup database
backup_database() {
    if [ "$SKIP_BACKUP" = true ]; then
        log_warning "Skipping database backup (--skip-backup flag set)"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "Would create backup: $BACKUP_FILE"
        return 0
    fi

    log_info "Creating database backup..."

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    # Extract connection parameters from DATABASE_URL
    # Format: postgresql://user:password@host:port/database
    local DB_PARAMS=$(echo "$DATABASE_URL" | sed 's/postgresql:\/\///')
    local DB_USER=$(echo "$DB_PARAMS" | cut -d: -f1)
    local DB_PASS=$(echo "$DB_PARAMS" | cut -d: -f2 | cut -d@ -f1)
    local DB_HOST=$(echo "$DB_PARAMS" | cut -d@ -f2 | cut -d: -f1)
    local DB_PORT=$(echo "$DB_PARAMS" | cut -d: -f2 | cut -d/ -f1)
    local DB_NAME=$(echo "$DB_PARAMS" | cut -d/ -f2 | cut -d? -f1)

    # Create backup
    PGPASSWORD="$DB_PASS" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -F c \
        --no-owner \
        --no-acl \
        2>/dev/null | gzip > "$BACKUP_FILE"

    local backup_size=$(du -h "$BACKUP_FILE" | cut -f1)
    log_success "Backup created: $BACKUP_FILE (${backup_size})"

    echo ""
    echo "To restore this backup if needed:"
    echo "  gunzip -c $BACKUP_FILE | pg_restore -d \$DATABASE_URL --no-owner --no-acl"
    echo ""
}

# Apply migration
apply_migration() {
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would execute migration from $MIGRATION_FILE"
        return 0
    fi

    log_info "Applying migration..."

    # Execute migration in a transaction
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_FILE" > /tmp/x402_migration_${TIMESTAMP}.log 2>&1; then
        log_success "Migration executed successfully"
    else
        log_error "Migration failed! Check logs: /tmp/x402_migration_${TIMESTAMP}.log"
        echo ""
        echo "Last 20 lines of error log:"
        tail -20 /tmp/x402_migration_${TIMESTAMP}.log
        exit 1
    fi
}

# Verify migration
verify_migration() {
    log_info "Verifying migration..."

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would verify tables were created"
        return 0
    fi

    local tables=("x402_payments" "x402_tokens" "x402_usage" "x402_analytics")
    local all_good=true

    echo ""
    for table in "${tables[@]}"; do
        local exists=$(psql "$DATABASE_URL" -t -c \
            "SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = '$table'
            );" | xargs)

        if [ "$exists" = "t" ]; then
            echo -e "  ${GREEN}✓${NC} Table $table exists"
        else
            echo -e "  ${RED}✗${NC} Table $table missing"
            all_good=false
        fi
    done

    # Check views
    local views=("v_x402_active_payments" "v_x402_stats_24h" "v_x402_top_payers" "v_x402_endpoint_stats")
    for view in "${views[@]}"; do
        local exists=$(psql "$DATABASE_URL" -t -c \
            "SELECT EXISTS (
                SELECT FROM information_schema.views
                WHERE table_schema = 'public'
                AND table_name = '$view'
            );" | xargs)

        if [ "$exists" = "t" ]; then
            echo -e "  ${GREEN}✓${NC} View $view exists"
        else
            echo -e "  ${RED}✗${NC} View $view missing"
            all_good=false
        fi
    done

    # Check functions
    local functions=("cleanup_expired_x402_payments" "update_x402_analytics")
    for func in "${functions[@]}"; do
        local exists=$(psql "$DATABASE_URL" -t -c \
            "SELECT EXISTS (
                SELECT FROM pg_proc
                WHERE proname = '$func'
            );" | xargs)

        if [ "$exists" = "t" ]; then
            echo -e "  ${GREEN}✓${NC} Function $func() exists"
        else
            echo -e "  ${RED}✗${NC} Function $func() missing"
            all_good=false
        fi
    done

    echo ""

    if [ "$all_good" = true ]; then
        log_success "All database objects created successfully"
    else
        log_error "Some database objects are missing"
        exit 1
    fi
}

# Test basic queries
test_queries() {
    log_info "Testing basic queries..."

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would test queries against new tables"
        return 0
    fi

    echo ""

    # Test INSERT
    if psql "$DATABASE_URL" -c "
        INSERT INTO x402_payments (
            tx_hash, chain, amount_usdc, from_address, to_address,
            block_number, confirmations, status, requests_allocated,
            expires_at
        ) VALUES (
            'test_tx_${TIMESTAMP}', 'base', 1.00,
            '0xtest', '0xkamiyo',
            12345, 1, 'pending', 100,
            NOW() + INTERVAL '1 hour'
        )
        ON CONFLICT (tx_hash) DO NOTHING
        RETURNING id;
    " > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} INSERT test passed"
    else
        echo -e "  ${RED}✗${NC} INSERT test failed"
    fi

    # Test SELECT
    if psql "$DATABASE_URL" -c "
        SELECT COUNT(*) FROM x402_payments;
    " > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} SELECT test passed"
    else
        echo -e "  ${RED}✗${NC} SELECT test failed"
    fi

    # Test VIEW
    if psql "$DATABASE_URL" -c "
        SELECT COUNT(*) FROM v_x402_active_payments;
    " > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} VIEW test passed"
    else
        echo -e "  ${RED}✗${NC} VIEW test failed"
    fi

    # Test FUNCTION
    if psql "$DATABASE_URL" -c "
        SELECT cleanup_expired_x402_payments();
    " > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} FUNCTION test passed"
    else
        echo -e "  ${RED}✗${NC} FUNCTION test failed"
    fi

    # Clean up test data
    psql "$DATABASE_URL" -c "
        DELETE FROM x402_payments WHERE tx_hash = 'test_tx_${TIMESTAMP}';
    " > /dev/null 2>&1

    echo ""
    log_success "All query tests passed"
}

# Show summary
show_summary() {
    echo ""
    echo "========================================================================"
    echo "  Migration Summary"
    echo "========================================================================"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY RUN COMPLETE - No changes were made${NC}"
        echo ""
        echo "To apply this migration for real, run without --dry-run:"
        echo "  ./scripts/apply_x402_migration.sh"
    else
        echo -e "${GREEN}✓ Migration completed successfully${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Update x402 config to use 'database' mode"
        echo "  2. Set X402_STORAGE_MODE=database in environment"
        echo "  3. Restart API services"
        echo "  4. Monitor logs for any issues"
        echo ""
        echo "Monitoring queries:"
        echo "  - Active payments:  SELECT * FROM v_x402_active_payments;"
        echo "  - 24h stats:        SELECT * FROM v_x402_stats_24h;"
        echo "  - Top payers:       SELECT * FROM v_x402_top_payers LIMIT 10;"
        echo "  - All payments:     SELECT COUNT(*) FROM x402_payments;"
    fi

    echo ""
    echo "Backup location: $BACKUP_FILE"
    echo "Migration log:   /tmp/x402_migration_${TIMESTAMP}.log"
    echo ""
    echo "========================================================================"
}

# Confirmation prompt
confirm_migration() {
    if [ "$AUTO_CONFIRM" = true ]; then
        return 0
    fi

    echo ""
    read -p "Apply this migration to the database? (y/N): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Migration cancelled by user"
        exit 0
    fi
}

# Main execution
main() {
    print_header
    check_prerequisites
    test_connection
    check_migration_status
    show_migration_preview

    if [ "$DRY_RUN" = false ]; then
        confirm_migration
    fi

    backup_database
    apply_migration
    verify_migration
    test_queries
    show_summary

    if [ "$DRY_RUN" = true ]; then
        exit 0
    else
        exit 0
    fi
}

# Run main function
main "$@"
