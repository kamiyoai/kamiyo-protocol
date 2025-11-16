#!/bin/bash

echo "🔧 Fixing worktree paths after directory rename..."
echo ""

cd /Users/dennisgoslar/Projekter/kamiyo

# Fix all gitdir files in worktrees
for gitdir_file in .git/worktrees/*/gitdir; do
    if [ -f "$gitdir_file" ]; then
        echo "Fixing: $gitdir_file"
        sed -i '' 's|/Users/dennisgoslar/Projekter/exploit-intel-platform|/Users/dennisgoslar/Projekter/kamiyo|g' "$gitdir_file"
    fi
done

# Fix commondir files if they exist
for commondir_file in .git/worktrees/*/commondir; do
    if [ -f "$commondir_file" ]; then
        echo "Fixing: $commondir_file"
        sed -i '' 's|/Users/dennisgoslar/Projekter/exploit-intel-platform|/Users/dennisgoslar/Projekter/kamiyo|g' "$commondir_file"
    fi
done

echo ""
echo "✅ Fixed worktree paths!"
echo ""
echo "Now try: git add -u && git commit -m 'Clean up' && git push origin master:main --force"
