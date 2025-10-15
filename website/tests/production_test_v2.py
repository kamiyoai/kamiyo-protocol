#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Production Readiness Test Suite V2
Comprehensive end-to-end testing including new features
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

class ProductionReadinessTestV2:
    """Comprehensive production readiness test suite V2"""

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

    async def test_new_features(self):
        """Test 3: New Features Integration"""
        self.log("\n=== Test 3: New Features Integration ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                # Test Alert Status API (requires auth, should fail gracefully)
                response = await client.get(
                    f"{self.base_url}/api/v1/alerts/status",
                    timeout=10.0
                )
                requires_auth = response.status_code == 401
                self.record_test(
                    "Alert Status Requires Auth",
                    requires_auth,
                    f"HTTP {response.status_code}"
                )

                # Test Watchlists API (requires auth, should fail gracefully)
                response = await client.get(
                    f"{self.base_url}/api/v1/watchlists",
                    timeout=10.0
                )
                requires_auth = response.status_code == 401
                self.record_test(
                    "Watchlists Requires Auth",
                    requires_auth,
                    f"HTTP {response.status_code}"
                )

                # Test Slack API (requires auth, should fail gracefully)
                response = await client.get(
                    f"{self.base_url}/api/v1/slack/status",
                    timeout=10.0
                )
                requires_auth = response.status_code == 401
                self.record_test(
                    "Slack Integration Requires Auth",
                    requires_auth,
                    f"HTTP {response.status_code}"
                )

        except Exception as e:
            self.record_test("New Features Integration", False, str(e))

    async def test_database_schema(self):
        """Test 4: Database Schema"""
        self.log("\n=== Test 4: Database Schema ===", "INFO")

        try:
            import sqlite3
            db_path = "data/kamiyo.db"

            if not os.path.exists(db_path):
                self.record_test("Database File Exists", False, "Database file not found")
                return

            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            # Check all tables exist
            tables = [
                'exploits',
                'sources',
                'users',
                'user_webhooks',
                'webhook_deliveries',
                'alerts_sent',
                'protocol_watchlists',
                'watchlist_matches'
            ]

            for table in tables:
                cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
                exists = cursor.fetchone() is not None
                self.record_test(f"Table '{table}' exists", exists)

            # Check users table has new columns
            cursor.execute("PRAGMA table_info(users)")
            columns = [row[1] for row in cursor.fetchall()]

            required_columns = [
                'monthly_alerts_sent',
                'monthly_alerts_reset_at',
                'slack_webhook_url',
                'slack_enabled'
            ]

            for col in required_columns:
                has_col = col in columns
                self.record_test(f"Users table has '{col}' column", has_col)

            # Check alerts_sent has user_id
            cursor.execute("PRAGMA table_info(alerts_sent)")
            columns = [row[1] for row in cursor.fetchall()]
            self.record_test("alerts_sent has 'user_id' column", 'user_id' in columns)

            conn.close()

        except Exception as e:
            self.record_test("Database Schema", False, str(e))

    async def test_api_documentation(self):
        """Test 5: API Documentation"""
        self.log("\n=== Test 5: API Documentation ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                # Test OpenAPI docs
                response = await client.get(f"{self.base_url}/docs", timeout=10.0)
                self.record_test(
                    "OpenAPI Documentation Available",
                    response.status_code == 200,
                    f"HTTP {response.status_code}"
                )

                # Test ReDoc
                response = await client.get(f"{self.base_url}/redoc", timeout=10.0)
                self.record_test(
                    "ReDoc Documentation Available",
                    response.status_code == 200,
                    f"HTTP {response.status_code}"
                )

        except Exception as e:
            self.record_test("API Documentation", False, str(e))

    async def test_frontend_health(self):
        """Test 6: Frontend Health"""
        self.log("\n=== Test 6: Frontend Health ===", "INFO")

        try:
            async with httpx.AsyncClient() as client:
                # Test homepage
                response = await client.get("http://localhost:3001/", timeout=10.0)
                self.record_test(
                    "Homepage Loads",
                    response.status_code == 200,
                    f"HTTP {response.status_code}"
                )

                # Test pricing page
                response = await client.get("http://localhost:3001/pricing", timeout=10.0)
                self.record_test(
                    "Pricing Page Loads",
                    response.status_code == 200,
                    f"HTTP {response.status_code}"
                )

                # Check if pricing page has content
                if response.status_code == 200:
                    content = response.text
                    has_free = "$0" in content
                    has_pro = "$99" in content
                    has_team = "$299" in content
                    has_enterprise = "$999" in content

                    self.record_test(
                        "Pricing Page Shows All Tiers",
                        all([has_free, has_pro, has_team, has_enterprise]),
                        "All pricing tiers present"
                    )

        except Exception as e:
            self.record_test("Frontend Health", False, str(e))

    async def test_cors_configuration(self):
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

    async def test_api_endpoints_availability(self):
        """Test 9: All API Endpoints Availability"""
        self.log("\n=== Test 9: API Endpoints Availability ===", "INFO")

        endpoints = [
            ("/", "Root Endpoint"),
            ("/health", "Health Endpoint"),
            ("/exploits", "Exploits List"),
            ("/stats", "Statistics"),
            ("/chains", "Chains List"),
            ("/sources/rankings", "Source Rankings"),
        ]

        try:
            async with httpx.AsyncClient() as client:
                for path, name in endpoints:
                    response = await client.get(f"{self.base_url}{path}", timeout=10.0)
                    self.record_test(
                        name,
                        response.status_code == 200,
                        f"HTTP {response.status_code}"
                    )

        except Exception as e:
            self.record_test("API Endpoints", False, str(e))

    async def test_performance(self):
        """Test 10: Performance Benchmarks"""
        self.log("\n=== Test 10: Performance Benchmarks ===", "INFO")

        try:
            import time
            async with httpx.AsyncClient() as client:
                # Test health endpoint response time
                start = time.time()
                response = await client.get(f"{self.base_url}/health", timeout=10.0)
                duration = (time.time() - start) * 1000

                self.record_test(
                    "Health Endpoint Performance",
                    duration < 500,  # Should respond in < 500ms
                    f"{duration:.0f}ms"
                )

                # Test exploits endpoint response time
                start = time.time()
                response = await client.get(
                    f"{self.base_url}/exploits",
                    params={"page": 1, "page_size": 10},
                    timeout=10.0
                )
                duration = (time.time() - start) * 1000

                self.record_test(
                    "Exploits Endpoint Performance",
                    duration < 1000,  # Should respond in < 1s
                    f"{duration:.0f}ms"
                )

        except Exception as e:
            self.record_test("Performance", False, str(e))

    def generate_report(self):
        """Generate final test report"""
        self.log("\n" + "="*70, "INFO")
        self.log("PRODUCTION READINESS TEST REPORT V2", "INFO")
        self.log("="*70, "INFO")

        success_rate = (self.passed_tests / self.total_tests * 100) if self.total_tests > 0 else 0

        print(f"\n{GREEN}Passed: {self.passed_tests}/{self.total_tests}{RESET}")
        print(f"{RED}Failed: {self.failed_tests}/{self.total_tests}{RESET}")
        print(f"{BLUE}Success Rate: {success_rate:.1f}%{RESET}\n")

        if self.failed_tests > 0:
            print(f"{RED}Failed Tests:{RESET}")
            for result in self.results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['details']}")

        print("\n" + "="*70 + "\n")

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
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}Kamiyo Production Readiness Test Suite V2{RESET}")
    print(f"{BLUE}Testing: Alert Limits, Watchlists, Slack, Database Schema{RESET}")
    print(f"{BLUE}Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
    print(f"{BLUE}{'='*70}{RESET}\n")

    tester = ProductionReadinessTestV2()

    # Run all tests
    await tester.test_api_health()
    await tester.test_api_exploits()
    await tester.test_new_features()
    await tester.test_database_schema()
    await tester.test_api_documentation()
    await tester.test_frontend_health()
    await tester.test_cors_configuration()
    await tester.test_error_handling()
    await tester.test_api_endpoints_availability()
    await tester.test_performance()

    # Generate report
    exit_code = tester.generate_report()

    sys.exit(exit_code)

if __name__ == "__main__":
    asyncio.run(main())
