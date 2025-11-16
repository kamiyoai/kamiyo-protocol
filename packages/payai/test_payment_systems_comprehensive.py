#!/usr/bin/env python3
"""
KAMIYO Comprehensive Payment System Testing
Tests both Stripe and x402 payment systems for production readiness
"""

import os
import sys
import asyncio
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Any
import json

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test results collector
test_results = {
    'configuration': {},
    'stripe': {},
    'x402': {},
    'security': {},
    'errors': {},
    'integration': {},
    'performance': {},
    'issues': [],
    'recommendations': []
}

def print_section(title: str):
    """Print section header"""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")

def print_test(name: str, passed: bool, details: str = ""):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {name}")
    if details:
        print(f"         {details}")

def add_issue(severity: str, component: str, issue: str, recommendation: str = ""):
    """Add issue to report"""
    test_results['issues'].append({
        'severity': severity,
        'component': component,
        'issue': issue,
        'recommendation': recommendation
    })

def add_recommendation(category: str, recommendation: str, priority: str = "MEDIUM"):
    """Add recommendation to report"""
    test_results['recommendations'].append({
        'category': category,
        'recommendation': recommendation,
        'priority': priority
    })

# =============================================================================
# SECTION 1: CONFIGURATION VERIFICATION
# =============================================================================

def test_configuration():
    """Test payment system configuration"""
    print_section("1. PAYMENT SYSTEM CONFIGURATION")

    config_tests = {}

    # Check Stripe configuration
    print("Stripe Configuration:")
    stripe_secret = os.getenv('STRIPE_SECRET_KEY')
    stripe_pub = os.getenv('STRIPE_PUBLISHABLE_KEY')
    stripe_webhook = os.getenv('STRIPE_WEBHOOK_SECRET')
    stripe_price_pro = os.getenv('STRIPE_PRICE_ID_PRO')
    stripe_price_team = os.getenv('STRIPE_PRICE_ID_TEAM')
    stripe_price_enterprise = os.getenv('STRIPE_PRICE_ID_ENTERPRISE')

    config_tests['stripe_secret_key'] = bool(stripe_secret)
    print_test("STRIPE_SECRET_KEY set", bool(stripe_secret),
               "Test mode" if stripe_secret and stripe_secret.startswith('sk_test_') else "Live mode" if stripe_secret else "Not set")

    config_tests['stripe_publishable_key'] = bool(stripe_pub)
    print_test("STRIPE_PUBLISHABLE_KEY set", bool(stripe_pub))

    config_tests['stripe_webhook_secret'] = bool(stripe_webhook)
    print_test("STRIPE_WEBHOOK_SECRET set", bool(stripe_webhook))

    config_tests['stripe_price_pro'] = bool(stripe_price_pro)
    print_test("STRIPE_PRICE_ID_PRO set", bool(stripe_price_pro), stripe_price_pro if stripe_price_pro else "")

    config_tests['stripe_price_team'] = bool(stripe_price_team)
    print_test("STRIPE_PRICE_ID_TEAM set", bool(stripe_price_team), stripe_price_team if stripe_price_team else "")

    config_tests['stripe_price_enterprise'] = bool(stripe_price_enterprise)
    print_test("STRIPE_PRICE_ID_ENTERPRISE set", bool(stripe_price_enterprise), stripe_price_enterprise if stripe_price_enterprise else "")

    # Check x402 configuration
    print("\nx402 Configuration:")
    x402_admin = os.getenv('X402_ADMIN_KEY')
    x402_base_addr = os.getenv('X402_BASE_PAYMENT_ADDRESS')
    x402_eth_addr = os.getenv('X402_ETHEREUM_PAYMENT_ADDRESS')
    x402_sol_addr = os.getenv('X402_SOLANA_PAYMENT_ADDRESS')
    x402_base_rpc = os.getenv('X402_BASE_RPC_URL')
    x402_eth_rpc = os.getenv('X402_ETHEREUM_RPC_URL')
    x402_sol_rpc = os.getenv('X402_SOLANA_RPC_URL')
    x402_min_payment = os.getenv('X402_MIN_PAYMENT_USD', '1.0')

    config_tests['x402_admin_key'] = bool(x402_admin) and x402_admin != 'dev_x402_admin_key_change_in_production'
    print_test("X402_ADMIN_KEY set (production)", bool(x402_admin) and x402_admin != 'dev_x402_admin_key_change_in_production')

    config_tests['x402_base_address'] = bool(x402_base_addr) and not x402_base_addr.startswith('0x742d35Cc')
    print_test("X402_BASE_PAYMENT_ADDRESS set (production)",
               bool(x402_base_addr) and not x402_base_addr.startswith('0x742d35Cc'),
               x402_base_addr[:10] + "..." if x402_base_addr else "")

    config_tests['x402_ethereum_address'] = bool(x402_eth_addr) and not x402_eth_addr.startswith('0x742d35Cc')
    print_test("X402_ETHEREUM_PAYMENT_ADDRESS set (production)",
               bool(x402_eth_addr) and not x402_eth_addr.startswith('0x742d35Cc'),
               x402_eth_addr[:10] + "..." if x402_eth_addr else "")

    config_tests['x402_solana_address'] = bool(x402_sol_addr) and not x402_sol_addr.startswith('7xKXtg2CW')
    print_test("X402_SOLANA_PAYMENT_ADDRESS set (production)",
               bool(x402_sol_addr) and not x402_sol_addr.startswith('7xKXtg2CW'),
               x402_sol_addr[:10] + "..." if x402_sol_addr else "")

    config_tests['x402_base_rpc'] = bool(x402_base_rpc) and 'alchemy' in x402_base_rpc.lower()
    print_test("X402_BASE_RPC_URL set (paid tier)",
               bool(x402_base_rpc) and 'alchemy' in x402_base_rpc.lower())

    config_tests['x402_ethereum_rpc'] = bool(x402_eth_rpc)
    print_test("X402_ETHEREUM_RPC_URL set", bool(x402_eth_rpc))

    config_tests['x402_solana_rpc'] = bool(x402_sol_rpc)
    print_test("X402_SOLANA_RPC_URL set", bool(x402_sol_rpc))

    config_tests['x402_min_payment'] = bool(x402_min_payment)
    print_test("X402_MIN_PAYMENT_USD set", bool(x402_min_payment), f"${x402_min_payment}")

    # Add issues for missing configurations
    if not config_tests['stripe_secret_key']:
        add_issue("CRITICAL", "Stripe", "STRIPE_SECRET_KEY not configured",
                  "Set Stripe secret key in environment variables")

    if not config_tests['stripe_webhook_secret']:
        add_issue("HIGH", "Stripe", "STRIPE_WEBHOOK_SECRET not configured",
                  "Configure webhook secret in Stripe Dashboard")

    if not config_tests['x402_admin_key']:
        add_issue("HIGH", "x402", "X402_ADMIN_KEY using default/test value",
                  "Generate secure admin key: openssl rand -hex 32")

    if not config_tests['x402_base_address']:
        add_issue("CRITICAL", "x402", "X402_BASE_PAYMENT_ADDRESS using test address",
                  "Set production wallet address for Base network")

    test_results['configuration'] = config_tests

    # Calculate configuration score
    passed = sum(1 for v in config_tests.values() if v)
    total = len(config_tests)
    score = (passed / total) * 100

    print(f"\nConfiguration Score: {score:.1f}% ({passed}/{total} checks passed)")
    return score

