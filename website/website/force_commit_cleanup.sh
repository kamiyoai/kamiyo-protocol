#!/usr/bin/env bash

# Completely bypass environment
export GIT_DIR=~/project/Projekter/kamiyo/.git
export GIT_WORK_TREE=~/project/Projekter/kamiyo

cd "$GIT_WORK_TREE"

echo "📋 Checking what files were deleted..."
git diff --name-status --cached 2>/dev/null || git diff --name-status 2>/dev/null

echo ""
echo "📝 Staging deletions..."
git add -u .

echo ""
echo "📝 Staging new files..."
git add .

echo ""
echo "✍️ Creating commit..."
git commit -m "Clean up old AI agent files and unused code" 2>&1

echo ""
echo "🚀 Pushing to main..."
git push origin master:main --force 2>&1

echo ""
echo "✅ Done!"
