#!/bin/bash
cd ~/project/Projekter/kamiyo

echo "🔗 Setting up GitHub remote..."
git remote add origin https://github.com/KamiyoAI/website.git 2>/dev/null || git remote set-url origin https://github.com/KamiyoAI/website.git

echo ""
echo "✅ Remote configured:"
git remote -v

echo ""
echo "🚀 Pushing to GitHub..."
git push -u origin master

echo ""
echo "✅ Done! Check your repository at:"
echo "   https://github.com/KamiyoAI/website"
