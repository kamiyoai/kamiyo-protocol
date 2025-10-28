#!/usr/bin/env python3
"""
KAMIYO Production Configuration Validator
Checks for common security issues before deployment
"""

import os
import sys
from dotenv import load_dotenv

# Colors for output
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
NC = '\033[0m'  # No Color

def print_error(msg):
    print(f"{RED}❌ {msg}{NC}")

def print_warning(msg):
    print(f"{YELLOW}⚠️  {msg}{NC}")

def print_success(msg):
    print(f"{GREEN}✅ {msg}{NC}")

def check_environment():
    """Check ENVIRONMENT variable"""
    env = os.getenv('ENVIRONMENT', 'development')
    if env != 'production':
        print_error(f"ENVIRONMENT is '{env}', must be 'production'")
        return False
    print_success("ENVIRONMENT is set to production")
    return True

def check_stripe():
    """Check Stripe configuration"""
    issues = []

    secret = os.getenv('STRIPE_SECRET_KEY', '')
    if not secret:
        issues.append("STRIPE_SECRET_KEY not set")
    elif secret.startswith('sk_test_'):
        issues.append("Using Stripe TEST key in production! Must use live key (sk_live_...)")
    else:
        print_success("Stripe secret key configured (live mode)")

    publishable = os.getenv('STRIPE_PUBLISHABLE_KEY', '')
    if not publishable:
        issues.append("STRIPE_PUBLISHABLE_KEY not set")
    elif publishable.startswith('pk_test_'):
        issues.append("Using Stripe TEST publishable key! Must use live key (pk_live_...)")
    else:
        print_success("Stripe publishable key configured (live mode)")

    webhook = os.getenv('STRIPE_WEBHOOK_SECRET', '')
    if not webhook:
        print_warning("STRIPE_WEBHOOK_SECRET not set (webhooks won't work)")
    else:
        print_success("Stripe webhook secret configured")

    return len(issues) == 0

def check_x402_config():
    """Check x402 payment configuration"""
    issues = []

    # Check payment addresses
    base_addr = os.getenv('X402_BASE_PAYMENT_ADDRESS', '')
    eth_addr = os.getenv('X402_ETHEREUM_PAYMENT_ADDRESS', '')
    sol_addr = os.getenv('X402_SOLANA_PAYMENT_ADDRESS', '')

    # Default addresses from development
    default_base = '0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7'
    default_eth = '0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7'
    default_sol = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'

    if base_addr == default_base:
        issues.append(f"X402_BASE_PAYMENT_ADDRESS is using default dev address!")
    elif not base_addr:
        issues.append("X402_BASE_PAYMENT_ADDRESS not set")
    else:
        print_success(f"Base payment address: {base_addr[:10]}...{base_addr[-6:]}")

    if eth_addr == default_eth:
        issues.append(f"X402_ETHEREUM_PAYMENT_ADDRESS is using default dev address!")
    elif not eth_addr:
        issues.append("X402_ETHEREUM_PAYMENT_ADDRESS not set")
    else:
        print_success(f"Ethereum payment address: {eth_addr[:10]}...{eth_addr[-6:]}")

    if sol_addr == default_sol:
        issues.append(f"X402_SOLANA_PAYMENT_ADDRESS is using default dev address!")
    elif not sol_addr:
        issues.append("X402_SOLANA_PAYMENT_ADDRESS not set")
    else:
        print_success(f"Solana payment address: {sol_addr[:10]}...{sol_addr[-6:]}")

    # Check RPC endpoints
    base_rpc = os.getenv('X402_BASE_RPC_URL', '')
    eth_rpc = os.getenv('X402_ETHEREUM_RPC_URL', '')

    if 'YOUR-API-KEY' in base_rpc or 'YOUR_ALCHEMY_KEY' in base_rpc:
        issues.append("X402_BASE_RPC_URL contains placeholder API key")
    elif not base_rpc:
        issues.append("X402_BASE_RPC_URL not set")
    else:
        print_success("Base RPC URL configured")

    if 'YOUR-API-KEY' in eth_rpc or 'YOUR_ALCHEMY_KEY' in eth_rpc:
        issues.append("X402_ETHEREUM_RPC_URL contains placeholder API key")
    elif not eth_rpc:
        issues.append("X402_ETHEREUM_RPC_URL not set")
    else:
        print_success("Ethereum RPC URL configured")

    # Check admin key
    admin_key = os.getenv('X402_ADMIN_KEY', '')
    if not admin_key:
        issues.append("X402_ADMIN_KEY not set")
    elif admin_key == 'dev_x402_admin_key_change_in_production':
        issues.append("X402_ADMIN_KEY is using default dev value!")
    elif len(admin_key) < 32:
        issues.append(f"X402_ADMIN_KEY is too short ({len(admin_key)} chars, should be 32+)")
    else:
        print_success("X402 admin key configured (strong)")

    if issues:
        for issue in issues:
            print_error(issue)
        return False

    return True

