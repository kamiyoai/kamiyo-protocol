#!/bin/bash

echo "🔍 Searching for exploit-intel-platform references..."

echo ""
echo "In current directory's .git:"
find /Users/dennisgoslar/Projekter/kamiyo/.git -type f -exec grep -l "exploit-intel-platform" {} \; 2>/dev/null

echo ""
echo "In parent directories:"
find /Users/dennisgoslar/Projekter -name ".git" -type d 2>/dev/null | while read gitdir; do
    if grep -r "aggregation-agent" "$gitdir" 2>/dev/null | grep -q "exploit-intel-platform"; then
        echo "Found in: $gitdir"
    fi
done

echo ""
echo "Checking if exploit-intel-platform directory exists:"
ls -ld /Users/dennisgoslar/Projekter/exploit-intel-platform 2>/dev/null || echo "Directory does not exist"
