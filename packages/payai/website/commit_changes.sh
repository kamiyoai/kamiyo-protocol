#!/bin/bash
cd /Users/dennisgoslar/Projekter/kamiyo

# Add all changes
git add .

# Create commit
git commit -m "feat: Production deployment setup for Render.com

- Add render.yaml for automated Render.com deployment
- Create RENDER_DEPLOYMENT_GUIDE.md with step-by-step instructions
- Update health check endpoint with Render-compatible monitoring
- Ready for production deployment with PostgreSQL support

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to GitHub
git push origin master

echo "✅ Changes committed and pushed to GitHub!"
