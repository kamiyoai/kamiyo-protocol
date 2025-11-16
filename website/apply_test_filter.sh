#!/bin/bash

echo "🔧 Applying test data filter migration..."
echo ""

DB_PATH="data/kamiyo.db"

if [ ! -f "$DB_PATH" ]; then
    echo "❌ Database not found at $DB_PATH"
    exit 1
fi

echo "📊 Current database stats:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as total FROM exploits;"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as test_entries FROM exploits WHERE LOWER(protocol) LIKE '%test%' OR LOWER(COALESCE(category, '')) LIKE '%test%';"

echo ""
echo "📝 Applying migration..."
sqlite3 "$DB_PATH" < database/migrations/009_filter_test_data.sql

echo ""
echo "✅ Migration applied successfully!"
echo ""
echo "📊 New stats (test data filtered):"
sqlite3 "$DB_PATH" "SELECT * FROM v_stats_24h;"

echo ""
echo "🎉 Test data will no longer appear in API responses!"
