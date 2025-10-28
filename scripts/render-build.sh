#!/bin/bash
# ============================================================================
# Render.com Build Script for Next.js Frontend
# Fixes platform-specific dependency issues on Linux build environment
# ============================================================================

set -e  # Exit on any error

echo "==> KAMIYO Frontend Build Script"
echo "==> Removing platform-specific package-lock.json..."
rm -f package-lock.json

echo "==> Installing dependencies with --legacy-peer-deps..."
npm install --legacy-peer-deps

echo "==> Generating Prisma client..."
npx prisma generate

echo "==> Running Prisma migrations..."
npx prisma migrate deploy

echo "==> Building Next.js application..."
npm run build

echo "==> Build completed successfully!"
