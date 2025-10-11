#!/bin/bash

# Explicitly set correct git directories
export GIT_DIR=~/project/Projekter/kamiyo/.git
export GIT_WORK_TREE=~/project/Projekter/kamiyo

cd ~/project/Projekter/kamiyo

echo "📋 Using GIT_DIR: $GIT_DIR"
echo "📋 Using GIT_WORK_TREE: $GIT_WORK_TREE"
echo ""

echo "📋 Checking status..."
git status --short

echo ""
echo "📝 Adding website changes..."
git add website/

echo ""
echo "✍️  Committing..."
git commit -m "Add frontend UI updates: video header, 24h delay badge, sign-in button, layout improvements" 2>&1 || echo "Nothing to commit or commit failed"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin master

echo ""
echo "✅ Done!"
