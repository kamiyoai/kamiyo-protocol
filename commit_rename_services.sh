#!/bin/bash

cd ~/project/Projekter/kamiyo

echo "📝 Staging Services → Pricing rename..."
git add website/pages/pricing.js
git add website/components/Header.js
git rm website/pages/services.js

echo ""
echo "✍️  Committing changes..."
git commit -m "Rename Services to Pricing in menu and page

- Created /pricing page (moved from /services)
- Updated Header.js menu link from 'Services' to 'Pricing'
- Updated link href from /services to /pricing
- Deleted old services.js file

Users can now access pricing at /pricing instead of /services

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "🚀 Pushing to remote..."
git push origin master:main

echo ""
echo "✅ Changes committed and pushed!"
echo ""
echo "🎉 Menu now shows 'Pricing' and links to /pricing"
