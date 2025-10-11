#!/bin/bash
# Script to prepare databases for production

set -e

echo "==> Preparing production databases..."

# Update Prisma schema to use PostgreSQL for production
echo "==> Configuring Prisma for PostgreSQL..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS sed syntax
    sed -i '' 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
else
    # Linux sed syntax (for Render)
    sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
fi
echo "==> Prisma schema updated to PostgreSQL"

# Create data directory if it doesn't exist
mkdir -p /opt/render/project/src/data

# Check if exploit database exists in the mounted disk
if [ ! -f "/opt/render/project/src/data/kamiyo.db" ]; then
    echo "==> Exploit database not found in persistent disk"

    # Check if we have a database in the repo to copy
    if [ -f "./data/kamiyo.db" ]; then
        echo "==> Copying exploit database from repo to persistent disk..."
        cp ./data/kamiyo.db /opt/render/project/src/data/kamiyo.db
        echo "==> Database copied successfully"
    else
        echo "==> Creating empty exploit database..."
        touch /opt/render/project/src/data/kamiyo.db
        echo "==> Empty database created - will need to be populated"
    fi
else
    echo "==> Exploit database already exists in persistent disk"
fi

echo "==> Database preparation complete"
