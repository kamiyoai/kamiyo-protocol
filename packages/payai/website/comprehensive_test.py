#!/usr/bin/env python3
"""
Comprehensive QA Testing Suite for Kamiyo Platform
Tests all API endpoints, subscription tiers, database functionality, and frontend pages
"""

import requests
import json
import sys
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import sqlite3
import os

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'

class TestResult:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
        self.critical = []

    def add_pass(self, test_name: str, details: str = ""):
        self.passed.append((test_name, details))
        print(f"{Colors.GREEN}✓{Colors.END} {test_name}")
        if details:
            print(f"  {details}")

    def add_fail(self, test_name: str, error: str, critical: bool = False):
        if critical:
            self.critical.append((test_name, error))
            print(f"{Colors.RED}✗ [CRITICAL]{Colors.END} {test_name}")
        else:
            self.failed.append((test_name, error))
            print(f"{Colors.RED}✗{Colors.END} {test_name}")
        print(f"  {Colors.RED}Error: {error}{Colors.END}")

    def add_warning(self, test_name: str, message: str):
        self.warnings.append((test_name, message))
        print(f"{Colors.YELLOW}⚠{Colors.END} {test_name}")
        print(f"  {Colors.YELLOW}Warning: {message}{Colors.END}")

    def print_summary(self):
        print(f"\n{Colors.BOLD}{'='*70}{Colors.END}")
        print(f"{Colors.BOLD}TEST SUMMARY{Colors.END}")
        print(f"{Colors.BOLD}{'='*70}{Colors.END}\n")

        total = len(self.passed) + len(self.failed) + len(self.warnings)

        print(f"{Colors.GREEN}✓ Passed:{Colors.END} {len(self.passed)}/{total}")
        print(f"{Colors.RED}✗ Failed:{Colors.END} {len(self.failed)}/{total}")
        print(f"{Colors.YELLOW}⚠ Warnings:{Colors.END} {len(self.warnings)}/{total}")
        print(f"{Colors.RED}✗ Critical:{Colors.END} {len(self.critical)}/{total}")

        if self.critical:
            print(f"\n{Colors.RED}{Colors.BOLD}CRITICAL ISSUES (BLOCKING PRODUCTION):{Colors.END}")
            for test, error in self.critical:
                print(f"  - {test}: {error}")

        if self.failed:
            print(f"\n{Colors.RED}FAILED TESTS:{Colors.END}")
            for test, error in self.failed:
                print(f"  - {test}: {error}")

        if self.warnings:
            print(f"\n{Colors.YELLOW}WARNINGS:{Colors.END}")
            for test, warning in self.warnings:
                print(f"  - {test}: {warning}")

        print(f"\n{Colors.BOLD}{'='*70}{Colors.END}\n")

        # Return exit code
        return 0 if len(self.failed) == 0 and len(self.critical) == 0 else 1