def check_security():
    """Check security configuration"""
    issues = []

    # Check CSRF secret
    csrf_secret = os.getenv('CSRF_SECRET_KEY', '')
    if not csrf_secret:
        issues.append("CSRF_SECRET_KEY not set")
    elif csrf_secret == 'CHANGE_THIS_IN_PRODUCTION_USE_32_CHARS_MINIMUM':
        issues.append("CSRF_SECRET_KEY is using default value!")
    elif len(csrf_secret) < 32:
        issues.append(f"CSRF_SECRET_KEY is too short ({len(csrf_secret)} chars, should be 32+)")
    else:
        print_success("CSRF secret configured")

    # Check JWT secret
    jwt_secret = os.getenv('JWT_SECRET', '')
    if jwt_secret and len(jwt_secret) < 32:
        print_warning(f"JWT_SECRET is too short ({len(jwt_secret)} chars, should be 32+)")
    elif jwt_secret:
        print_success("JWT secret configured")

    # Check CORS origins
    cors = os.getenv('ALLOWED_ORIGINS', '')
    if 'localhost' in cors.lower():
        print_warning("ALLOWED_ORIGINS contains localhost (should be removed in production)")
    elif cors:
        print_success("CORS origins configured (no localhost)")

    if issues:
        for issue in issues:
            print_error(issue)
        return False

    return True

def check_database():
    """Check database configuration"""
    db_url = os.getenv('DATABASE_URL', '')

    if 'sqlite' in db_url.lower():
        print_warning("Using SQLite database (PostgreSQL recommended for production)")
        return True
    elif 'postgresql' in db_url.lower():
        print_success("Using PostgreSQL database")
        return True
    else:
        print_warning("Database type unclear from DATABASE_URL")
        return True

def check_redis():
    """Check Redis configuration"""
    redis_url = os.getenv('REDIS_URL', '')

    if not redis_url:
        print_warning("REDIS_URL not set (rate limiting will use in-memory)")
        return True
    else:
        print_success("Redis configured")
        return True

def check_monitoring():
    """Check monitoring configuration"""
    sentry_dsn = os.getenv('SENTRY_DSN', '')

    if not sentry_dsn:
        print_warning("SENTRY_DSN not set (no error tracking)")
    else:
        print_success("Sentry error tracking configured")

    return True

def main():
    print("🔒 KAMIYO Production Configuration Validator")
    print("=" * 50)
    print()

    # Load .env.production if it exists
    if os.path.exists('.env.production'):
        print("📄 Loading .env.production")
        load_dotenv('.env.production')
    else:
        print_error(".env.production not found")
        sys.exit(1)

    print()

    # Run all checks
    checks = [
        ("Environment", check_environment),
        ("Stripe Configuration", check_stripe),
        ("x402 Payment System", check_x402_config),
        ("Security Settings", check_security),
        ("Database", check_database),
        ("Redis Cache", check_redis),
        ("Monitoring", check_monitoring),
    ]

    results = []
    for name, check_func in checks:
        print()
        print(f"🔍 Checking {name}...")
        result = check_func()
        results.append((name, result))
        print()

    # Summary
    print("=" * 50)
    print("📊 VALIDATION SUMMARY")
    print("=" * 50)

    critical_failed = []
    warnings = []

    for name, result in results:
        if not result:
            # Check if it's critical
            if name in ["Environment", "Stripe Configuration", "x402 Payment System", "Security Settings"]:
                critical_failed.append(name)
                print_error(f"{name}: FAILED")
            else:
                warnings.append(name)
                print_warning(f"{name}: Warning")
        else:
            print_success(f"{name}: Passed")

    print()

    if critical_failed:
        print_error(f"❌ VALIDATION FAILED - {len(critical_failed)} critical issue(s)")
        print()
        print("Critical issues must be fixed before production deployment:")
        for issue in critical_failed:
            print(f"  - {issue}")
        print()
        sys.exit(1)
    elif warnings:
        print_warning(f"⚠️  VALIDATION PASSED WITH WARNINGS - {len(warnings)} warning(s)")
        print()
        print("Warnings (recommended to fix but not blocking):")
        for warning in warnings:
            print(f"  - {warning}")
        print()
        sys.exit(0)
    else:
        print_success("✅ ALL CHECKS PASSED - Ready for production deployment!")
        sys.exit(0)

if __name__ == '__main__':
    main()
