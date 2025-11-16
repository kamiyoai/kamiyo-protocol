#!/bin/bash

cd /Users/dennisgoslar/Projekter/kamiyo

echo "🧹 Pruning old worktrees..."
git --git-dir=/Users/dennisgoslar/Projekter/kamiyo/.git --work-tree=/Users/dennisgoslar/Projekter/kamiyo worktree prune -v

echo ""
echo "📋 Listing active worktrees..."
git --git-dir=/Users/dennisgoslar/Projekter/kamiyo/.git --work-tree=/Users/dennisgoslar/Projekter/kamiyo worktree list

echo ""
echo "✅ Worktrees cleaned. Now trying git status..."
git --git-dir=/Users/dennisgoslar/Projekter/kamiyo/.git --work-tree=/Users/dennisgoslar/Projekter/kamiyo status --short

echo ""
echo "📝 Adding website changes..."
git --git-dir=/Users/dennisgoslar/Projekter/kamiyo/.git --work-tree=/Users/dennisgoslar/Projekter/kamiyo add website/

echo ""
echo "✍️  Committing..."
git --git-dir=/Users/dennisgoslar/Projekter/kamiyo/.git --work-tree=/Users/dennisgoslar/Projekter/kamiyo commit -m "Add frontend UI updates: video header, 24h delay badge, sign-in button, layout improvements"

echo ""
echo "🚀 Pushing to GitHub..."
git --git-dir=/Users/dennisgoslar/Projekter/kamiyo/.git --work-tree=/Users/dennisgoslar/Projekter/kamiyo push origin master

echo ""
echo "✅ Done!"
