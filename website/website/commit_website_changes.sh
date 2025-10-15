#!/bin/bash
cd ~/project/Projekter/kamiyo

# Clean up any worktree issues
git worktree prune 2>/dev/null || true

# Status
echo "📋 Checking status..."
git status --short

echo ""
echo "📝 Adding website changes..."
git add website/

echo ""
echo "✍️  Committing..."
git commit -m "Add frontend UI updates: video header, 24h delay badge, sign-in button, layout improvements"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin master

echo ""
echo "✅ Done! Render will auto-deploy in 1-2 minutes."
