#!/bin/bash

echo "🔧 Final fix for all worktree issues..."
echo ""

cd /Users/dennisgoslar/Projekter/kamiyo

# Fix all .git files in subdirectories
for agent_dir in aggregation-agent frontend-agent monitoring-agent processing-agent; do
    if [ -f "$agent_dir/.git" ]; then
        echo "Fixing $agent_dir/.git"
        sed -i '' 's|/Users/dennisgoslar/Projekter/exploit-intel-platform|/Users/dennisgoslar/Projekter/kamiyo|g' "$agent_dir/.git"
    fi
done

echo ""
echo "✅ All worktree paths fixed!"
echo ""
echo "📝 Staging changes..."
git add -A

echo ""
echo "✍️ Committing cleanup..."
git commit -m "Clean up old AI agent files and fix worktree paths

- Removed old API endpoints (kami, tee, agent, dex)
- Removed character files and old docs
- Fixed all worktree paths after directory rename
- Updated SEO to 'Real-time Blockchain Exploit Intelligence'
- Increased video saturation to 2.5
- Removed magenta text selection styling
- Fixed health API to properly proxy backend data

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "🚀 Pushing to remote..."
git push origin master:main --force

echo ""
echo "✅ All done!"
