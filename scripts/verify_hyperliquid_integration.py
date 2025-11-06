# -*- coding: utf-8 -*-
"""
Hyperliquid Integration Verification Script
Quickly verify that Hyperliquid sources are properly integrated
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def verify_aggregators():
    """Verify Hyperliquid aggregators are registered"""
    print("=" * 60)
    print("VERIFYING HYPERLIQUID AGGREGATOR INTEGRATION")
    print("=" * 60)
    print()

    try:
        from aggregators.orchestrator import AggregationOrchestrator

        orchestrator = AggregationOrchestrator()
        total_sources = len(orchestrator.aggregators)

        print(f"✅ Total aggregator sources: {total_sources}")

        # Check for Hyperliquid aggregators
        aggregator_names = [agg.name for agg in orchestrator.aggregators]

        if 'hyperliquid_hlp' in aggregator_names:
            print("✅ HLP Vault Monitor (Source #20) found")
        else:
            print("❌ HLP Vault Monitor NOT found")
            return False

        if 'hyperliquid_oracle' in aggregator_names:
            print("✅ Oracle Monitor (Source #21) found")
        else:
            print("❌ Oracle Monitor NOT found")
            return False

        if total_sources >= 21:
            print(f"✅ Source count is correct ({total_sources} >= 21)")
        else:
            print(f"❌ Source count is too low ({total_sources} < 21)")
            return False

        return True

    except Exception as e:
        print(f"❌ Error verifying aggregators: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_api_endpoints():
    """Verify Hyperliquid API endpoints are registered"""
    print()
    print("=" * 60)
    print("VERIFYING HYPERLIQUID API ENDPOINTS")
    print("=" * 60)
    print()

    try:
        from api.main import app

        routes = [route.path for route in app.routes]

        expected_routes = [
            "/hyperliquid/security/dashboard",
            "/hyperliquid/security/hlp-vault",
            "/hyperliquid/security/oracle-deviations",
            "/hyperliquid/security/events",
            "/hyperliquid/info"
        ]

        all_found = True
        for route in expected_routes:
            if route in routes:
                print(f"✅ {route}")
            else:
                print(f"❌ {route} NOT found")
                all_found = False

        if all_found:
            print()
            print(f"✅ All {len(expected_routes)} Hyperliquid endpoints registered")
            return True
        else:
            return False

    except Exception as e:
        print(f"❌ Error verifying API endpoints: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_imports():
    """Verify all Hyperliquid modules can be imported"""
    print()
    print("=" * 60)
    print("VERIFYING MODULE IMPORTS")
    print("=" * 60)
    print()

    modules_to_test = [
        "aggregators.hyperliquid_hlp",
        "aggregators.hyperliquid_oracle",
        "api.hyperliquid"
    ]

    all_imports_ok = True

    for module_name in modules_to_test:
        try:
            __import__(module_name)
            print(f"✅ {module_name}")
        except Exception as e:
            print(f"❌ {module_name}: {e}")
            all_imports_ok = False

    return all_imports_ok


def verify_documentation():
    """Verify integration documentation exists"""
    print()
    print("=" * 60)
    print("VERIFYING DOCUMENTATION")
    print("=" * 60)
    print()

    docs_to_check = [
        ("docs/HYPERLIQUID_INTEGRATION.md", "Integration documentation"),
        ("aggregators/SOURCES.md", "Updated sources list"),
        ("aggregators/hyperliquid_hlp.py", "HLP monitor source code"),
        ("aggregators/hyperliquid_oracle.py", "Oracle monitor source code"),
        ("api/hyperliquid/routes.py", "API endpoints source code")
    ]

    all_docs_exist = True
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    for doc_path, description in docs_to_check:
        full_path = os.path.join(base_path, doc_path)
        if os.path.exists(full_path):
            print(f"✅ {description}: {doc_path}")
        else:
            print(f"❌ {description}: {doc_path} NOT found")
            all_docs_exist = False

    return all_docs_exist


def main():
    """Run all verification checks"""
    print()
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 58 + "║")
    print("║" + "  HYPERLIQUID INTEGRATION VERIFICATION".center(58) + "║")
    print("║" + " " * 58 + "║")
    print("╚" + "=" * 58 + "╝")
    print()

    results = {}

    # Run all checks
    results['imports'] = verify_imports()
    results['aggregators'] = verify_aggregators()
    results['api_endpoints'] = verify_api_endpoints()
    results['documentation'] = verify_documentation()

    # Summary
    print()
    print("=" * 60)
    print("VERIFICATION SUMMARY")
    print("=" * 60)
    print()

    for check_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}  {check_name.replace('_', ' ').title()}")

    total = len(results)
    passed = sum(1 for p in results.values() if p)

    print()
    print(f"Total Checks: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print()

    if passed == total:
        print("=" * 60)
        print("✅ ALL CHECKS PASSED - INTEGRATION VERIFIED")
        print("=" * 60)
        print()
        print("Hyperliquid Security Intelligence is fully integrated!")
        print()
        print("Next steps:")
        print("  1. Run main KAMIYO aggregation: python main.py")
        print("  2. Start API server: python api/main.py")
        print("  3. Test endpoints: curl http://localhost:8000/hyperliquid/info")
        print()
        return 0
    else:
        print("=" * 60)
        print("❌ SOME CHECKS FAILED")
        print("=" * 60)
        print()
        print("Please review the errors above and fix any issues.")
        print()
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
