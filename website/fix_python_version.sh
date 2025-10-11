#!/bin/bash
cd ~/project/Projekter/kamiyo

echo "📝 Committing Python version fix..."
git add render.yaml
git commit -m "Fix Python version in render.yaml (3.11 -> 3.11.0)"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin master

echo ""
echo "✅ Done! Render will auto-deploy the fix."
echo ""
echo "🔄 Check your Render dashboard - it should trigger a new build automatically."
