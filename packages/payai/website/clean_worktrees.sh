#!/bin/bash

cd ~/project/Projekter/kamiyo

echo "🧹 Pruning old worktrees..."
git --git-dir=~/project/Projekter/kamiyo/.git --work-tree=~/project/Projekter/kamiyo worktree prune -v

echo ""
echo "📋 Listing active worktrees..."
git --git-dir=~/project/Projekter/kamiyo/.git --work-tree=~/project/Projekter/kamiyo worktree list

echo ""
echo "✅ Worktrees cleaned. Now trying git status..."
git --git-dir=~/project/Projekter/kamiyo/.git --work-tree=~/project/Projekter/kamiyo status --short

echo ""
echo "📝 Adding website changes..."
git --git-dir=~/project/Projekter/kamiyo/.git --work-tree=~/project/Projekter/kamiyo add website/

echo ""
echo "✍️  Committing..."
git --git-dir=~/project/Projekter/kamiyo/.git --work-tree=~/project/Projekter/kamiyo commit -m "Add frontend UI updates: video header, 24h delay badge, sign-in button, layout improvements"

echo ""
echo "🚀 Pushing to GitHub..."
git --git-dir=~/project/Projekter/kamiyo/.git --work-tree=~/project/Projekter/kamiyo push origin master

echo ""
echo "✅ Done!"
