#!/bin/bash
#
# Apply API Key Migration to Production Database
# This script applies the add_api_keys.sql migration
#

set -e

echo "=================================="
echo "API Key Migration Tool"
echo "=================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    echo ""
    echo "Please set DATABASE_URL to your production database connection string:"
    echo "export DATABASE_URL='postgresql://user:password@host:port/database'"
    exit 1
fi

# Show masked database URL
DB_HOST=$(echo $DATABASE_URL | sed -n 's|.*@\([^/]*\).*|\1|p')
echo "📊 Target Database: $DB_HOST"
echo ""

# Confirm before proceeding
read -p "Apply API key migration to production database? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Migration cancelled."
    exit 0
fi

echo ""
echo "🔄 Applying migration..."

# Apply migration using psql
psql "$DATABASE_URL" < prisma/migrations/add_api_keys.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "Verifying table was created..."

    # Verify table exists
    VERIFY=$(psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ApiKey');" | tr -d '[:space:]')

    if [ "$VERIFY" = "t" ]; then
        echo "✅ ApiKey table verified"

        # Show table structure
        echo ""
        echo "Table structure:"
        psql "$DATABASE_URL" -c "\d \"ApiKey\""
    else
        echo "⚠️  Warning: Could not verify table creation"
    fi

    echo ""
    echo "=================================="
    echo "Next steps:"
    echo "1. Generate API keys for existing users:"
    echo "   node scripts/generate-api-key.js --all"
    echo ""
    echo "2. Deploy updated code to production"
    echo "=================================="
else
    echo ""
    echo "❌ Migration failed!"
    exit 1
fi