class KamiyoTester:
    def __init__(self, base_url: str = "http://localhost:3000", api_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.api_url = api_url
        self.results = TestResult()
        self.db_path = self._find_database()

    def _find_database(self) -> Optional[str]:
        """Find the SQLite database"""
        possible_paths = [
            "/Users/dennisgoslar/Projekter/kamiyo/data/kamiyo.db",
            "/Users/dennisgoslar/Projekter/kamiyo/website/prisma/dev.db",
            "./data/kamiyo.db",
            "./prisma/dev.db"
        ]
        for path in possible_paths:
            if os.path.exists(path):
                return path
        return None

    def test_core_api_endpoints(self):
        """Test core API endpoints"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Core API Endpoints{Colors.END}")
        print("-" * 70)

        # Test /health endpoint
        try:
            response = requests.get(f"{self.api_url}/health", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.results.add_pass(
                    "GET /health",
                    f"Database has {data.get('database_exploits', 0)} exploits, {data.get('active_sources', 0)} active sources"
                )
            else:
                self.results.add_fail(
                    "GET /health",
                    f"Expected 200, got {response.status_code}",
                    critical=True
                )
        except Exception as e:
            self.results.add_fail("GET /health", str(e), critical=True)

        # Test /exploits endpoint
        try:
            response = requests.get(f"{self.api_url}/exploits?page=1&page_size=10", timeout=10)
            if response.status_code == 200:
                data = response.json()
                exploit_count = len(data.get('data', []))
                self.results.add_pass(
                    "GET /exploits",
                    f"Returned {exploit_count} exploits, total: {data.get('total', 0)}"
                )

                # Check for 24h delay metadata
                if 'metadata' in data:
                    if 'delayed' in data['metadata']:
                        self.results.add_pass(
                            "Exploit delay metadata",
                            f"Free tier delay: {data['metadata'].get('delayed', False)}"
                        )
            else:
                self.results.add_fail(
                    "GET /exploits",
                    f"Expected 200, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /exploits", str(e))

        # Test /stats endpoint
        try:
            response = requests.get(f"{self.api_url}/stats?days=7", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.results.add_pass(
                    "GET /stats",
                    f"Total exploits: {data.get('total_exploits', 0)}, Total loss: ${data.get('total_loss_usd', 0):,.0f}"
                )
            else:
                self.results.add_fail(
                    "GET /stats",
                    f"Expected 200, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /stats", str(e))

        # Test /chains endpoint
        try:
            response = requests.get(f"{self.api_url}/chains", timeout=10)
            if response.status_code == 200:
                data = response.json()
                chain_count = data.get('total_chains', 0)
                self.results.add_pass(
                    "GET /chains",
                    f"Tracking {chain_count} chains"
                )
            else:
                self.results.add_fail(
                    "GET /chains",
                    f"Expected 200, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /chains", str(e))

    def test_nextjs_api_endpoints(self):
        """Test Next.js API routes"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Next.js API Routes{Colors.END}")
        print("-" * 70)

        # Test /api/health (Next.js proxy)
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=10)
            if response.status_code == 200:
                self.results.add_pass("GET /api/health (Next.js)")
            else:
                self.results.add_fail(
                    "GET /api/health (Next.js)",
                    f"Expected 200, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/health (Next.js)", str(e))

        # Test /api/exploits (Next.js proxy)
        try:
            response = requests.get(f"{self.base_url}/api/exploits", timeout=10)
            if response.status_code == 200:
                self.results.add_pass("GET /api/exploits (Next.js)")
            else:
                self.results.add_fail(
                    "GET /api/exploits (Next.js)",
                    f"Expected 200, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/exploits (Next.js)", str(e))

        # Test /api/stats (Next.js proxy)
        try:
            response = requests.get(f"{self.base_url}/api/stats", timeout=10)
            if response.status_code == 200:
                self.results.add_pass("GET /api/stats (Next.js)")
            else:
                self.results.add_fail(
                    "GET /api/stats (Next.js)",
                    f"Expected 200, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/stats (Next.js)", str(e))

        # Test /api/chains (Next.js proxy)
        try:
            response = requests.get(f"{self.base_url}/api/chains", timeout=10)
            if response.status_code == 200:
                self.results.add_pass("GET /api/chains (Next.js)")
            else:
                self.results.add_fail(
                    "GET /api/chains (Next.js)",
                    f"Expected 200, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/chains (Next.js)", str(e))

    def test_subscription_endpoints(self):
        """Test subscription API endpoints"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Subscription Endpoints{Colors.END}")
        print("-" * 70)

        # Test /api/subscription/status without email (should fail)
        try:
            response = requests.get(f"{self.base_url}/api/subscription/status", timeout=10)
            if response.status_code == 400:
                self.results.add_pass("GET /api/subscription/status (no email) - proper error handling")
            else:
                self.results.add_warning(
                    "GET /api/subscription/status (no email)",
                    f"Expected 400, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/subscription/status (no email)", str(e))

        # Test with non-existent email
        try:
            response = requests.get(
                f"{self.base_url}/api/subscription/status?email=nonexistent@test.com",
                timeout=10
            )
            if response.status_code == 404:
                self.results.add_pass("GET /api/subscription/status (non-existent user)")
            else:
                self.results.add_warning(
                    "GET /api/subscription/status (non-existent user)",
                    f"Expected 404, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/subscription/status (non-existent user)", str(e))

    def test_webhook_endpoints(self):
        """Test webhook API endpoints (requires authentication)"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Webhook Endpoints{Colors.END}")
        print("-" * 70)

        # Test /api/webhooks without auth (should fail with 401)
        try:
            response = requests.get(f"{self.base_url}/api/webhooks", timeout=10)
            if response.status_code == 401:
                self.results.add_pass("GET /api/webhooks (no auth) - proper authentication check")
            else:
                self.results.add_warning(
                    "GET /api/webhooks (no auth)",
                    f"Expected 401, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/webhooks (no auth)", str(e))

        # Test POST /api/webhooks without auth
        try:
            response = requests.post(
                f"{self.base_url}/api/webhooks",
                json={"url": "https://example.com/webhook"},
                timeout=10
            )
            if response.status_code == 401:
                self.results.add_pass("POST /api/webhooks (no auth) - proper authentication check")
            else:
                self.results.add_warning(
                    "POST /api/webhooks (no auth)",
                    f"Expected 401, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("POST /api/webhooks (no auth)", str(e))

    def test_watchlist_endpoints(self):
        """Test watchlist API endpoints (requires Enterprise tier)"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Watchlist Endpoints{Colors.END}")
        print("-" * 70)

        # Test /api/watchlists without auth (should fail with 401)
        try:
            response = requests.get(f"{self.base_url}/api/watchlists", timeout=10)
            if response.status_code == 401:
                self.results.add_pass("GET /api/watchlists (no auth) - proper authentication check")
            else:
                self.results.add_warning(
                    "GET /api/watchlists (no auth)",
                    f"Expected 401, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/watchlists (no auth)", str(e))

        # Test POST /api/watchlists without auth
        try:
            response = requests.post(
                f"{self.base_url}/api/watchlists",
                json={"protocol": "Uniswap", "chain": "Ethereum"},
                timeout=10
            )
            if response.status_code == 401:
                self.results.add_pass("POST /api/watchlists (no auth) - proper authentication check")
            else:
                self.results.add_warning(
                    "POST /api/watchlists (no auth)",
                    f"Expected 401, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("POST /api/watchlists (no auth)", str(e))

    def test_analysis_endpoints(self):
        """Test analysis API endpoints"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Analysis Endpoints{Colors.END}")
        print("-" * 70)

        # Test /api/analysis/patterns
        try:
            response = requests.get(f"{self.base_url}/api/analysis/patterns", timeout=10)
            if response.status_code in [200, 401, 403]:
                self.results.add_pass(
                    "GET /api/analysis/patterns",
                    f"Endpoint accessible (status: {response.status_code})"
                )
            else:
                self.results.add_fail(
                    "GET /api/analysis/patterns",
                    f"Unexpected status: {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/analysis/patterns", str(e))

        # Test /api/analysis/anomalies
        try:
            response = requests.get(f"{self.base_url}/api/analysis/anomalies", timeout=10)
            if response.status_code in [200, 401, 403]:
                self.results.add_pass(
                    "GET /api/analysis/anomalies",
                    f"Endpoint accessible (status: {response.status_code})"
                )
            else:
                self.results.add_fail(
                    "GET /api/analysis/anomalies",
                    f"Unexpected status: {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("GET /api/analysis/anomalies", str(e))

    def test_database_schema(self):
        """Test database schema and integrity"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Database Schema{Colors.END}")
        print("-" * 70)

        if not self.db_path:
            self.results.add_warning("Database schema tests", "Database not found, skipping schema tests")
            return

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Check required tables exist
            required_tables = ['User', 'Subscription', 'Webhook', 'Watchlist', 'ApiRequest', 'Kami']
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            existing_tables = [row[0] for row in cursor.fetchall()]

            for table in required_tables:
                if table in existing_tables:
                    # Get row count
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cursor.fetchone()[0]
                    self.results.add_pass(f"Table '{table}' exists", f"{count} rows")
                else:
                    self.results.add_fail(
                        f"Table '{table}' exists",
                        "Table not found in database",
                        critical=True
                    )

            # Check User table structure
            cursor.execute("PRAGMA table_info(User)")
            user_columns = {row[1]: row[2] for row in cursor.fetchall()}
            required_user_columns = ['id', 'email', 'passwordHash', 'createdAt', 'updatedAt']

            for col in required_user_columns:
                if col in user_columns:
                    self.results.add_pass(f"User.{col} column exists")
                else:
                    self.results.add_fail(
                        f"User.{col} column exists",
                        "Column missing from User table",
                        critical=True
                    )

            # Check Subscription table structure
            cursor.execute("PRAGMA table_info(Subscription)")
            sub_columns = {row[1]: row[2] for row in cursor.fetchall()}
            required_sub_columns = ['id', 'userId', 'tier', 'status', 'createdAt', 'updatedAt']

            for col in required_sub_columns:
                if col in sub_columns:
                    self.results.add_pass(f"Subscription.{col} column exists")
                else:
                    self.results.add_fail(
                        f"Subscription.{col} column exists",
                        "Column missing from Subscription table",
                        critical=True
                    )

            # Check Webhook table structure
            cursor.execute("PRAGMA table_info(Webhook)")
            webhook_columns = {row[1]: row[2] for row in cursor.fetchall()}
            required_webhook_columns = ['id', 'userId', 'url', 'status', 'createdAt']

            for col in required_webhook_columns:
                if col in webhook_columns:
                    self.results.add_pass(f"Webhook.{col} column exists")
                else:
                    self.results.add_fail(
                        f"Webhook.{col} column exists",
                        "Column missing from Webhook table"
                    )

            # Check Watchlist table structure
            cursor.execute("PRAGMA table_info(Watchlist)")
            watchlist_columns = {row[1]: row[2] for row in cursor.fetchall()}
            required_watchlist_columns = ['id', 'userId', 'protocol', 'chain', 'alertOnNew']

            for col in required_watchlist_columns:
                if col in watchlist_columns:
                    self.results.add_pass(f"Watchlist.{col} column exists")
                else:
                    self.results.add_fail(
                        f"Watchlist.{col} column exists",
                        "Column missing from Watchlist table"
                    )

            conn.close()

        except Exception as e:
            self.results.add_fail("Database schema tests", str(e), critical=True)

    def test_frontend_pages(self):
        """Test frontend pages are accessible"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Frontend Pages{Colors.END}")
        print("-" * 70)

        pages = [
            ('/', 'Homepage'),
            ('/pricing', 'Pricing page'),
            ('/about', 'About page'),
            ('/features', 'Features page'),
            ('/dashboard', 'Dashboard page'),
            ('/auth/signin', 'Sign-in page'),
            ('/privacy-policy', 'Privacy policy page'),
        ]

        for path, name in pages:
            try:
                response = requests.get(f"{self.base_url}{path}", timeout=10)
                if response.status_code == 200:
                    self.results.add_pass(f"{name} accessible")
                elif response.status_code == 404:
                    self.results.add_fail(f"{name} accessible", "Page not found (404)")
                else:
                    self.results.add_warning(
                        f"{name} accessible",
                        f"Unexpected status: {response.status_code}"
                    )
            except Exception as e:
                self.results.add_fail(f"{name} accessible", str(e))

    def test_error_handling(self):
        """Test proper error handling"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Error Handling{Colors.END}")
        print("-" * 70)

        # Test 404 on non-existent endpoint
        try:
            response = requests.get(f"{self.api_url}/nonexistent", timeout=10)
            if response.status_code == 404:
                self.results.add_pass("404 error handling")
            else:
                self.results.add_warning(
                    "404 error handling",
                    f"Expected 404, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("404 error handling", str(e))

        # Test invalid query parameters
        try:
            response = requests.get(f"{self.api_url}/exploits?page=-1", timeout=10)
            if response.status_code in [400, 422]:
                self.results.add_pass("Invalid parameter handling")
            else:
                self.results.add_warning(
                    "Invalid parameter handling",
                    f"Expected 400/422, got {response.status_code}"
                )
        except Exception as e:
            self.results.add_fail("Invalid parameter handling", str(e))

    def test_rate_limiting(self):
        """Test rate limiting"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing Rate Limiting{Colors.END}")
        print("-" * 70)

        # Make multiple rapid requests
        try:
            responses = []
            for i in range(20):
                response = requests.get(f"{self.api_url}/exploits", timeout=10)
                responses.append(response.status_code)

            # Check if any were rate-limited (429)
            rate_limited = 429 in responses
            if rate_limited:
                self.results.add_pass("Rate limiting active", "Some requests returned 429")
            else:
                self.results.add_warning(
                    "Rate limiting",
                    "No rate limiting detected (may not be configured)"
                )
        except Exception as e:
            self.results.add_fail("Rate limiting test", str(e))

    def test_cors_headers(self):
        """Test CORS configuration"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Testing CORS Configuration{Colors.END}")
        print("-" * 70)

        try:
            response = requests.options(
                f"{self.api_url}/exploits",
                headers={'Origin': 'http://localhost:3000'},
                timeout=10
            )

            has_cors = 'Access-Control-Allow-Origin' in response.headers
            if has_cors:
                self.results.add_pass(
                    "CORS headers present",
                    f"Origin: {response.headers.get('Access-Control-Allow-Origin')}"
                )
            else:
                self.results.add_warning("CORS headers", "No CORS headers found")
        except Exception as e:
            self.results.add_fail("CORS test", str(e))

    def run_all_tests(self):
        """Run all test suites"""
        print(f"\n{Colors.BOLD}{'='*70}{Colors.END}")
        print(f"{Colors.BOLD}KAMIYO PLATFORM - COMPREHENSIVE QA TEST SUITE{Colors.END}")
        print(f"{Colors.BOLD}{'='*70}{Colors.END}")
        print(f"\nTest started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Base URL: {self.base_url}")
        print(f"API URL: {self.api_url}")
        print(f"Database: {self.db_path or 'Not found'}")

        # Run all test suites
        self.test_core_api_endpoints()
        self.test_nextjs_api_endpoints()
        self.test_subscription_endpoints()
        self.test_webhook_endpoints()
        self.test_watchlist_endpoints()
        self.test_analysis_endpoints()
        self.test_database_schema()
        self.test_frontend_pages()
        self.test_error_handling()
        self.test_rate_limiting()
        self.test_cors_headers()

        # Print summary and return exit code
        return self.results.print_summary()


if __name__ == "__main__":
    # Parse command line arguments
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
    api_url = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000"

    # Run tests
    tester = KamiyoTester(base_url, api_url)
    exit_code = tester.run_all_tests()

    sys.exit(exit_code)
