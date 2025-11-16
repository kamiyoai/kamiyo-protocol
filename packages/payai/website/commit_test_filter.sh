#!/bin/bash

cd /Users/dennisgoslar/Projekter/kamiyo

echo "📝 Staging test data filter changes..."
git add database/manager.py
git add database/schema.sql
git add database/migrations/009_filter_test_data.sql
git add apply_test_filter.sh

echo ""
echo "✍️  Committing changes..."
git commit -m "Add test data filtering to database queries

- Filter out protocols containing 'test' (case-insensitive)
- Filter out categories containing 'test'
- Updated all database methods: get_recent_exploits, get_exploits_by_chain, get_stats_custom, get_total_exploits, get_chains
- Updated database views: v_recent_exploits, v_stats_24h
- Added migration script to update existing databases
- Added convenience script to apply migration

This ensures test data no longer appears in:
- /exploits API endpoint
- /stats API endpoint
- /chains API endpoint
- Dashboard and frontend displays

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "🚀 Pushing to remote..."
git push origin master:main

echo ""
echo "✅ Changes committed and pushed!"
