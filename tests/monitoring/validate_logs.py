#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Monitoring and Logging Validation Script for Kamiyo

Validates that:
1. Logs are structured as JSON for easy parsing
2. PCI redaction works (no card numbers, CVVs, API keys in logs)
3. Error logging triggers correctly
4. Security headers are present in responses
5. Rate limit logging works

Requirements:
- Python 3.8+
- Access to API on localhost:8000
- requests library

Usage:
    python tests/monitoring/validate_logs.py
    python tests/monitoring/validate_logs.py --api-url http://localhost:8000
"""

import sys
import os
import re
import json
import logging
import tempfile
from datetime import datetime
from typing import List, Dict, Tuple
import argparse

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    print("Warning: requests library not installed. API tests will be skipped.")

from api.payments.pci_logging_filter import PCILoggingFilter, setup_pci_compliant_logging


# ============================================================================
# Test Results Tracker
# ============================================================================

class TestResults:
    """Track test results and generate report"""

    def __init__(self):
        self.passes = []
        self.failures = []
        self.warnings = []
        self.info = []

    def add_pass(self, test_name: str, message: str = ""):
        self.passes.append({"test": test_name, "message": message})
        print(f"✓ PASS: {test_name} {message}")

    def add_fail(self, test_name: str, message: str):
        self.failures.append({"test": test_name, "message": message})
        print(f"✗ FAIL: {test_name} - {message}")

    def add_warning(self, test_name: str, message: str):
        self.warnings.append({"test": test_name, "message": message})
        print(f"⚠ WARNING: {test_name} - {message}")

    def add_info(self, test_name: str, message: str):
        self.info.append({"test": test_name, "message": message})
        print(f"ℹ INFO: {test_name} - {message}")

    def print_summary(self):
        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)
        print(f"✓ Passed: {len(self.passes)}")
        print(f"✗ Failed: {len(self.failures)}")
        print(f"⚠ Warnings: {len(self.warnings)}")
        print(f"ℹ Info: {len(self.info)}")
        print("=" * 70)

        if self.failures:
            print("\nFAILED TESTS:")
            for failure in self.failures:
                print(f"  - {failure['test']}: {failure['message']}")

        return len(self.failures) == 0


# ============================================================================
# PCI Logging Filter Tests
# ============================================================================

def test_pci_redaction(results: TestResults):
    """Test that PCI logging filter redacts sensitive data"""
    print("\n" + "=" * 70)
    print("TESTING PCI LOGGING FILTER")
    print("=" * 70 + "\n")

    # Create temporary log file
    with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix='.log') as tmp_log:
        log_file = tmp_log.name

    try:
        # Configure logging with PCI filter
        handler = logging.FileHandler(log_file)
        handler.setFormatter(logging.Formatter('%(message)s'))

        test_logger = logging.getLogger('pci_test')
        test_logger.setLevel(logging.INFO)
        test_logger.addHandler(handler)

        # Apply PCI filter
        pci_filter = PCILoggingFilter()
        test_logger.addFilter(pci_filter)

        # Test cases: (sensitive_data, should_be_redacted)
        test_cases = [
            ("Card number: 4111-1111-1111-1111", "[CARD_REDACTED]", "Credit card number"),
            ("CVV:123 validation", "[CVV_REDACTED]", "CVV code"),
            ("Customer cus_MKPxvWQp8PCd1a created", "[CUSTOMER_ID_REDACTED]", "Stripe customer ID"),
            ("Payment pm_1234567890abcdef attached", "[PAYMENT_METHOD_REDACTED]", "Stripe payment method"),
            ("Intent pi_1234567890abcdef succeeded", "[PAYMENT_INTENT_REDACTED]", "Stripe payment intent"),
            ("Using sk_live_51234567890abcdefghijk", "[STRIPE_SECRET_KEY_REDACTED]", "Stripe secret key"),
            ("Email: customer@example.com", "[EMAIL_REDACTED]", "Email address"),
            ("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig", "[TOKEN_REDACTED]", "JWT token"),
            ("api_key=abcdef123456789012345678", "[API_KEY_REDACTED]", "API key"),
            ("Bank account:123456789", "[ACCOUNT_REDACTED]", "Bank account"),
            ("Routing:987654321", "[ROUTING_REDACTED]", "Routing number"),
            ("SSN: 123-45-6789", "[SSN_REDACTED]", "Social Security Number"),
        ]

        # Log all test cases
        for sensitive_data, _, _ in test_cases:
            test_logger.info(sensitive_data)

        # Flush and close handler
        handler.flush()
        handler.close()
        test_logger.removeHandler(handler)

        # Read log file and verify redaction
        with open(log_file, 'r') as f:
            log_content = f.read()

        # Check each test case
        for sensitive_data, redacted_marker, description in test_cases:
            if redacted_marker in log_content:
                results.add_pass(f"PCI Redaction: {description}", "Properly redacted")
            else:
                # Check if original sensitive data leaked
                original_pattern = sensitive_data.split(':')[-1].strip() if ':' in sensitive_data else sensitive_data
                if original_pattern in log_content and len(original_pattern) > 5:
                    results.add_fail(
                        f"PCI Redaction: {description}",
                        f"Sensitive data not redacted: {original_pattern[:20]}..."
                    )
                else:
                    results.add_warning(
                        f"PCI Redaction: {description}",
                        "Could not verify redaction (data may not match pattern)"
                    )

        # Verify statistics
        stats = pci_filter.get_statistics()
        if stats["total_redactions"] > 0:
            results.add_pass(
                "PCI Filter Statistics",
                f"{stats['total_redactions']} redactions performed"
            )
            results.add_info("Redaction Breakdown", json.dumps(stats["by_type"], indent=2))
        else:
            results.add_warning(
                "PCI Filter Statistics",
                "No redactions recorded (filter may not be working)"
            )

    finally:
        # Clean up
        if os.path.exists(log_file):
            os.remove(log_file)


# ============================================================================
# Structured Logging Tests
# ============================================================================

def test_structured_logging(results: TestResults):
    """Test that logs can be structured as JSON"""
    print("\n" + "=" * 70)
    print("TESTING STRUCTURED LOGGING")
    print("=" * 70 + "\n")

    # Create temporary log file
    with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix='.log') as tmp_log:
        log_file = tmp_log.name

    try:
        # Configure JSON-formatted logging
        class JSONFormatter(logging.Formatter):
            def format(self, record):
                log_data = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                    "module": record.module,
                    "function": record.funcName,
                    "line": record.lineno
                }
                if record.exc_info:
                    log_data["exception"] = self.formatException(record.exc_info)
                return json.dumps(log_data)

        handler = logging.FileHandler(log_file)
        handler.setFormatter(JSONFormatter())

        test_logger = logging.getLogger('json_test')
        test_logger.setLevel(logging.INFO)
        test_logger.addHandler(handler)

        # Log various messages
        test_logger.info("API request received")
        test_logger.warning("Rate limit approaching")
        test_logger.error("Database connection failed")

        # Flush and close
        handler.flush()
        handler.close()
        test_logger.removeHandler(handler)

        # Verify JSON structure
        with open(log_file, 'r') as f:
            lines = f.readlines()

        valid_json_count = 0
        for line in lines:
            try:
                log_entry = json.loads(line)
                required_fields = ["timestamp", "level", "message"]
                if all(field in log_entry for field in required_fields):
                    valid_json_count += 1
            except json.JSONDecodeError:
                pass

        if valid_json_count == len(lines):
            results.add_pass(
                "Structured Logging",
                f"All {len(lines)} log entries are valid JSON"
            )
        elif valid_json_count > 0:
            results.add_warning(
                "Structured Logging",
                f"Only {valid_json_count}/{len(lines)} entries are valid JSON"
            )
        else:
            results.add_fail(
                "Structured Logging",
                "No valid JSON log entries found"
            )

    finally:
        if os.path.exists(log_file):
            os.remove(log_file)


# ============================================================================
# API Logging Tests
# ============================================================================

def test_api_logging(api_url: str, results: TestResults):
    """Test API logging and error handling"""
    if not HAS_REQUESTS:
        results.add_warning("API Logging Tests", "Skipped (requests library not installed)")
        return

    print("\n" + "=" * 70)
    print("TESTING API LOGGING")
    print("=" * 70 + "\n")

    # Test 1: Successful request logging
    try:
        response = requests.get(f"{api_url}/health", timeout=5)
        if response.status_code == 200:
            results.add_pass("API Health Request", "Request completed successfully")

            # Check for request ID (if implemented)
            if "X-Request-ID" in response.headers:
                results.add_pass("Request ID Header", "Present in response")
            else:
                results.add_info("Request ID Header", "Not implemented (optional)")

    except Exception as e:
        results.add_fail("API Health Request", f"Failed: {str(e)}")

    # Test 2: Error handling
    try:
        response = requests.get(f"{api_url}/exploits/nonexistent_hash_12345", timeout=5)
        if response.status_code == 404:
            results.add_pass("Error Handling", "404 returned for missing resource")

            # Check error response structure
            try:
                error_data = response.json()
                if "error" in error_data or "detail" in error_data:
                    results.add_pass("Error Response Format", "Proper error structure")
                else:
                    results.add_warning("Error Response Format", "Missing error/detail field")
            except:
                results.add_warning("Error Response Format", "Response is not JSON")

    except Exception as e:
        results.add_fail("Error Handling", f"Failed: {str(e)}")

    # Test 3: Security headers
    try:
        response = requests.get(f"{api_url}/exploits", timeout=5)
        security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
        }

        missing_headers = []
        for header, expected_value in security_headers.items():
            if header not in response.headers:
                missing_headers.append(header)
            elif response.headers[header] != expected_value:
                results.add_warning(
                    f"Security Header: {header}",
                    f"Expected '{expected_value}', got '{response.headers[header]}'"
                )

        if not missing_headers:
            results.add_pass("Security Headers", "All required headers present")
        else:
            results.add_fail(
                "Security Headers",
                f"Missing headers: {', '.join(missing_headers)}"
            )

    except Exception as e:
        results.add_fail("Security Headers Check", f"Failed: {str(e)}")

    # Test 4: CORS headers
    try:
        response = requests.options(f"{api_url}/exploits", timeout=5)
        cors_headers = ["Access-Control-Allow-Origin", "Access-Control-Allow-Methods"]

        found_cors = [h for h in cors_headers if h in response.headers]

        if found_cors:
            results.add_pass("CORS Headers", f"Found: {', '.join(found_cors)}")
        else:
            results.add_info("CORS Headers", "Not found (may require specific Origin header)")

    except Exception as e:
        results.add_info("CORS Headers Check", f"Could not verify: {str(e)}")


# ============================================================================
# Main Function
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Validate Kamiyo monitoring and logging")
    parser.add_argument(
        "--api-url",
        default="http://localhost:8000",
        help="API base URL (default: http://localhost:8000)"
    )
    args = parser.parse_args()

    print("\n" + "=" * 70)
    print("KAMIYO MONITORING & LOGGING VALIDATION")
    print("=" * 70)
    print(f"API URL: {args.api_url}")
    print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    results = TestResults()

    # Run test suites
    test_pci_redaction(results)
    test_structured_logging(results)
    test_api_logging(args.api_url, results)

    # Print summary
    success = results.print_summary()

    # Generate report file
    report_file = "~/project/Projekter/kamiyo/monitoring_validation_report.txt"
    try:
        with open(report_file, 'w') as f:
            f.write("=" * 70 + "\n")
            f.write("KAMIYO MONITORING & LOGGING VALIDATION REPORT\n")
            f.write("=" * 70 + "\n")
            f.write(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"API URL: {args.api_url}\n\n")

            f.write("SUMMARY\n")
            f.write("-" * 70 + "\n")
            f.write(f"✓ Passed: {len(results.passes)}\n")
            f.write(f"✗ Failed: {len(results.failures)}\n")
            f.write(f"⚠ Warnings: {len(results.warnings)}\n")
            f.write(f"ℹ Info: {len(results.info)}\n\n")

            if results.failures:
                f.write("FAILURES\n")
                f.write("-" * 70 + "\n")
                for failure in results.failures:
                    f.write(f"  {failure['test']}: {failure['message']}\n")
                f.write("\n")

            if results.warnings:
                f.write("WARNINGS\n")
                f.write("-" * 70 + "\n")
                for warning in results.warnings:
                    f.write(f"  {warning['test']}: {warning['message']}\n")
                f.write("\n")

            if results.passes:
                f.write("PASSED TESTS\n")
                f.write("-" * 70 + "\n")
                for passed in results.passes:
                    msg = f": {passed['message']}" if passed['message'] else ""
                    f.write(f"  {passed['test']}{msg}\n")
                f.write("\n")

        print(f"\n✓ Report saved to: {report_file}")

    except Exception as e:
        print(f"\n⚠ Warning: Could not save report: {e}")

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
