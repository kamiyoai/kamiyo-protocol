#!/bin/bash
cd /Users/dennisgoslar/Projekter/kamiyo

echo "🧹 Cleaning up old/unused files from previous project..."
echo ""

# Remove old AI agent/Kami files
echo "Removing AI agent files..."
rm -f website/pages/summon.js
rm -rf website/pages/api/kami
rm -rf website/pages/api/tee
rm -rf website/pages/api/agent
rm -rf website/pages/api/dex
rm -f website/pages/api/run-swarm.js
rm -rf website/pages/kamiyonanayo

# Remove duplicate health check
echo "Removing duplicate healthz..."
rm -f website/pages/api/healthz.js

# Remove duplicate inquiries API
echo "Removing duplicate inquiries API..."
rm -f website/pages/api/inquiries.js

# Remove old character files
echo "Removing old character files..."
rm -f website/character.json
rm -f website/character-kamiyo.json
rm -rf website/characters

# Remove old integration docs
echo "Removing old documentation..."
rm -f website/INTEGRATION_COMPLETE.md
rm -f website/INTEGRATION_README.md
rm -f website/QUICKSTART.md
rm -f website/TEST_RESULTS.md

# Remove old dockerfiles
echo "Removing old Docker files..."
rm -f website/Dockerfile.sgx
rm -f website/Dockerfile.sgx-node-23

# Remove old scripts
echo "Removing old scripts..."
rm -f website/kamiyo_ai_pfn.py
rm -f website/index.js

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Files removed:"
echo "  - AI agent pages (summon, kami, tee, agent, dex)"
echo "  - Duplicate API routes (healthz, inquiries API)"
echo "  - Old character/integration files"
echo "  - Old Docker files"
echo ""
echo "Run 'git status' to review changes before committing."
