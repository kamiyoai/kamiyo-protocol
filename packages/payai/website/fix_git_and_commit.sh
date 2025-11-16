#!/bin/bash

# Explicitly unset problematic git environment variables
unset GIT_DIR
unset GIT_WORK_TREE
unset GIT_INDEX_FILE
unset GIT_OBJECT_DIRECTORY
unset GIT_ALTERNATE_OBJECT_DIRECTORIES

# Change to kamiyo directory
cd /Users/dennisgoslar/Projekter/kamiyo

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
echo "✅ Done! Check Render dashboard for auto-deploy."
