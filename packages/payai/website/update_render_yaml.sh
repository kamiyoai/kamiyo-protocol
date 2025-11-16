#!/bin/bash
cd /Users/dennisgoslar/Projekter/kamiyo

echo "📝 Committing updated render.yaml..."
git add render.yaml

git commit -m "Update render.yaml to use existing database

- Remove database section (using existing kamiyo_ai database)
- Set DATABASE_URL to manual configuration
- Fixes deployment conflict with existing paid database plan

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin master

echo ""
echo "✅ Done! render.yaml updated on GitHub."
echo ""
echo "🔗 Next: Refresh the Blueprint page in Render Dashboard"