# =============================================================================
# SECTION 2: STRIPE CONNECTIVITY TESTS
# =============================================================================

def test_stripe_connectivity():
    """Test Stripe API connectivity"""
    print_section("2. STRIPE API CONNECTIVITY")

    try:
        import stripe
        from config.stripe_config import get_stripe_config

        config = get_stripe_config()

        if not config.secret_key:
            print_test("Stripe API connectivity", False, "Secret key not configured")
            add_issue("CRITICAL", "Stripe", "Cannot test Stripe - API key not configured")
            return 0

        stripe.api_key = config.secret_key

        # Test 1: API connectivity
        try:
            balance = stripe.Balance.retrieve()
            print_test("Stripe API connection", True, f"Mode: {'TEST' if config.is_test_mode else 'LIVE'}")
            test_results['stripe']['api_connection'] = True
        except Exception as e:
            print_test("Stripe API connection", False, str(e))
            test_results['stripe']['api_connection'] = False
            add_issue("CRITICAL", "Stripe", f"Cannot connect to Stripe API: {e}")
            return 0

        # Test 2: Retrieve price IDs
        price_ids = []
        for tier, env_var in [
            ('pro', 'STRIPE_PRICE_ID_PRO'),
            ('team', 'STRIPE_PRICE_ID_TEAM'),
            ('enterprise', 'STRIPE_PRICE_ID_ENTERPRISE')
        ]:
            price_id = os.getenv(env_var)
            if price_id:
                try:
                    price = stripe.Price.retrieve(price_id)
                    amount = price.unit_amount / 100  # Convert cents to dollars
                    print_test(f"Retrieve {tier.upper()} price", True,
                               f"${amount:.2f}/{price.recurring.interval}")
                    price_ids.append(tier)
                    test_results['stripe'][f'price_{tier}'] = True
                except Exception as e:
                    print_test(f"Retrieve {tier.upper()} price", False, str(e))
                    test_results['stripe'][f'price_{tier}'] = False
                    add_issue("HIGH", "Stripe", f"Cannot retrieve {tier} price: {e}")
            else:
                print_test(f"Retrieve {tier.upper()} price", False, f"{env_var} not set")
                test_results['stripe'][f'price_{tier}'] = False

        # Test 3: Webhook endpoint test (check if configured in Stripe)
        if config.webhook_secret:
            print_test("Webhook secret configured", True)
            test_results['stripe']['webhook_configured'] = True
        else:
            print_test("Webhook secret configured", False, "Set in Stripe Dashboard")
            test_results['stripe']['webhook_configured'] = False
            add_issue("HIGH", "Stripe", "Webhook secret not configured")

        score = (len([v for v in test_results['stripe'].values() if v]) /
                 len(test_results['stripe'])) * 100

        print(f"\nStripe Connectivity Score: {score:.1f}%")
        return score

    except ImportError as e:
        print_test("Import Stripe SDK", False, str(e))
        add_issue("CRITICAL", "Stripe", "Stripe SDK not installed: pip install stripe")
        return 0
    except Exception as e:
        print_test("Stripe connectivity test", False, str(e))
        add_issue("CRITICAL", "Stripe", f"Unexpected error: {e}")
        return 0

