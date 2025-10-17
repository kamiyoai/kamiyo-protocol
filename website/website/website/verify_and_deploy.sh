#!/bin/bash
cd ~/project/Projekter/kamiyo

echo "📋 Checking git status..."
git status

echo ""
echo "🌿 Current branch:"
git branch --show-current

echo ""
echo "📂 Checking if render.yaml exists:"
ls -lh render.yaml

echo ""
echo "🔍 Checking if render.yaml is in git:"
git ls-files render.yaml

echo ""
echo "📡 Remote repository:"
git remote -v

echo ""
echo "✅ If render.yaml shows above, it's tracked by git."
echo "⚠️  If not, we need to add and commit it."
