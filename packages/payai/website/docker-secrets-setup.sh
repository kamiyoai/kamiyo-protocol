#!/bin/bash
# docker-secrets-setup.sh
# Setup Docker secrets for production deployment

set -e

echo "🔐 Kamiyo Docker Secrets Setup"
echo "=============================="
echo ""

SECRETS_DIR="./secrets"

# Create secrets directory if it doesn't exist
if [ ! -d "$SECRETS_DIR" ]; then
    mkdir -p "$SECRETS_DIR"
    chmod 700 "$SECRETS_DIR"
    echo "✅ Created secrets directory: $SECRETS_DIR"
fi

# Function to create a secret file
create_secret() {
    local secret_name=$1
    local secret_file="${SECRETS_DIR}/${secret_name}.txt"

    if [ -f "$secret_file" ]; then
        echo "⚠️  Secret already exists: $secret_name"
        read -p "   Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return
        fi
    fi

    echo "Creating secret: $secret_name"
    read -sp "   Enter value (hidden): " secret_value
    echo

    if [ -z "$secret_value" ]; then
        echo "   ❌ Empty value, skipping"
        return
    fi

    echo -n "$secret_value" > "$secret_file"
    chmod 600 "$secret_file"
    echo "   ✅ Created: $secret_file"
}

# Generate random secret
generate_random_secret() {
    local secret_name=$1
    local length=${2:-32}
    local secret_file="${SECRETS_DIR}/${secret_name}.txt"

    if [ -f "$secret_file" ]; then
        echo "✅ Secret already exists: $secret_name"
        return
    fi

    echo "Generating random secret: $secret_name"
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-${length} > "$secret_file"
    chmod 600 "$secret_file"
    echo "   ✅ Generated: $secret_file"
}

echo "Setting up required secrets..."
echo ""

# Critical secrets (manual entry)
echo "1. Database Password"
create_secret "db_password"
echo ""

echo "2. Stripe Secret Key"
create_secret "stripe_secret"
echo ""

echo "3. Stripe Webhook Secret"
create_secret "stripe_webhook_secret"
echo ""

# Auto-generated secrets
echo "4. JWT Secret (auto-generated)"
generate_random_secret "jwt_secret" 64
echo ""

echo "5. NextAuth Secret (auto-generated)"
generate_random_secret "nextauth_secret" 64
echo ""

# Optional secrets
echo ""
echo "Optional secrets (press Enter to skip):"
echo ""

echo "6. Google OAuth Client Secret"
read -p "   Enter if using Google OAuth (or press Enter to skip): " -s google_secret
if [ ! -z "$google_secret" ]; then
    echo -n "$google_secret" > "${SECRETS_DIR}/google_client_secret.txt"
    chmod 600 "${SECRETS_DIR}/google_client_secret.txt"
    echo "   ✅ Created"
fi
echo ""

echo "7. Sentry DSN"
read -p "   Enter if using Sentry (or press Enter to skip): " sentry_dsn
if [ ! -z "$sentry_dsn" ]; then
    echo -n "$sentry_dsn" > "${SECRETS_DIR}/sentry_dsn.txt"
    chmod 600 "${SECRETS_DIR}/sentry_dsn.txt"
    echo "   ✅ Created"
fi
echo ""

# Create .gitignore for secrets
cat > "${SECRETS_DIR}/.gitignore" << 'EOF'
# Ignore all secrets
*.txt

# Allow this .gitignore file
!.gitignore
EOF

echo ""
echo "=============================="
echo "✅ Secrets setup complete!"
echo ""
echo "Created secrets:"
ls -lh "$SECRETS_DIR"/*.txt 2>/dev/null | awk '{print "  -", $9}' || echo "  (none created)"
echo ""
echo "⚠️  IMPORTANT:"
echo "  1. Never commit secrets/*.txt files to git"
echo "  2. Backup secrets securely (e.g., password manager)"
echo "  3. For production, use external secrets manager:"
echo "     - AWS Secrets Manager"
echo "     - HashiCorp Vault"
echo "     - Azure Key Vault"
echo ""
echo "Next steps:"
echo "  1. Review docker-compose.secrets.yml"
echo "  2. Run: docker-compose -f docker-compose.yml -f docker-compose.secrets.yml up"
echo ""
