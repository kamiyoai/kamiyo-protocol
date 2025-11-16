#!/bin/bash

# KAMIYO Checkout Issues Fix Script
# Automatically fixes common checkout implementation issues

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "================================================================"
echo "🔧 KAMIYO Checkout Issues Fix Script"
echo "================================================================"
echo ""

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# ==============================================================================
# FIX 1: Install Missing Python Dependencies
# ==============================================================================
print_header "Fix 1: Installing Missing Python Dependencies"

info "Checking for missing Python packages..."

MISSING_PACKAGES=()

# Check each required package
if ! python3 -c "import stripe" 2>/dev/null; then
    MISSING_PACKAGES+=("stripe")
fi

if ! python3 -c "from fastapi import APIRouter" 2>/dev/null; then
    MISSING_PACKAGES+=("fastapi")
fi

if ! python3 -c "from pydantic import BaseModel, EmailStr" 2>/dev/null; then
    MISSING_PACKAGES+=("'pydantic[email]'")
fi

if [ ${#MISSING_PACKAGES[@]} -eq 0 ]; then
    success "All required Python packages are installed"
else
    warn "Missing packages: ${MISSING_PACKAGES[*]}"
    info "Installing missing packages..."

    for package in "${MISSING_PACKAGES[@]}"; do
        echo "Installing $package..."
        pip3 install "$package" || {
            error "Failed to install $package"
            exit 1
        }
    done

    success "All missing packages installed"
fi

# ==============================================================================
# FIX 2: Create Missing .env Variables
# ==============================================================================
print_header "Fix 2: Checking Environment Variables"

if [ ! -f ".env" ]; then
    warn ".env file not found. Creating from .env.example..."

    if [ -f ".env.example" ]; then
        cp .env.example .env
        success ".env file created from .env.example"
        warn "⚠ Please update .env with your actual Stripe credentials!"
    else
        error ".env.example not found. Cannot create .env automatically."
        exit 1
    fi
else
    success ".env file exists"
fi

# Load environment
export $(grep -v '^#' .env | xargs 2>/dev/null || true)

# Check for required variables
REQUIRED_VARS=(
    "STRIPE_SECRET_KEY"
    "STRIPE_PRICE_MCP_PERSONAL"
    "STRIPE_PRICE_MCP_TEAM"
    "STRIPE_PRICE_MCP_ENTERPRISE"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    warn "Missing environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done

    warn "Please add these to your .env file:"
    cat << EOF

# Add to .env:
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PRICE_MCP_PERSONAL=price_your_personal_price_id
STRIPE_PRICE_MCP_TEAM=price_your_team_price_id
STRIPE_PRICE_MCP_ENTERPRISE=price_your_enterprise_price_id

EOF
else
    success "All required environment variables are set"
fi

# ==============================================================================
# FIX 3: Ensure Router is Registered in main.py
# ==============================================================================
print_header "Fix 3: Checking Router Registration in main.py"

if [ ! -f "api/main.py" ]; then
    error "api/main.py not found!"
    exit 1
fi

# Check if checkout module is imported
if ! grep -q "from api.billing import checkout as checkout_routes" api/main.py; then
    warn "Checkout module not imported in main.py"
    info "Adding import..."

    # Find billing routes import line and add checkout import after it
    if grep -q "from api.billing import routes as billing_routes" api/main.py; then
        sed -i.bak '/from api.billing import routes as billing_routes/a\
from api.billing import checkout as checkout_routes
' api/main.py
        success "Added checkout import to main.py"
    else
        warn "Could not find billing routes import. Please add manually:"
        echo "from api.billing import checkout as checkout_routes"
    fi
else
    success "Checkout module already imported"
fi

# Check if router is included
if ! grep -q "app.include_router(checkout_routes.router" api/main.py; then
    warn "Checkout router not registered in main.py"
    info "Adding router registration..."

    # Find billing router include line and add checkout router after it
    if grep -q "app.include_router(billing_routes.router" api/main.py; then
        sed -i.bak '/app.include_router(billing_routes.router.*Billing/a\
app.include_router(checkout_routes.router, tags=["Checkout"])
' api/main.py
        success "Added checkout router to main.py"
    else
        warn "Could not find billing router registration. Please add manually:"
        echo 'app.include_router(checkout_routes.router, tags=["Checkout"])'
    fi
else
    success "Checkout router already registered"
fi

# Remove backup file if created
rm -f api/main.py.bak

# ==============================================================================
# FIX 4: Install Missing Node.js Dependencies
# ==============================================================================
print_header "Fix 4: Checking Node.js Dependencies"

if [ ! -f "package.json" ]; then
    error "package.json not found!"
    exit 1
fi

# Check if stripe is in dependencies
if ! grep -q '"stripe"' package.json; then
    warn "stripe package not in package.json"
    info "Installing stripe..."

    npm install stripe || {
        error "Failed to install stripe package"
        exit 1
    }

    success "stripe package installed"
else
    success "stripe package in dependencies"
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    warn "node_modules not found. Running npm install..."

    npm install || {
        error "npm install failed"
        exit 1
    }

    success "node_modules installed"
else
    success "node_modules directory exists"
fi

# ==============================================================================
# FIX 5: Create Missing Success Page (if needed)
# ==============================================================================
print_header "Fix 5: Checking Success Page"

if [ ! -f "pages/dashboard/success.js" ]; then
    warn "Success page not found at pages/dashboard/success.js"
    info "Creating success page..."

    # Create dashboard directory if it doesn't exist
    mkdir -p pages/dashboard

    # Create success page
    cat > pages/dashboard/success.js << 'EOF'
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function CheckoutSuccess() {
    const router = useRouter();
    const { session_id } = router.query;
    const [orderDetails, setOrderDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (session_id) {
            fetch(`/api/billing/checkout-session/${session_id}`)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to fetch session details');
                    return res.json();
                })
                .then(data => {
                    setOrderDetails(data);
                    setLoading(false);
                })
                .catch(err => {
                    setError(err.message);
                    setLoading(false);
                });
        }
    }, [session_id]);

    return (
        <div className="min-h-screen flex items-center justify-center p-5 bg-black text-white">
            <Head>
                <title>Subscription Successful | KAMIYO</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>

            <div className="max-w-2xl w-full">
                {loading && (
                    <div className="text-center">
                        <p className="text-gray-400">Loading order details...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-900 bg-opacity-20 border border-red-500 p-6 rounded-lg">
                        <h2 className="text-xl font-light mb-2 text-red-400">Error Loading Order</h2>
                        <p className="text-gray-300 mb-4">{error}</p>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="bg-cyan text-black px-6 py-2 rounded hover:bg-cyan-400 transition-colors"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                )}

                {orderDetails && (
                    <div>
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-light mb-4">Subscription Successful!</h1>
                            <p className="text-gray-400">
                                Thank you for subscribing to KAMIYO MCP {orderDetails.tier}!
                            </p>
                        </div>

                        <div className="bg-gray-900 border border-cyan p-6 rounded-lg mb-8">
                            <h2 className="text-xl font-light mb-4 text-cyan">Next Steps:</h2>
                            <ol className="space-y-4 text-sm text-gray-300">
                                <li>1. Check your email for MCP token</li>
                                <li>2. Add KAMIYO to Claude Desktop</li>
                                <li>3. Start using security intelligence</li>
                            </ol>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="flex-1 bg-cyan text-black px-6 py-3 rounded hover:bg-cyan-400 transition-colors"
                            >
                                Go to Dashboard
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
EOF

    success "Success page created at pages/dashboard/success.js"
else
    success "Success page already exists"
fi

# ==============================================================================
# FIX 6: Fix CORS Issues (if needed)
# ==============================================================================
print_header "Fix 6: Checking CORS Configuration"

if grep -q "CORSMiddleware" api/main.py; then
    success "CORS middleware configured"

    # Check if localhost is in allowed origins
    if grep -q 'localhost:3000\|localhost:3001' api/main.py; then
        success "localhost origins configured"
    else
        warn "localhost may not be in ALLOWED_ORIGINS"
        info "Ensure localhost:3000 is in development CORS origins"
    fi
else
    warn "CORS middleware may not be configured"
fi

# ==============================================================================
# FIX 7: Verify Directory Structure
# ==============================================================================
print_header "Fix 7: Verifying Directory Structure"

REQUIRED_DIRS=(
    "api"
    "api/billing"
    "pages"
    "pages/dashboard"
    "components"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        success "$dir exists"
    else
        warn "$dir not found. Creating..."
        mkdir -p "$dir"
        success "$dir created"
    fi
done

# ==============================================================================
# FIX 8: Set File Permissions
# ==============================================================================
print_header "Fix 8: Setting File Permissions"

# Make scripts executable
if [ -f "scripts/test_checkout_flow.sh" ]; then
    chmod +x scripts/test_checkout_flow.sh
    success "test_checkout_flow.sh is executable"
fi

if [ -f "scripts/fix_checkout_issues.sh" ]; then
    chmod +x scripts/fix_checkout_issues.sh
    success "fix_checkout_issues.sh is executable"
fi

# ==============================================================================
# FIX 9: Validate Python Syntax
# ==============================================================================
print_header "Fix 9: Validating Python Syntax"

info "Checking Python syntax..."

PYTHON_FILES=(
    "api/billing/checkout.py"
    "api/main.py"
)

SYNTAX_ERRORS=0

for file in "${PYTHON_FILES[@]}"; do
    if [ -f "$file" ]; then
        if python3 -m py_compile "$file" 2>/dev/null; then
            success "$file syntax is valid"
        else
            error "$file has syntax errors"
            python3 -m py_compile "$file"
            ((SYNTAX_ERRORS++))
        fi
    else
        warn "$file not found (skipping)"
    fi
done

if [ $SYNTAX_ERRORS -eq 0 ]; then
    success "All Python files have valid syntax"
else
    error "$SYNTAX_ERRORS file(s) have syntax errors. Please fix manually."
    exit 1
fi

# ==============================================================================
# SUMMARY
# ==============================================================================
echo ""
echo "================================================================"
echo "📊 FIX SUMMARY"
echo "================================================================"
echo ""

success "All automatic fixes completed!"

echo ""
echo "Next steps:"
echo "1. Review your .env file and add Stripe credentials"
echo "2. Run the test script: ./scripts/test_checkout_flow.sh"
echo "3. Start backend: uvicorn api.main:app --reload"
echo "4. Start frontend: npm run dev"
echo "5. Test checkout flow manually"
echo ""

warn "Manual actions required:"
echo "  - Add Stripe API keys to .env"
echo "  - Create Stripe products and get price IDs"
echo "  - Configure webhook endpoint in Stripe Dashboard"
echo ""

success "Ready to test checkout implementation!"
