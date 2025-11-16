#!/bin/bash
cd /Users/dennisgoslar/Projekter/kamiyo

echo "📋 Checking what files are in commit 20081aa..."
git show --stat 20081aa

echo ""
echo "📂 Checking if website/ files were changed..."
git diff --name-only 7bf3814 20081aa | grep "website/"
