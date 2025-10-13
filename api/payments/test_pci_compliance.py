#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PCI Compliance Test Suite
Tests all P0 PCI compliance fixes to ensure they work correctly

Run with: python test_pci_compliance.py

Tests:
1. Distributed Circuit Breaker (Redis + Fallback)
2. PCI Logging Filter (Redaction patterns)
3. Database RLS (Would require database connection)
"""

import os
import sys
import time
import logging

# Add parent directories to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Configure logging for tests
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


class TestResult:
    """Track test results"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def record_pass(self, test_name: str):
        self.passed += 1
        print(f"✓ PASS: {test_name}")

    def record_fail(self, test_name: str, error: str):
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        print(f"✗ FAIL: {test_name}")
        print(f"  Error: {error}")

    def summary(self):
        total = self.passed + self.failed
        print("\n" + "=" * 60)
        print(f"TEST SUMMARY: {self.passed}/{total} passed")
        print("=" * 60)

        if self.failed > 0:
            print("\nFailed tests:")
            for error in self.errors:
                print(f"  - {error}")
            return False
        else:
            print("\n✅ All tests passed!")
            return True


# ==========================================
# TEST 1: CIRCUIT BREAKER
# ==========================================

def test_circuit_breaker(results: TestResult):
    """Test distributed circuit breaker functionality"""
    print("\n" + "=" * 60)
    print("TEST 1: DISTRIBUTED CIRCUIT BREAKER")
    print("=" * 60)

    try:
        from api.payments.distributed_circuit_breaker import (
            get_circuit_breaker,
            InMemoryCircuitBreaker,
            RedisCircuitBreaker,
            CircuitState
        )

        # Test 1.1: Factory function returns a circuit breaker
        breaker = get_circuit_breaker(
            service_name="test_service",
            failure_threshold=3,
            timeout_seconds=2
        )

        if breaker is None:
            results.record_fail("Circuit Breaker Creation", "Factory returned None")
            return

        results.record_pass("Circuit Breaker Creation")

        # Test 1.2: Initial state is CLOSED
        status = breaker.get_status()
        if status.get('state') == CircuitState.CLOSED.value or status.get('state') == 'closed':
            results.record_pass("Circuit Breaker Initial State")
        else:
            results.record_fail("Circuit Breaker Initial State", f"Expected CLOSED, got {status.get('state')}")

        # Test 1.3: Successful calls work
        try:
            assert breaker.can_call(), "Should allow calls in CLOSED state"
            breaker.record_success()
            results.record_pass("Circuit Breaker Success Recording")
        except Exception as e:
            results.record_fail("Circuit Breaker Success Recording", str(e))

        # Test 1.4: Circuit opens after threshold failures
        try:
            for i in range(5):
                if breaker.can_call():
                    breaker.record_failure(Exception(f"Test failure {i}"))

            # Check if circuit is now open
            status = breaker.get_status()
            state = status.get('state')

            if state == CircuitState.OPEN.value or state == 'open':
                results.record_pass("Circuit Breaker Opens After Failures")
            else:
                results.record_fail(
                    "Circuit Breaker Opens After Failures",
                    f"Expected OPEN after {5} failures, got {state}"
                )

            # Verify calls are rejected
            if not breaker.can_call():
                results.record_pass("Circuit Breaker Rejects Calls When Open")
            else:
                results.record_fail(
                    "Circuit Breaker Rejects Calls When Open",
                    "Circuit is open but still allowing calls"
                )

        except Exception as e:
            results.record_fail("Circuit Breaker Failure Recording", str(e))

        # Test 1.5: Circuit transitions to HALF_OPEN after timeout
        try:
            print("  Waiting for timeout (3 seconds)...")
            time.sleep(3)

            # Should transition to HALF_OPEN
            if breaker.can_call():
                # Record success to close circuit
                breaker.record_success()

                status = breaker.get_status()
                state = status.get('state')

                if state == CircuitState.CLOSED.value or state == 'closed':
                    results.record_pass("Circuit Breaker Recovery (HALF_OPEN → CLOSED)")
                else:
                    results.record_fail(
                        "Circuit Breaker Recovery",
                        f"Expected CLOSED after recovery, got {state}"
                    )
            else:
                results.record_fail("Circuit Breaker Timeout", "Still blocking after timeout")

        except Exception as e:
            results.record_fail("Circuit Breaker Recovery", str(e))

        # Test 1.6: Get status returns valid data
        try:
            status = breaker.get_status()
            required_keys = ['service', 'state', 'failure_threshold', 'timeout_seconds']

            if all(key in status for key in required_keys):
                results.record_pass("Circuit Breaker Status API")
            else:
                missing = [k for k in required_keys if k not in status]
                results.record_fail(
                    "Circuit Breaker Status API",
                    f"Missing keys: {missing}"
                )

        except Exception as e:
            results.record_fail("Circuit Breaker Status API", str(e))

    except Exception as e:
        results.record_fail("Circuit Breaker Module Import", str(e))


# ==========================================
# TEST 2: PCI LOGGING FILTER
# ==========================================

