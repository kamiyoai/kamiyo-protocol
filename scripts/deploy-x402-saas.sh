#!/bin/bash
#
# x402 SaaS Deployment Script for Render
# Prepares database and deploys the x402 Infrastructure SaaS platform

set -e

echo "🚀 x402 Infrastructure SaaS - Deployment Script"
echo "================================================"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    echo "   Please set DATABASE_URL to your PostgreSQL connection string"
    exit 1
fi

echo "✓ DATABASE_URL is configured"

# Generate Prisma Client
echo ""
echo "📦 Generating Prisma Client..."
npx prisma generate

# Run database migrations
echo ""
echo "📊 Running database migrations..."
npx prisma migrate deploy

echo ""
echo "✅ Database migrations applied successfully"

# Check if X402_ADMIN_KEY is set
if [ -z "$X402_ADMIN_KEY" ]; then
    echo ""
    echo "⚠️  WARNING: X402_ADMIN_KEY not set"
    echo "   You'll need this to create tenants"
    echo "   Generate one with: openssl rand -hex 32"
fi

echo ""
echo "================================================"
echo "✅ x402 SaaS deployment preparation complete!"
echo ""
echo "Next steps:"
echo "1. Ensure all environment variables are set in Render dashboard"
echo "2. Deploy your application"
echo "3. Create your first tenant using /api/v1/x402/admin/create-tenant"
echo ""
echo "API Endpoints:"
echo "  POST /api/v1/x402/verify - Verify payments"
echo "  GET  /api/v1/x402/usage - Check usage"
echo "  GET  /api/v1/x402/supported-chains - List chains"
echo "  POST /api/v1/x402/admin/create-tenant - Create tenant (admin)"
echo ""
echo "📚 See X402_SAAS_IMPLEMENTATION.md for full documentation"
echo "================================================"
