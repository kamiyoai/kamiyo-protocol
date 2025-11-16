"""
Test Runner
Runs all unit and integration tests with coverage reporting
"""

import sys
import unittest
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def run_unit_tests():
    """Run all unit tests"""
    print("=" * 70)
    print("RUNNING UNIT TESTS")
    print("=" * 70)

    loader = unittest.TestLoader()
    suite = loader.discover('tests/unit', pattern='test_*.py')

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return result


def run_integration_tests():
    """Run all integration tests"""
    print("\n" + "=" * 70)
    print("RUNNING INTEGRATION TESTS")
    print("=" * 70)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add specific integration tests
    integration_tests = [
        'tests.test_production_readiness',
        'tests.test_historical_hlp_incident'
    ]

    for test_module in integration_tests:
        try:
            tests = loader.loadTestsFromName(test_module)
            suite.addTests(tests)
        except Exception as e:
            print(f"Warning: Could not load {test_module}: {e}")

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return result


def print_summary(unit_result, integration_result):
    """Print test summary"""
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)

    unit_total = unit_result.testsRun
    unit_failures = len(unit_result.failures)
    unit_errors = len(unit_result.errors)
    unit_passed = unit_total - unit_failures - unit_errors

    integration_total = integration_result.testsRun
    integration_failures = len(integration_result.failures)
    integration_errors = len(integration_result.errors)
    integration_passed = integration_total - integration_failures - integration_errors

    print(f"\nUnit Tests:")
    print(f"  Total:    {unit_total}")
    print(f"  Passed:   {unit_passed}")
    print(f"  Failed:   {unit_failures}")
    print(f"  Errors:   {unit_errors}")

    print(f"\nIntegration Tests:")
    print(f"  Total:    {integration_total}")
    print(f"  Passed:   {integration_passed}")
    print(f"  Failed:   {integration_failures}")
    print(f"  Errors:   {integration_errors}")

    total_tests = unit_total + integration_total
    total_passed = unit_passed + integration_passed
    total_failed = unit_failures + integration_failures
    total_errors = unit_errors + integration_errors

    print(f"\nOverall:")
    print(f"  Total:    {total_tests}")
    print(f"  Passed:   {total_passed}")
    print(f"  Failed:   {total_failed}")
    print(f"  Errors:   {total_errors}")

    if total_tests > 0:
        pass_rate = (total_passed / total_tests) * 100
        print(f"  Pass Rate: {pass_rate:.1f}%")

    print("=" * 70)

    # Return exit code
    if total_failed == 0 and total_errors == 0:
        print("\n✅ ALL TESTS PASSED!")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED!")
        return 1


def main():
    """Main test runner"""
    print("KAMIYO Hyperliquid - Test Suite")
    print("Running all tests...\n")

    # Run unit tests
    unit_result = run_unit_tests()

    # Run integration tests
    integration_result = run_integration_tests()

    # Print summary
    exit_code = print_summary(unit_result, integration_result)

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
