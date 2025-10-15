#!/bin/bash

# Run git commands in completely clean environment
env -i \
  HOME="$HOME" \
  PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  USER="$USER" \
  LOGNAME="$LOGNAME" \
  bash << 'SCRIPT'

cd ~/project/Projekter/kamiyo

echo "🧹 Clean environment - checking status..."
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
echo "✅ Done!"
SCRIPT
