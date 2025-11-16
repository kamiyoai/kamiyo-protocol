#!/bin/bash

cd /Users/dennisgoslar/Projekter/kamiyo

echo "📝 Staging dashboard separation changes..."
git add website/pages/index.js
git add website/components/Header.js

echo ""
echo "✍️  Committing changes..."
git commit -m "Separate dashboard from landing page with responsive navigation

Landing Page (index.js):
- Removed dashboard section (filters and exploits table)
- Removed filters state
- Dashboard section now on separate /dashboard page
- Landing page now focused on conversion (hero, pricing, social proof, FAQ)

Header Component:
- Added Dashboard link in desktop header (before Sign In)
- Dashboard link hidden on mobile (appears in side menu instead)
- Desktop: Logo + Dashboard + Sign In/Account + Menu
- Mobile: Logo + Sign In/Account + Menu (Dashboard in side menu)
- Added Dashboard as first item in side menu
- Changed logged-in user link from 'Dashboard' to 'Account' to avoid duplication

Responsive Navigation:
- Desktop: Dashboard link visible in header
- Mobile: Dashboard link moves to side menu
- Consistent with mobile-first design pattern

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "🚀 Pushing to remote..."
git push origin master:main

echo ""
echo "✅ Dashboard separation complete!"
echo ""
echo "📊 Changes:"
echo "  - Landing page now conversion-focused (no dashboard clutter)"
echo "  - Dashboard at /dashboard route"
echo "  - Responsive header navigation (desktop + mobile)"
echo "  - Dashboard link in header (desktop) and side menu (mobile)"
echo ""
echo "🎯 Test the responsive navigation on different screen sizes!"