def test_pci_logging_filter(results: TestResult):
    """Test PCI logging filter redaction patterns"""
    print("\n" + "=" * 60)
    print("TEST 2: PCI LOGGING FILTER")
    print("=" * 60)

    try:
        from api.payments.pci_logging_filter import PCILoggingFilter, TemporaryPCIFilter

        # Test 2.1: Filter creation
        pci_filter = PCILoggingFilter()
        results.record_pass("PCI Filter Creation")

        # Test 2.2: Credit card redaction
        test_cases = [
            ("4111-1111-1111-1111", "[CARD_REDACTED]", "Card with dashes"),
            ("4111 1111 1111 1111", "[CARD_REDACTED]", "Card with spaces"),
            ("4111111111111111", "[CARD_REDACTED]", "Card without separators"),
        ]

        for original, expected, description in test_cases:
            redacted = pci_filter._redact_sensitive_data(original)
            if expected in redacted and original not in redacted:
                results.record_pass(f"Card Redaction: {description}")
            else:
                results.record_fail(
                    f"Card Redaction: {description}",
                    f"Expected '{expected}' in result, got '{redacted}'"
                )

        # Test 2.3: CVV redaction
        cvv_tests = [
            ("cvv:123", "CVV_REDACTED", "CVV with colon"),
            ("CVC=456", "CVV_REDACTED", "CVC with equals"),
        ]

        for original, expected, description in cvv_tests:
            redacted = pci_filter._redact_sensitive_data(original)
            if expected in redacted:
                results.record_pass(f"CVV Redaction: {description}")
            else:
                results.record_fail(
                    f"CVV Redaction: {description}",
                    f"Expected '{expected}' in result, got '{redacted}'"
                )

        # Test 2.4: Stripe ID redaction
        stripe_tests = [
            ("cus_MKPxvWQp8PCd1a", "CUSTOMER_ID_REDACTED", "Customer ID"),
            ("pm_1234567890abcd", "PAYMENT_METHOD_REDACTED", "Payment Method ID"),
            ("pi_1234567890abcd", "PAYMENT_INTENT_REDACTED", "Payment Intent ID"),
            ("sk_live_51234567890abcdefghijk", "STRIPE_SECRET_KEY_REDACTED", "Secret Key"),
        ]

        for original, expected, description in stripe_tests:
            redacted = pci_filter._redact_sensitive_data(original)
            if expected in redacted and original not in redacted:
                results.record_pass(f"Stripe ID Redaction: {description}")
            else:
                results.record_fail(
                    f"Stripe ID Redaction: {description}",
                    f"Expected '{expected}' in result, got '{redacted}'"
                )

        # Test 2.5: Email redaction
        email_test = "customer@example.com"
        redacted = pci_filter._redact_sensitive_data(email_test)
        if "EMAIL_REDACTED" in redacted and email_test not in redacted:
            results.record_pass("Email Redaction")
        else:
            results.record_fail("Email Redaction", f"Got '{redacted}'")

        # Test 2.6: Context manager
        try:
            logger = logging.getLogger('test_pci')
            handler = logging.StreamHandler()
            logger.addHandler(handler)

            with TemporaryPCIFilter(logger_name='test_pci'):
                # This should be filtered
                pass

            results.record_pass("PCI Filter Context Manager")

        except Exception as e:
            results.record_fail("PCI Filter Context Manager", str(e))

        # Test 2.7: Statistics tracking
        stats = pci_filter.get_statistics()
        if 'total_redactions' in stats and 'by_type' in stats:
            results.record_pass("PCI Filter Statistics API")
        else:
            results.record_fail("PCI Filter Statistics API", f"Invalid stats: {stats}")

    except Exception as e:
        results.record_fail("PCI Filter Module Import", str(e))


# ==========================================
# TEST 3: INTEGRATION TEST
# ==========================================

def test_integration(results: TestResult):
    """Test integration between components"""
    print("\n" + "=" * 60)
    print("TEST 3: INTEGRATION TESTS")
    print("=" * 60)

    try:
        from api.payments.pci_logging_filter import setup_pci_compliant_logging

        # Test 3.1: Setup function works
        try:
            test_logger = logging.getLogger('integration_test')
            pci_filter = setup_pci_compliant_logging(
                apply_to_root=False,
                apply_to_loggers=['integration_test']
            )

            if pci_filter is not None:
                results.record_pass("PCI Setup Function")
            else:
                results.record_fail("PCI Setup Function", "Returned None")

        except Exception as e:
            results.record_fail("PCI Setup Function", str(e))

        # Test 3.2: Logging sensitive data gets redacted
        try:
            # Capture log output
            import io
            log_capture = io.StringIO()
            handler = logging.StreamHandler(log_capture)
            test_logger.addHandler(handler)
            test_logger.setLevel(logging.INFO)

            # Log something with a card number
            test_card = "4111-1111-1111-1111"
            test_logger.info(f"Processing payment for card {test_card}")

            # Check log output
            log_output = log_capture.getvalue()

            if test_card not in log_output and "CARD_REDACTED" in log_output:
                results.record_pass("End-to-End Redaction")
            else:
                results.record_fail(
                    "End-to-End Redaction",
                    f"Card number leaked in logs: {log_output}"
                )

        except Exception as e:
            results.record_fail("End-to-End Redaction", str(e))

    except Exception as e:
        results.record_fail("Integration Test Setup", str(e))


# ==========================================
# MAIN TEST RUNNER
# ==========================================

def main():
    """Run all PCI compliance tests"""
    print("\n" + "=" * 60)
    print("PCI COMPLIANCE TEST SUITE")
    print("Testing P0 Security Fixes")
    print("=" * 60)

    results = TestResult()

    # Run test suites
    test_circuit_breaker(results)
    test_pci_logging_filter(results)
    test_integration(results)

    # Print summary
    success = results.summary()

    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
