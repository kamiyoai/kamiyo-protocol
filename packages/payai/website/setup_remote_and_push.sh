#!/bin/bash
cd /Users/dennisgoslar/Projekter/kamiyo

echo "🔍 Checking current remotes..."
git remote -v

echo ""
echo "📋 What's your GitHub repository URL?"
echo "Format: https://github.com/username/repo-name.git"
echo "   or: git@github.com:username/repo-name.git"
echo ""
read -p "Enter GitHub repo URL: " REPO_URL

if [ -z "$REPO_URL" ]; then
    echo "❌ No URL provided. Exiting."
    exit 1
fi

echo ""
echo "🔗 Adding remote 'origin'..."
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"

echo ""
echo "✅ Remote configured:"
git remote -v

echo ""
echo "🚀 Pushing to GitHub..."
git push -u origin master

echo ""
echo "✅ Done! Check your GitHub repository."
