#!/usr/bin/env bash

# This script MUST be run from the kamiyo directory
if [ "$(pwd)" != "/Users/dennisgoslar/Projekter/kamiyo" ]; then
    echo "❌ Wrong directory!"
    echo "Current: $(pwd)"
    echo "Expected: /Users/dennisgoslar/Projekter/kamiyo"
    echo ""
    echo "Please run: cd /Users/dennisgoslar/Projekter/kamiyo && bash COMMIT_FROM_CORRECT_DIR.sh"
    exit 1
fi

echo "✅ In correct directory: $(pwd)"
echo ""

# Remove git env variables
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

echo "📋 Git status:"
git status --short website/

echo ""
read -p "Add and commit these changes? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    git add website/
    git commit -m "Add frontend UI updates: video header, 24h delay badge, sign-in button, layout improvements"
    git push origin master
    echo "✅ Done!"
else
    echo "❌ Cancelled"
fi