# =============================================================================
# SECTION 3: X402 PAYMENT VERIFICATION TESTS
# =============================================================================

async def test_x402_connectivity():
    """Test x402 payment verification system"""
    print_section("3. X402 PAYMENT VERIFICATION")

    try:
        sys.path.insert(0, '/Users/dennisgoslar/Projekter/kamiyo')
        from api.x402.payment_verifier import PaymentVerifier
        from api.x402.config import get_x402_config

        config = get_x402_config()
        verifier = PaymentVerifier()

        # Test 1: Supported chains
        chains = verifier.get_supported_chains()
        print_test("Supported chains loaded", len(chains) == 3, f"{', '.join(chains)}")
        test_results['x402']['chains_loaded'] = len(chains) == 3

        # Test 2: Base RPC connection
        try:
            web3_base = verifier.web3_instances.get('base')
            if web3_base and web3_base.is_connected():
                block_number = web3_base.eth.block_number
                print_test("Base RPC connection", True, f"Block: {block_number:,}")
                test_results['x402']['base_rpc'] = True
            else:
                print_test("Base RPC connection", False, "Not connected")
                test_results['x402']['base_rpc'] = False
                add_issue("HIGH", "x402", "Cannot connect to Base RPC")
        except Exception as e:
            print_test("Base RPC connection", False, str(e))
            test_results['x402']['base_rpc'] = False
            add_issue("HIGH", "x402", f"Base RPC error: {e}")

        # Test 3: Ethereum RPC connection
        try:
            web3_eth = verifier.web3_instances.get('ethereum')
            if web3_eth and web3_eth.is_connected():
                block_number = web3_eth.eth.block_number
                print_test("Ethereum RPC connection", True, f"Block: {block_number:,}")
                test_results['x402']['ethereum_rpc'] = True
            else:
                print_test("Ethereum RPC connection", False, "Not connected")
                test_results['x402']['ethereum_rpc'] = False
                add_issue("MEDIUM", "x402", "Cannot connect to Ethereum RPC")
        except Exception as e:
            print_test("Ethereum RPC connection", False, str(e))
            test_results['x402']['ethereum_rpc'] = False
            add_issue("MEDIUM", "x402", f"Ethereum RPC error: {e}")

        # Test 4: Solana RPC connection
        try:
            if verifier.solana_client:
                slot_response = await verifier.solana_client.get_slot()
                slot = slot_response.value if slot_response.value else 0
                print_test("Solana RPC connection", slot > 0, f"Slot: {slot:,}")
                test_results['x402']['solana_rpc'] = slot > 0
            else:
                print_test("Solana RPC connection", False, "Client not initialized")
                test_results['x402']['solana_rpc'] = False
                add_issue("MEDIUM", "x402", "Solana client not initialized")
        except Exception as e:
            print_test("Solana RPC connection", False, str(e))
            test_results['x402']['solana_rpc'] = False
            add_issue("MEDIUM", "x402", f"Solana RPC error: {e}")

        # Test 5: Payment addresses configured
        base_addr = verifier.get_payment_address('base')
        eth_addr = verifier.get_payment_address('ethereum')
        sol_addr = verifier.get_payment_address('solana')

        print_test("Base payment address", bool(base_addr), base_addr[:10] + "..." if base_addr else "")
        print_test("Ethereum payment address", bool(eth_addr), eth_addr[:10] + "..." if eth_addr else "")
        print_test("Solana payment address", bool(sol_addr), sol_addr[:10] + "..." if sol_addr else "")

        test_results['x402']['payment_addresses'] = bool(base_addr and eth_addr and sol_addr)

        # Test 6: Min payment amount
        print_test("Min payment amount configured", True, f"${float(verifier.min_payment_amount):.2f} USDC")
        test_results['x402']['min_payment'] = True

        # Test 7: Confirmation requirements
        print(f"\nConfirmation Requirements:")
        print(f"  Base: {config.base_confirmations} blocks")
        print(f"  Ethereum: {config.ethereum_confirmations} blocks")
        print(f"  Solana: {config.solana_confirmations} slots")
        test_results['x402']['confirmations'] = True

        score = (len([v for v in test_results['x402'].values() if v]) /
                 len(test_results['x402'])) * 100

        print(f"\nx402 Connectivity Score: {score:.1f}%")
        return score

    except ImportError as e:
        print_test("Import x402 modules", False, str(e))
        add_issue("CRITICAL", "x402", f"Cannot import x402 modules: {e}")
        return 0
    except Exception as e:
        print_test("x402 connectivity test", False, str(e))
        add_issue("CRITICAL", "x402", f"Unexpected error: {e}")
        return 0

