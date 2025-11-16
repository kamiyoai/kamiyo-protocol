#!/bin/bash
cd ~/project/Projekter/kamiyo

echo "📋 Adding render.yaml to git..."
git add render.yaml

echo "📋 Adding RENDER_DEPLOYMENT_GUIDE.md to git..."
git add RENDER_DEPLOYMENT_GUIDE.md

echo "📋 Adding init scripts..."
git add init_database.js init_database.py 2>/dev/null

echo ""
echo "📝 Committing changes..."
git commit -m "Add render.yaml and deployment files

- Add render.yaml for Render.com Blueprint deployment
- Add RENDER_DEPLOYMENT_GUIDE.md with complete instructions
- Add database initialization scripts

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin master

echo ""
echo "✅ Done! render.yaml is now on GitHub."
echo ""
echo "🔗 Next: Go to Render Dashboard and create Blueprint from repo"
