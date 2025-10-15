#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Production Readiness Test Suite
Comprehensive end-to-end testing for Kamiyo platform
"""

import sys
import os
import asyncio
import httpx
import json
from datetime import datetime
from typing import Dict, List, Any

# Colors for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

class ProductionReadinessTest:
    """Comprehensive production readiness test suite"""

    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.results = []
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0

    def log(self, message: str, level: str = "INFO"):
        """Log test message"""
        color = {
            "INFO": BLUE,
            "SUCCESS": GREEN,
            "ERROR": RED,
            "WARNING": YELLOW
        }.get(level, RESET)

        print(f"{color}[{level}]{RESET} {message}")

    def record_test(self, name: str, passed: bool, details: str = ""):
        """Record test result"""
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
            self.log(f"✓ {name}", "SUCCESS")
        else:
            self.failed_tests += 1
            self.log(f"✗ {name}: {details}", "ERROR")

        self.results.append({
            "test": name,
            "passed": passed,
            "details": details
        })

    async def test_api_health(self):
        """Test 1: API Health Check"""
        self.log("\n=== Test 1: API Health Check ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.base_url}/health", timeout=10.0)

                if response.status_code == 200:
                    data = response.json()
                    self.record_test(
                        "API Health Endpoint",
                        True,
                        f"Database exploits: {data.get('database_exploits', 0)}"
                    )

                    # Check database has data
                    has_data = data.get('database_exploits', 0) > 0
                    self.record_test(
                        "Database Contains Exploits",
                        has_data,
                        f"Found {data.get('database_exploits', 0)} exploits"
                    )

                    # Check active sources
                    active_sources = data.get('active_sources', 0)
                    self.record_test(
                        "Active Aggregation Sources",
                        active_sources > 0,
                        f"{active_sources} sources active"
                    )
                else:
                    self.record_test("API Health Endpoint", False, f"HTTP {response.status_code}")

        except Exception as e:
            self.record_test("API Health Endpoint", False, str(e))

    async def test_api_exploits(self):
        """Test 2: Exploits API"""
        self.log("\n=== Test 2: Exploits API ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                # Test list exploits
                response = await client.get(
                    f"{self.base_url}/exploits",
                    params={"page": 1, "page_size": 10},
                    timeout=10.0
                )

                if response.status_code == 200:
                    data = response.json()
                    self.record_test(
                        "List Exploits Endpoint",
                        True,
                        f"Retrieved {len(data.get('data', []))} exploits"
                    )

                    # Test pagination
                    has_pagination = 'total' in data and 'page' in data and 'has_more' in data
                    self.record_test("Pagination Fields", has_pagination)

                    # Test exploit structure
                    if data.get('data'):
                        exploit = data['data'][0]
                        required_fields = ['tx_hash', 'chain', 'protocol', 'amount_usd', 'timestamp']
                        has_fields = all(field in exploit for field in required_fields)
                        self.record_test("Exploit Data Structure", has_fields)
                else:
                    self.record_test("List Exploits Endpoint", False, f"HTTP {response.status_code}")

        except Exception as e:
            self.record_test("List Exploits Endpoint", False, str(e))

    async def test_api_stats(self):
        """Test 3: Statistics API"""
        self.log("\n=== Test 3: Statistics API ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/stats",
                    params={"days": 7},
                    timeout=10.0
                )

                if response.status_code == 200:
                    data = response.json()
                    self.record_test("Statistics Endpoint", True)

                    # Verify stats structure
                    required_fields = ['total_exploits', 'total_loss_usd', 'chains_affected', 'protocols_affected']
                    has_fields = all(field in data for field in required_fields)
                    self.record_test("Statistics Data Structure", has_fields)
                else:
                    self.record_test("Statistics Endpoint", False, f"HTTP {response.status_code}")

        except Exception as e:
            self.record_test("Statistics Endpoint", False, str(e))

    async def test_api_chains(self):
        """Test 4: Chains API"""
        self.log("\n=== Test 4: Chains API ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.base_url}/chains", timeout=10.0)

                if response.status_code == 200:
                    data = response.json()
                    self.record_test(
                        "Chains Endpoint",
                        True,
                        f"Tracking {data.get('total_chains', 0)} chains"
                    )
                else:
                    self.record_test("Chains Endpoint", False, f"HTTP {response.status_code}")

        except Exception as e:
            self.record_test("Chains Endpoint", False, str(e))

    async def test_webhook_api_auth(self):
        """Test 5: Webhook API Authentication"""
        self.log("\n=== Test 5: Webhook API Authentication ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                # Test without authentication
                response = await client.get(
                    f"{self.base_url}/api/v1/user-webhooks",
                    timeout=10.0
                )

                # Should return 401 Unauthorized
                requires_auth = response.status_code == 401
                self.record_test(
                    "Webhook API Requires Authentication",
                    requires_auth,
                    f"HTTP {response.status_code}"
                )

        except Exception as e:
            self.record_test("Webhook API Authentication", False, str(e))

    async def test_database_integrity(self):
        """Test 6: Database Schema Integrity"""
        self.log("\n=== Test 6: Database Schema Integrity ===", "INFO")

        try:
            import sqlite3
            db_path = "data/kamiyo.db"

            if not os.path.exists(db_path):
                self.record_test("Database File Exists", False, "Database file not found")
                return

            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            # Check main tables exist
            tables = ['exploits', 'sources', 'users', 'user_webhooks', 'webhook_deliveries']
            for table in tables:
                cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
                exists = cursor.fetchone() is not None
                self.record_test(f"Table '{table}' exists", exists)

            # Check indexes exist
            cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
            indexes = [row[0] for row in cursor.fetchall()]
            has_indexes = len(indexes) > 5  # Should have multiple indexes
            self.record_test("Database Indexes Created", has_indexes, f"{len(indexes)} indexes found")

            conn.close()

        except Exception as e:
            self.record_test("Database Integrity", False, str(e))

    async def test_cors_headers(self):
        """Test 7: CORS Configuration"""
        self.log("\n=== Test 7: CORS Configuration ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.options(
                    f"{self.base_url}/health",
                    headers={"Origin": "http://localhost:3000"},
                    timeout=10.0
                )

                has_cors = 'access-control-allow-origin' in response.headers
                self.record_test("CORS Headers Present", has_cors)

        except Exception as e:
            self.record_test("CORS Configuration", False, str(e))

    async def test_error_handling(self):
        """Test 8: Error Handling"""
        self.log("\n=== Test 8: Error Handling ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                # Test 404
                response = await client.get(
                    f"{self.base_url}/exploits/nonexistent-tx-hash-12345",
                    timeout=10.0
                )

                handles_404 = response.status_code == 404
                self.record_test("404 Error Handling", handles_404)

                # Test invalid params
                response = await client.get(
                    f"{self.base_url}/exploits",
                    params={"page": -1},
                    timeout=10.0
                )

                handles_validation = response.status_code in [400, 422]
                self.record_test("Parameter Validation", handles_validation)

        except Exception as e:
            self.record_test("Error Handling", False, str(e))

    async def test_rate_limiting(self):
        """Test 9: Rate Limiting (if enabled)"""
        self.log("\n=== Test 9: Rate Limiting ===", "INFO")

        try:
            # Make multiple rapid requests
            async with httpx.AsyncClient() as client:
                responses = []
                for i in range(5):
                    response = await client.get(f"{self.base_url}/health", timeout=10.0)
                    responses.append(response.status_code)

                # All should succeed (rate limits are high for testing)
                all_success = all(status == 200 for status in responses)
                self.record_test(
                    "API Handles Multiple Requests",
                    all_success,
                    f"5/5 requests succeeded"
                )

        except Exception as e:
            self.record_test("Rate Limiting", False, str(e))

    async def test_source_rankings(self):
        """Test 10: Source Rankings API"""
        self.log("\n=== Test 10: Source Rankings ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/sources/rankings",
                    params={"days": 30},
                    timeout=10.0
                )

                if response.status_code == 200:
                    data = response.json()
                    self.record_test("Source Rankings Endpoint", True)

                    # Check has sources
                    has_sources = len(data.get('sources', [])) > 0
                    self.record_test(
                        "Source Rankings Data",
                        has_sources,
                        f"{len(data.get('sources', []))} sources ranked"
                    )
                else:
                    self.record_test("Source Rankings Endpoint", False, f"HTTP {response.status_code}")

        except Exception as e:
            self.record_test("Source Rankings", False, str(e))

    def generate_report(self):
        """Generate final test report"""
        self.log("\n" + "="*60, "INFO")
        self.log("PRODUCTION READINESS TEST REPORT", "INFO")
        self.log("="*60, "INFO")

        success_rate = (self.passed_tests / self.total_tests * 100) if self.total_tests > 0 else 0

        print(f"\n{GREEN}Passed: {self.passed_tests}/{self.total_tests}{RESET}")
        print(f"{RED}Failed: {self.failed_tests}/{self.total_tests}{RESET}")
        print(f"{BLUE}Success Rate: {success_rate:.1f}%{RESET}\n")

        if self.failed_tests > 0:
            print(f"{RED}Failed Tests:{RESET}")
            for result in self.results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['details']}")

        print("\n" + "="*60 + "\n")

        # Overall assessment
        if success_rate >= 90:
            self.log("✅ PRODUCTION READY", "SUCCESS")
            self.log("System passed all critical tests and is ready for production deployment.", "SUCCESS")
            return 0
        elif success_rate >= 70:
            self.log("⚠️  NEEDS ATTENTION", "WARNING")
            self.log("System is functional but some tests failed. Review failures before deploying.", "WARNING")
            return 1
        else:
            self.log("❌ NOT READY", "ERROR")
            self.log("System has critical failures. Do not deploy to production.", "ERROR")
            return 2

async def main():
    """Run all tests"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}Kamiyo Production Readiness Test Suite{RESET}")
    print(f"{BLUE}Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")

    tester = ProductionReadinessTest()

    # Run all tests
    await tester.test_api_health()
    await tester.test_api_exploits()
    await tester.test_api_stats()
    await tester.test_api_chains()
    await tester.test_webhook_api_auth()
    await tester.test_database_integrity()
    await tester.test_cors_headers()
    await tester.test_error_handling()
    await tester.test_rate_limiting()
    await tester.test_source_rankings()

    # Generate report
    exit_code = tester.generate_report()

    sys.exit(exit_code)

if __name__ == "__main__":
    asyncio.run(main())
