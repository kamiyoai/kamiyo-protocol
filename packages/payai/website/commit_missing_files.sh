#!/bin/bash
cd /Users/dennisgoslar/Projekter/kamiyo

echo "📝 Adding missing lib files..."
git add website/lib/

echo "📝 Checking git status..."
git status --short

echo ""
echo "✍️  Committing..."
git commit -m "Add missing lib files for production build"

echo ""
echo "🚀 Pushing to main branch..."
git push origin master:main --force

echo ""
echo "✅ Done! Render will rebuild automatically."