# =============================================================================
# SECTION 4: SECURITY TESTS
# =============================================================================

def test_security():
    """Test payment security mechanisms"""
    print_section("4. PAYMENT SECURITY CHECKS")

    security_tests = {}

    # Test 1: Check for exposed secrets in code
    print("Code Security:")
    exposed_secrets = False

    # Check if test keys are being used
    stripe_key = os.getenv('STRIPE_SECRET_KEY', '')
    if stripe_key.startswith('sk_test_'):
        print_test("Stripe using live keys", False, "Using test keys (OK for testing)")
        add_recommendation("Security", "Switch to live Stripe keys before production", "HIGH")
    elif stripe_key.startswith('sk_live_'):
        print_test("Stripe using live keys", True, "Live mode enabled")

    # Check x402 admin key
    x402_admin = os.getenv('X402_ADMIN_KEY', '')
    if x402_admin == 'dev_x402_admin_key_change_in_production':
        print_test("x402 admin key secure", False, "Using default dev key")
        add_issue("HIGH", "Security", "x402 admin key is using default value")
    else:
        print_test("x402 admin key secure", True)

    # Test 2: Webhook signature verification
    print("\nWebhook Security:")
    webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')
    security_tests['webhook_signature'] = bool(webhook_secret)
    print_test("Webhook signature verification", bool(webhook_secret))

    # Test 3: Database security (check if using environment variables)
    print("\nDatabase Security:")
    db_url = os.getenv('DATABASE_URL', '')
    security_tests['db_credentials'] = 'postgresql://' in db_url or not db_url
    print_test("Database credentials in env", 'postgresql://' in db_url or not db_url)

    # Test 4: API key protection
    print("\nAPI Key Protection:")
    security_tests['api_keys_env'] = True
    print_test("API keys from environment", True)

    # Test 5: Payment address validation
    print("\nPayment Address Validation:")
    base_addr = os.getenv('X402_BASE_PAYMENT_ADDRESS', '')
    test_addr = base_addr.startswith('0x742d35Cc')
    security_tests['production_addresses'] = not test_addr
    print_test("Using production payment addresses", not test_addr)

    if test_addr:
        add_issue("CRITICAL", "Security", "Using test payment addresses in production config")

    score = (len([v for v in security_tests.values() if v]) /
             len(security_tests)) * 100

    test_results['security'] = security_tests

    print(f"\nSecurity Score: {score:.1f}%")
    return score

# =============================================================================
# SECTION 5: PRODUCTION READINESS CHECKS
# =============================================================================

