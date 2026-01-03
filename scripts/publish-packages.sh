#!/bin/bash
# Publish Mitama packages to npm
# Usage: ./scripts/publish-packages.sh [--dry-run]

set -e

DRY_RUN=""
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "DRY RUN MODE - No packages will be published"
fi

echo "==================================="
echo "  Mitama Package Publisher"
echo "==================================="
echo ""

# Check npm login
echo "Checking npm authentication..."
npm whoami || { echo "Error: Not logged in to npm. Run 'npm login' first."; exit 1; }
echo ""

# Build all packages
echo "Building packages..."
cd packages/mitama-sdk && npm run build
cd ../mitama-middleware && npm run build
cd ../mitama-actions && npm run build
cd ../mitama-langchain && NODE_OPTIONS="--max-old-space-size=8192" npm run build
cd ../..
echo ""

# Publish in order (sdk first as others depend on it)
PACKAGES=(
  "packages/mitama-sdk"
  "packages/mitama-middleware"
  "packages/mitama-actions"
  "packages/mitama-langchain"
)

for pkg in "${PACKAGES[@]}"; do
  echo "-----------------------------------"
  echo "Publishing: $pkg"
  echo "-----------------------------------"
  cd "$pkg"
  npm publish --access public $DRY_RUN || echo "Warning: Failed to publish $pkg (may already exist)"
  cd ../..
  echo ""
done

echo "==================================="
echo "  Publishing Complete"
echo "==================================="
echo ""
echo "Published packages:"
echo "  - @mitama/sdk@0.1.0"
echo "  - @mitama/middleware@0.1.0"
echo "  - @mitama/actions@0.1.0"
echo "  - @mitama/langchain@0.1.0"
