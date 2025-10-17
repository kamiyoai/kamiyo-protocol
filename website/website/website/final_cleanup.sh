#!/bin/bash

echo "🧹 Final cleanup of old agent directories..."
echo ""

cd ~/project/Projekter/kamiyo

# Remove .git files from fake worktrees (convert to normal directories)
echo "📝 Removing broken worktree references..."
rm -f aggregation-agent/.git
rm -f frontend-agent/.git
rm -f monitoring-agent/.git
rm -f processing-agent/.git

echo "✅ Broken worktree references removed!"
echo ""

# Now git can see these as normal directories to delete
echo "🗑️  Removing old agent directories..."
rm -rf aggregation-agent/
rm -rf frontend-agent/
rm -rf monitoring-agent/
rm -rf processing-agent/

echo "✅ Old directories removed!"
echo ""

echo "📝 Staging all changes..."
git add -A

echo ""
echo "✍️  Creating commit..."
git commit -m "Clean up old AI agent files and fix git worktrees

Removed:
- aggregation-agent/ (old AI agent code and docs)
- frontend-agent/ (old AI agent code and docs)
- monitoring-agent/ (old AI agent code and docs)
- processing-agent/ (old AI agent code and docs)
- website/pages/api/kami/
- website/pages/api/tee/
- website/pages/api/agent/
- website/pages/api/dex/
- website/pages/summon.js
- Character files and old documentation

Updated:
- SEO to 'Real-time Blockchain Exploit Intelligence'
- Video saturation increased to 2.5
- Removed magenta text selection styling
- Fixed health API to properly proxy backend data

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "🚀 Pushing to remote..."
git push origin master:main --force

echo ""
echo "✅ All done! Your changes are now live on Render!"