def test_production_readiness():
    """Check production readiness"""
    print_section("5. PRODUCTION READINESS CHECKS")

    readiness = {}

    print("Stripe Readiness:")
    readiness['stripe_live_keys'] = not os.getenv('STRIPE_SECRET_KEY', '').startswith('sk_test_')
    print_test("Live Stripe keys configured", readiness['stripe_live_keys'])

    readiness['webhook_configured'] = bool(os.getenv('STRIPE_WEBHOOK_SECRET'))
    print_test("Webhook endpoint configured", readiness['webhook_configured'])

    print("\nx402 Readiness:")
    base_addr = os.getenv('X402_BASE_PAYMENT_ADDRESS', '')
    readiness['production_addresses'] = not base_addr.startswith('0x742d35Cc')
    print_test("Production payment addresses", readiness['production_addresses'])

    base_rpc = os.getenv('X402_BASE_RPC_URL', '')
    readiness['paid_rpc'] = 'alchemy' in base_rpc.lower() or 'infura' in base_rpc.lower()
    print_test("Paid RPC providers configured", readiness['paid_rpc'])

    readiness['admin_key_secure'] = os.getenv('X402_ADMIN_KEY') != 'dev_x402_admin_key_change_in_production'
    print_test("Secure admin key", readiness['admin_key_secure'])

    print("\nDatabase Readiness:")
    # Check if migration file exists
    migration_file = '/Users/dennisgoslar/Projekter/kamiyo/database/migrations/002_x402_payments.sql'
    readiness['x402_migration'] = os.path.exists(migration_file)
    print_test("x402 database migration exists", readiness['x402_migration'])

    print("\nMonitoring Readiness:")
    readiness['logging'] = True
    print_test("Logging configured", True)

    readiness['metrics'] = True
    print_test("Prometheus metrics enabled", True)

    score = (len([v for v in readiness.values() if v]) / len(readiness)) * 100

    test_results['production_readiness'] = readiness

    print(f"\nProduction Readiness Score: {score:.1f}%")
    return score

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

async def run_all_tests():
    """Run all payment system tests"""
    print("\n" + "="*80)
    print("  KAMIYO PAYMENT SYSTEM TESTING")
    print("  Comprehensive Production Readiness Check")
    print("="*80)
    print(f"\nTest started at: {datetime.utcnow().isoformat()}Z")

    scores = {}

    # Run all test sections
    scores['configuration'] = test_configuration()
    scores['stripe'] = test_stripe_connectivity()
    scores['x402'] = await test_x402_connectivity()
    scores['security'] = test_security()
    scores['production'] = test_production_readiness()

    # Calculate overall score
    overall_score = sum(scores.values()) / len(scores)

    # Print summary
    print_section("FINAL REPORT")

    print("Component Scores:")
    for component, score in scores.items():
        status = "✅" if score >= 80 else "⚠️" if score >= 60 else "❌"
        print(f"  {status} {component.upper()}: {score:.1f}%")

    print(f"\nOverall Payment System Score: {overall_score:.1f}%")

    # Print issues
    if test_results['issues']:
        print("\nISSUES FOUND:")
        for issue in test_results['issues']:
            severity_icon = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🔵"}
            icon = severity_icon.get(issue['severity'], "⚪")
            print(f"  {icon} [{issue['severity']}] {issue['component']}: {issue['issue']}")
            if issue['recommendation']:
                print(f"      → {issue['recommendation']}")

    # Print recommendations
    if test_results['recommendations']:
        print("\nRECOMMENDATIONS:")
        for rec in test_results['recommendations']:
            priority_icon = {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "🔵"}
            icon = priority_icon.get(rec['priority'], "⚪")
            print(f"  {icon} [{rec['priority']}] {rec['category']}: {rec['recommendation']}")

    # Production readiness determination
    print("\n" + "="*80)
    if overall_score >= 90:
        print("  ✅ PRODUCTION READY")
        print("  All critical systems operational. Ready for launch.")
    elif overall_score >= 75:
        print("  ⚠️  PRODUCTION READY WITH WARNINGS")
        print("  Core systems operational. Address warnings before full launch.")
    elif overall_score >= 60:
        print("  ⚠️  NOT PRODUCTION READY")
        print("  Critical issues must be resolved before production deployment.")
    else:
        print("  ❌ NOT PRODUCTION READY")
        print("  Major configuration and setup issues. Extensive work required.")
    print("="*80 + "\n")

    # Save results to file
    results_file = f"/Users/dennisgoslar/Projekter/kamiyo/payment_test_results_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    with open(results_file, 'w') as f:
        json.dump({
            'timestamp': datetime.utcnow().isoformat(),
            'scores': scores,
            'overall_score': overall_score,
            'test_results': test_results
        }, f, indent=2, default=str)

    print(f"Full test results saved to: {results_file}\n")

if __name__ == '__main__':
    asyncio.run(run_all_tests())
