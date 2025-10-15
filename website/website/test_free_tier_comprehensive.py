#!/usr/bin/env python3
"""
Comprehensive Free Tier Testing for Kamiyo.ai
Tests all API endpoints, rate limiting, data quality, and tier restrictions
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, List
import time

# Configuration
BACKEND_API = "http://localhost:8000"
FRONTEND_URL = "http://localhost:3001"

class TestResults:
    def __init__(self):
        self.passes = []
        self.failures = []
        self.warnings = []
        self.info = []

    def add_pass(self, test_name: str, message: str = ""):
        self.passes.append({"test": test_name, "message": message})
        print(f"✅ PASS: {test_name} {message}")

    def add_fail(self, test_name: str, message: str):
        self.failures.append({"test": test_name, "message": message})
        print(f"❌ FAIL: {test_name} - {message}")

    def add_warning(self, test_name: str, message: str):
        self.warnings.append({"test": test_name, "message": message})
        print(f"⚠️  WARNING: {test_name} - {message}")

    def add_info(self, test_name: str, message: str):
        self.info.append({"test": test_name, "message": message})
        print(f"ℹ️  INFO: {test_name} - {message}")

    def generate_report(self) -> str:
        report = "# Kamiyo.ai Free Tier Comprehensive Test Report\n\n"
        report += f"**Test Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        report += f"## Summary\n\n"
        report += f"- ✅ Passed: {len(self.passes)}\n"
        report += f"- ❌ Failed: {len(self.failures)}\n"
        report += f"- ⚠️  Warnings: {len(self.warnings)}\n"
        report += f"- ℹ️  Info: {len(self.info)}\n\n"

        if self.failures:
            report += "## ❌ Failures\n\n"
            for failure in self.failures:
                report += f"- **{failure['test']}**: {failure['message']}\n"
            report += "\n"

        if self.warnings:
            report += "## ⚠️  Warnings\n\n"
            for warning in self.warnings:
                report += f"- **{warning['test']}**: {warning['message']}\n"
            report += "\n"

        if self.passes:
            report += "## ✅ Passed Tests\n\n"
            for passed in self.passes:
                report += f"- {passed['test']}"
                if passed['message']:
                    report += f": {passed['message']}"
                report += "\n"
            report += "\n"

        if self.info:
            report += "## ℹ️  Additional Information\n\n"
            for info in self.info:
                report += f"- **{info['test']}**: {info['message']}\n"
            report += "\n"

        return report

def test_backend_api(results: TestResults):
    """Test Backend FastAPI endpoints"""
    print("\n" + "="*60)
    print("TESTING BACKEND API (port 8000)")
    print("="*60 + "\n")

    # Test 1: Health check
    try:
        response = requests.get(f"{BACKEND_API}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            results.add_pass("Backend Health", f"Database exploits: {data.get('database_exploits', 'N/A')}")
            results.add_info("Active Sources", f"{data.get('active_sources', 0)}/{data.get('total_sources', 0)}")
        else:
            results.add_fail("Backend Health", f"HTTP {response.status_code}")
    except Exception as e:
        results.add_fail("Backend Health", f"Connection error: {str(e)}")

    # Test 2: Exploits endpoint (anonymous - free tier)
    try:
        response = requests.get(f"{BACKEND_API}/exploits", timeout=5)
        if response.status_code == 200:
            data = response.json()
            exploits = data.get('data', [])

            results.add_pass("Exploits Endpoint", f"Retrieved {len(exploits)} exploits")

            # Check for 24-hour delay (free tier)
            if exploits:
                latest_timestamp = exploits[0].get('date') or exploits[0].get('timestamp')
                if latest_timestamp:
                    latest_date = datetime.fromisoformat(latest_timestamp.replace('Z', '+00:00'))
                    hours_old = (datetime.now(latest_date.tzinfo) - latest_date).total_seconds() / 3600

                    if hours_old >= 24:
                        results.add_pass("24-Hour Delay", f"Latest data is {hours_old:.1f} hours old")
                    else:
                        results.add_warning("24-Hour Delay", f"Latest data is only {hours_old:.1f} hours old (expected >=24)")

                    results.add_info("Latest Exploit Date", latest_timestamp)

            # Check data quality
            missing_tx_hash = sum(1 for e in exploits if not e.get('tx_hash'))
            missing_chain = sum(1 for e in exploits if not e.get('chain'))

            if missing_tx_hash == 0 and missing_chain == 0:
                results.add_pass("Data Quality", "All exploits have tx_hash and chain")
            else:
                results.add_warning("Data Quality", f"{missing_tx_hash} missing tx_hash, {missing_chain} missing chain")
        else:
            results.add_fail("Exploits Endpoint", f"HTTP {response.status_code}")
    except Exception as e:
        results.add_fail("Exploits Endpoint", f"Error: {str(e)}")

    # Test 3: Chains endpoint
    try:
        response = requests.get(f"{BACKEND_API}/chains", timeout=5)
        if response.status_code == 200:
            data = response.json()
            chain_count = data.get('total_chains', 0)
            results.add_pass("Chains Endpoint", f"{chain_count} chains tracked")
        else:
            results.add_fail("Chains Endpoint", f"HTTP {response.status_code}")
    except Exception as e:
        results.add_fail("Chains Endpoint", f"Error: {str(e)}")

    # Test 4: Stats endpoint
    try:
        response = requests.get(f"{BACKEND_API}/stats", timeout=5)
        if response.status_code == 200:
            data = response.json()
            total_loss = data.get('total_loss_usd', 0)
            results.add_pass("Stats Endpoint", f"Total loss tracked: ${total_loss:,.0f}")
        else:
            results.add_fail("Stats Endpoint", f"HTTP {response.status_code}")
    except Exception as e:
        results.add_fail("Stats Endpoint", f"Error: {str(e)}")

    # Test 5: Filtering
    try:
        response = requests.get(f"{BACKEND_API}/exploits?chain=Ethereum&min_amount=1000000", timeout=5)
        if response.status_code == 200:
            data = response.json()
            exploits = data.get('data', [])

            # Verify all results are Ethereum
            ethereum_count = sum(1 for e in exploits if e.get('chain') == 'Ethereum')
            if ethereum_count == len(exploits):
                results.add_pass("Chain Filtering", f"All {len(exploits)} results are Ethereum")
            else:
                results.add_warning("Chain Filtering", f"Only {ethereum_count}/{len(exploits)} are Ethereum")

            # Verify all results meet min_amount
            below_min = sum(1 for e in exploits if (e.get('amount_usd') or 0) < 1000000)
            if below_min == 0:
                results.add_pass("Amount Filtering", "All results >= $1M")
            else:
                results.add_warning("Amount Filtering", f"{below_min} results below $1M threshold")
        else:
            results.add_fail("Filtering", f"HTTP {response.status_code}")
    except Exception as e:
        results.add_fail("Filtering", f"Error: {str(e)}")

    # Test 6: Pagination
    try:
        response = requests.get(f"{BACKEND_API}/exploits?page=1&page_size=10", timeout=5)
        if response.status_code == 200:
            data = response.json()
            exploits = data.get('data', [])

            if len(exploits) <= 10:
                results.add_pass("Pagination", f"Page size respected (got {len(exploits)} items)")
            else:
                results.add_fail("Pagination", f"Page size violated (got {len(exploits)}, expected <=10)")

            if data.get('has_more') is not None:
                results.add_pass("Pagination Metadata", f"has_more: {data['has_more']}")
        else:
            results.add_fail("Pagination", f"HTTP {response.status_code}")
    except Exception as e:
        results.add_fail("Pagination", f"Error: {str(e)}")


def test_frontend_pages(results: TestResults):
    """Test Frontend Next.js pages"""
    print("\n" + "="*60)
    print("TESTING FRONTEND PAGES (port 3001)")
    print("="*60 + "\n")

    pages = {
        "Home Page": "/",
        "Dashboard": "/dashboard",
        "Pricing": "/pricing",
        "About": "/about",
    }

    for page_name, path in pages.items():
        try:
            response = requests.get(f"{FRONTEND_URL}{path}", timeout=5, allow_redirects=False)
            if response.status_code == 200:
                results.add_pass(f"Frontend: {page_name}", f"HTTP 200")
            elif response.status_code in [301, 302, 307, 308]:
                results.add_warning(f"Frontend: {page_name}", f"Redirects to {response.headers.get('Location')}")
            else:
                results.add_fail(f"Frontend: {page_name}", f"HTTP {response.status_code}")
        except Exception as e:
            results.add_fail(f"Frontend: {page_name}", f"Error: {str(e)}")


def test_tier_restrictions(results: TestResults):
    """Test that Free tier restrictions are enforced"""
    print("\n" + "="*60)
    print("TESTING TIER RESTRICTIONS")
    print("="*60 + "\n")

    # Test restricted endpoints (should require higher tier)
    restricted_endpoints = [
        ("/api/v2/analysis/fork-detection", "Fork Analysis"),
        ("/api/v1/user-webhooks", "Webhooks"),
        ("/api/v1/watchlists", "Watchlists"),
    ]

    for endpoint, feature_name in restricted_endpoints:
        try:
            response = requests.get(f"{BACKEND_API}{endpoint}", timeout=5)
            if response.status_code in [401, 403, 404]:
                results.add_pass(f"Restriction: {feature_name}", f"Correctly restricted (HTTP {response.status_code})")
            elif response.status_code == 422:  # Validation error might indicate auth required
                results.add_pass(f"Restriction: {feature_name}", f"Requires authentication (HTTP {response.status_code})")
            else:
                results.add_warning(f"Restriction: {feature_name}", f"Unexpected HTTP {response.status_code}")
        except Exception as e:
            results.add_info(f"Restriction: {feature_name}", f"Cannot test: {str(e)}")


def test_rate_limiting(results: TestResults):
    """Test rate limiting for free tier (100 requests/day)"""
    print("\n" + "="*60)
    print("TESTING RATE LIMITING")
    print("="*60 + "\n")

    # Note: Full rate limit testing would require 100+ requests
    # This is a basic check for rate limit headers

    try:
        response = requests.get(f"{BACKEND_API}/exploits", timeout=5)
        headers = response.headers

        # Check for common rate limit headers
        rate_limit_headers = [
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset'
        ]

        found_headers = [h for h in rate_limit_headers if h in headers]

        if found_headers:
            results.add_pass("Rate Limit Headers", f"Found: {', '.join(found_headers)}")
            for header in found_headers:
                results.add_info(f"Header: {header}", headers[header])
        else:
            results.add_warning("Rate Limit Headers", "No rate limit headers found (may be unauthenticated)")

    except Exception as e:
        results.add_fail("Rate Limiting", f"Error: {str(e)}")


def main():
    print("\n" + "="*60)
    print("KAMIYO.AI FREE TIER COMPREHENSIVE TEST")
    print("="*60 + "\n")

    results = TestResults()

    # Run all test suites
    test_backend_api(results)
    test_frontend_pages(results)
    test_tier_restrictions(results)
    test_rate_limiting(results)

    # Generate and save report
    print("\n" + "="*60)
    print("GENERATING REPORT")
    print("="*60 + "\n")

    report = results.generate_report()

    report_file = "free_tier_comprehensive_report.md"
    with open(report_file, 'w') as f:
        f.write(report)

    print(f"\n✅ Report saved to: {report_file}\n")

    # Print summary
    print("="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"✅ Passed: {len(results.passes)}")
    print(f"❌ Failed: {len(results.failures)}")
    print(f"⚠️  Warnings: {len(results.warnings)}")
    print(f"ℹ️  Info: {len(results.info)}")
    print("="*60 + "\n")

    # Exit with appropriate code
    if results.failures:
        print("⚠️  Some tests failed. Review the report for details.\n")
        return 1
    else:
        print("✅ All tests passed!\n")
        return 0


if __name__ == "__main__":
    exit(main())
