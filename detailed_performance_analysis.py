#!/usr/bin/env python3
"""
Detailed Performance Analysis for Kamiyo Platform
Analyzes specific bottlenecks, connection pooling, caching, and edge cases
"""

import asyncio
import aiohttp
import time
import sys
import json
from typing import Dict, List, Any
from dataclasses import dataclass
from datetime import datetime

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'


@dataclass
class Issue:
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    category: str
    title: str
    description: str
    observed_behavior: str
    performance_impact: str
    recommended_fix: str


class DetailedAnalyzer:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.issues: List[Issue] = []

    async def analyze_rate_limiting_enforcement(self):
        """Test if rate limiting is actually enforced"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Analyzing Rate Limiting Enforcement{Colors.END}")
        print("─" * 70)

        async with aiohttp.ClientSession() as session:
            # Test 1: Free tier should be blocked
            print("\n1. Testing Free Tier Limits (should block after threshold)...")

            # Simulate free tier user
            headers = {"X-API-Key": "free_test_user_123"}
            rate_limited = False
            successful = 0

            for i in range(200):
                try:
                    async with session.get(
                        f"{self.base_url}/exploits",
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        if response.status == 429:
                            rate_limited = True
                            rate_limit_headers = {
                                'X-RateLimit-Limit': response.headers.get('X-RateLimit-Limit'),
                                'X-RateLimit-Remaining': response.headers.get('X-RateLimit-Remaining'),
                                'X-RateLimit-Reset': response.headers.get('X-RateLimit-Reset'),
                                'Retry-After': response.headers.get('Retry-After')
                            }
                            print(f"   ✓ Rate limited after {successful} requests")
                            print(f"   Rate limit headers: {rate_limit_headers}")
                            break
                        elif response.status == 200:
                            successful += 1
                except Exception as e:
                    print(f"   Error: {e}")
                    break

            if not rate_limited:
                self.issues.append(Issue(
                    severity="CRITICAL",
                    category="Rate Limiting",
                    title="Rate limiting not enforced",
                    description="Made 200 requests without being rate limited",
                    observed_behavior=f"All {successful} requests succeeded with status 200",
                    performance_impact="System vulnerable to abuse, could lead to resource exhaustion and service degradation",
                    recommended_fix="Enable rate limiting middleware and configure Redis-based usage tracker. Ensure middleware is applied to all routes."
                ))
                print(f"   {Colors.RED}✗ Rate limiting NOT enforced{Colors.END}")
            else:
                print(f"   {Colors.GREEN}✓ Rate limiting is working{Colors.END}")

            # Test 2: Check if rate limits differ by tier
            print("\n2. Testing Tier-Based Rate Limits...")

            tiers = ["free", "pro", "enterprise"]
            tier_limits = {}

            for tier in tiers:
                headers = {"X-API-Key": f"{tier}_test_user_{int(time.time())}"}
                count = 0

                for i in range(100):
                    try:
                        async with session.get(
                            f"{self.base_url}/exploits",
                            headers=headers,
                            timeout=aiohttp.ClientTimeout(total=5)
                        ) as response:
                            if response.status == 429:
                                tier_limits[tier] = count
                                break
                            elif response.status == 200:
                                count += 1
                            await asyncio.sleep(0.01)  # Small delay
                    except:
                        break

                if tier not in tier_limits:
                    tier_limits[tier] = count

            print(f"   Free tier: {tier_limits.get('free', 'unlimited')} requests")
            print(f"   Pro tier: {tier_limits.get('pro', 'unlimited')} requests")
            print(f"   Enterprise tier: {tier_limits.get('enterprise', 'unlimited')} requests")

            # Check if tiers have different limits
            unique_limits = set(tier_limits.values())
            if len(unique_limits) <= 1:
                self.issues.append(Issue(
                    severity="HIGH",
                    category="Rate Limiting",
                    title="Tier-based rate limits not differentiated",
                    description="All tiers have the same rate limits",
                    observed_behavior=f"All tiers limited at same threshold: {tier_limits}",
                    performance_impact="No incentive for users to upgrade tiers, lost revenue opportunity",
                    recommended_fix="Configure different rate limits per tier in tiers.py and ensure middleware reads user tier correctly"
                ))

    async def analyze_database_connection_pool(self):
        """Analyze database connection pool behavior under load"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Analyzing Database Connection Pool{Colors.END}")
        print("─" * 70)

        print("\n1. Testing Connection Pool Exhaustion...")

        async with aiohttp.ClientSession() as session:
            # Make many concurrent requests to stress connection pool
            tasks = []
            for i in range(100):
                tasks.append(session.get(
                    f"{self.base_url}/exploits?page={i%10+1}",
                    timeout=aiohttp.ClientTimeout(total=30)
                ))

            start = time.time()
            try:
                responses = await asyncio.gather(*tasks, return_exceptions=True)
                elapsed = time.time() - start

                timeouts = sum(1 for r in responses if isinstance(r, asyncio.TimeoutError))
                errors = sum(1 for r in responses if isinstance(r, Exception) and not isinstance(r, asyncio.TimeoutError))
                success = sum(1 for r in responses if not isinstance(r, Exception))

                print(f"   Completed: {success}/100 requests in {elapsed:.2f}s")
                print(f"   Timeouts: {timeouts}")
                print(f"   Errors: {errors}")

                if timeouts > 10:
                    self.issues.append(Issue(
                        severity="HIGH",
                        category="Database Performance",
                        title="Connection pool exhaustion causing timeouts",
                        description=f"{timeouts} requests timed out under concurrent load",
                        observed_behavior=f"{timeouts}/100 requests exceeded 30s timeout",
                        performance_impact="Poor user experience, dropped requests under moderate load",
                        recommended_fix="Increase connection pool size (max_connections) in connection_pool.py or optimize query performance to reduce connection hold time"
                    ))

                if errors > 5:
                    self.issues.append(Issue(
                        severity="CRITICAL",
                        category="Database Performance",
                        title="Database errors under concurrent load",
                        description=f"{errors} requests failed with database errors",
                        observed_behavior=f"{errors}/100 requests returned errors",
                        performance_impact="Service reliability compromised, data may be unavailable",
                        recommended_fix="Check database logs for specific errors. May need to increase max_connections in PostgreSQL config or fix connection leaks"
                    ))

            except Exception as e:
                print(f"   {Colors.RED}Error: {e}{Colors.END}")
                self.issues.append(Issue(
                    severity="CRITICAL",
                    category="Database Performance",
                    title="Connection pool test failed completely",
                    description=str(e),
                    observed_behavior="Test crashed",
                    performance_impact="Severe - system unable to handle concurrent load",
                    recommended_fix="Debug connection pool configuration and ensure database is accessible"
                ))

    async def analyze_cache_performance(self):
        """Analyze caching behavior and effectiveness"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Analyzing Cache Performance{Colors.END}")
        print("─" * 70)

        async with aiohttp.ClientSession() as session:
            # Test 1: Cold vs warm cache
            print("\n1. Testing Cache Hit/Miss Performance...")

            # Clear cache (if endpoint exists)
            try:
                await session.post(f"{self.base_url}/cache/clear")
            except:
                pass

            # First request (cache miss)
            start = time.time()
            try:
                async with session.get(f"{self.base_url}/exploits?page=1&page_size=50") as response:
                    cold_time = (time.time() - start) * 1000
                    print(f"   Cold cache (miss): {cold_time:.0f}ms")
            except Exception as e:
                print(f"   Error: {e}")
                cold_time = 0

            # Second request (should be cached)
            await asyncio.sleep(0.1)
            start = time.time()
            try:
                async with session.get(f"{self.base_url}/exploits?page=1&page_size=50") as response:
                    warm_time = (time.time() - start) * 1000
                    print(f"   Warm cache (hit): {warm_time:.0f}ms")
            except Exception as e:
                print(f"   Error: {e}")
                warm_time = 0

            if cold_time > 0 and warm_time > 0:
                speedup = cold_time / warm_time if warm_time > 0 else 1
                print(f"   Speedup: {speedup:.2f}x")

                if speedup < 2:
                    self.issues.append(Issue(
                        severity="MEDIUM",
                        category="Caching",
                        title="Cache provides minimal performance benefit",
                        description=f"Cache only provides {speedup:.2f}x speedup",
                        observed_behavior=f"Cold: {cold_time:.0f}ms, Warm: {warm_time:.0f}ms",
                        performance_impact="Cache not effectively reducing database load",
                        recommended_fix="Verify cache is enabled and L1/L2 caching is working correctly. Check cache hit rate in Redis"
                    ))

            # Test 2: Cache invalidation
            print("\n2. Testing Cache Invalidation...")

            # Make same request twice
            await session.get(f"{self.base_url}/exploits?page=1")
            await session.get(f"{self.base_url}/exploits?page=1")

            # Check if cache stats endpoint exists
            try:
                async with session.get(f"{self.base_url}/cache/stats") as response:
                    if response.status == 200:
                        data = await response.json()
                        hit_rate = data.get('global', {}).get('hit_rate', 0)
                        print(f"   Cache hit rate: {hit_rate:.1f}%")

                        if hit_rate < 50:
                            self.issues.append(Issue(
                                severity="MEDIUM",
                                category="Caching",
                                title="Low cache hit rate",
                                description=f"Cache hit rate is only {hit_rate:.1f}%",
                                observed_behavior=f"Hit rate: {hit_rate:.1f}%",
                                performance_impact="Most requests hitting database, not leveraging cache",
                                recommended_fix="Increase cache TTL or adjust cache strategy to cache more frequently accessed data"
                            ))
            except:
                print("   Cache stats endpoint not available")

    async def analyze_query_performance(self):
        """Test query performance with various parameters"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Analyzing Query Performance{Colors.END}")
        print("─" * 70)

        async with aiohttp.ClientSession() as session:
            # Test different page sizes
            print("\n1. Testing Page Size Performance...")

            page_sizes = [10, 50, 100, 500, 1000, 5000]
            results = {}

            for page_size in page_sizes:
                start = time.time()
                try:
                    async with session.get(
                        f"{self.base_url}/exploits?page=1&page_size={page_size}",
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as response:
                        elapsed = (time.time() - start) * 1000
                        results[page_size] = (response.status, elapsed)

                        if response.status == 200:
                            print(f"   page_size={page_size:4d}: {elapsed:6.0f}ms")
                        else:
                            print(f"   page_size={page_size:4d}: status {response.status}")

                        # Check for slow queries
                        if elapsed > 3000 and response.status == 200:
                            self.issues.append(Issue(
                                severity="MEDIUM" if elapsed < 5000 else "HIGH",
                                category="Query Performance",
                                title=f"Slow query with page_size={page_size}",
                                description=f"Query took {elapsed:.0f}ms",
                                observed_behavior=f"Response time: {elapsed:.0f}ms for {page_size} records",
                                performance_impact="Poor user experience for large result sets",
                                recommended_fix="Add database indexes on frequently queried columns (timestamp, chain, protocol). Consider implementing cursor-based pagination."
                            ))

                except asyncio.TimeoutError:
                    print(f"   page_size={page_size:4d}: TIMEOUT (>30s)")
                    self.issues.append(Issue(
                        severity="CRITICAL",
                        category="Query Performance",
                        title=f"Query timeout with page_size={page_size}",
                        description="Query exceeded 30 second timeout",
                        observed_behavior="Request timed out",
                        performance_impact="Severe - endpoint unusable for large page sizes",
                        recommended_fix="Set maximum page_size limit (e.g., 1000), add query timeout, optimize database query with proper indexes"
                    ))
                except Exception as e:
                    print(f"   page_size={page_size:4d}: ERROR - {e}")

            # Test deep pagination
            print("\n2. Testing Deep Pagination Performance...")

            pages = [1, 10, 50, 100]
            for page in pages:
                start = time.time()
                try:
                    async with session.get(
                        f"{self.base_url}/exploits?page={page}&page_size=50",
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        elapsed = (time.time() - start) * 1000

                        if response.status == 200:
                            print(f"   page={page:3d}: {elapsed:6.0f}ms")

                            # Check for linear degradation (offset problem)
                            if page == 100 and elapsed > 2000:
                                self.issues.append(Issue(
                                    severity="MEDIUM",
                                    category="Query Performance",
                                    title="Deep pagination performance degrades",
                                    description=f"Page 100 takes {elapsed:.0f}ms",
                                    observed_behavior="Query time increases with offset",
                                    performance_impact="Poor performance for users browsing deep into results",
                                    recommended_fix="Implement cursor-based pagination or keyset pagination instead of OFFSET/LIMIT"
                                ))
                        else:
                            print(f"   page={page:3d}: status {response.status}")

                except asyncio.TimeoutError:
                    print(f"   page={page:3d}: TIMEOUT")
                except Exception as e:
                    print(f"   page={page:3d}: ERROR - {e}")

    async def analyze_edge_cases(self):
        """Test edge cases and error handling"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Analyzing Edge Cases & Error Handling{Colors.END}")
        print("─" * 70)

        async with aiohttp.ClientSession() as session:
            # Test 1: Invalid parameters
            print("\n1. Testing Invalid Parameter Handling...")

            test_cases = [
                ("/exploits?page=-1", "Negative page number"),
                ("/exploits?page=0", "Zero page number"),
                ("/exploits?page_size=-1", "Negative page size"),
                ("/exploits?page_size=999999", "Extremely large page size"),
                ("/exploits?page=abc", "Non-numeric page"),
                ("/exploits?days=-1", "Negative days filter"),
                ("/exploits?min_loss=-1000000", "Negative loss filter"),
            ]

            proper_error_handling = 0
            total_tests = len(test_cases)

            for endpoint, description in test_cases:
                try:
                    async with session.get(f"{self.base_url}{endpoint}") as response:
                        # Should return 400 or 422 (validation error)
                        if response.status in [400, 422]:
                            print(f"   ✓ {description}: status {response.status}")
                            proper_error_handling += 1
                        elif response.status == 500:
                            print(f"   ✗ {description}: SERVER ERROR 500")
                            self.issues.append(Issue(
                                severity="HIGH",
                                category="Error Handling",
                                title=f"Server crash on {description}",
                                description="Invalid parameter causes 500 error",
                                observed_behavior=f"GET {endpoint} returns 500",
                                performance_impact="Poor user experience, potential for abuse",
                                recommended_fix="Add input validation before database query. Use Pydantic models or FastAPI parameter validation"
                            ))
                        else:
                            print(f"   ? {description}: status {response.status}")
                except Exception as e:
                    print(f"   ✗ {description}: ERROR - {e}")

            print(f"\n   Proper error handling: {proper_error_handling}/{total_tests}")

            # Test 2: SQL injection attempts
            print("\n2. Testing SQL Injection Protection...")

            sql_payloads = [
                "' OR '1'='1",
                "'; DROP TABLE exploits; --",
                "1' UNION SELECT * FROM users--"
            ]

            safe = 0
            for payload in sql_payloads:
                try:
                    async with session.get(
                        f"{self.base_url}/exploits",
                        params={"search": payload}
                    ) as response:
                        # Should not crash (500) or return unexpected data
                        if response.status in [200, 400, 422]:
                            safe += 1
                            print(f"   ✓ Handled SQL injection attempt")
                        else:
                            print(f"   ? Status {response.status}")
                except Exception as e:
                    print(f"   ✗ Error: {e}")

            print(f"\n   SQL injection protection: {safe}/{len(sql_payloads)}")

            if safe < len(sql_payloads):
                self.issues.append(Issue(
                    severity="CRITICAL",
                    category="Security",
                    title="Potential SQL injection vulnerability",
                    description="SQL injection payloads not properly handled",
                    observed_behavior=f"Only {safe}/{len(sql_payloads)} injection attempts were safely handled",
                    performance_impact="Critical security vulnerability, potential data breach",
                    recommended_fix="Use parameterized queries everywhere. Never construct SQL with string concatenation. Audit all database query code."
                ))

    async def analyze_websocket_performance(self):
        """Test WebSocket connection limits and performance"""
        print(f"\n{Colors.BLUE}{Colors.BOLD}Analyzing WebSocket Performance{Colors.END}")
        print("─" * 70)

        print("\n1. Testing WebSocket Connection Limits...")
        print("   (WebSocket testing requires websockets library - skipping for now)")
        # TODO: Implement WebSocket load testing

    def print_issues_report(self):
        """Print comprehensive issues report"""
        print(f"\n{Colors.BOLD}{'═' * 70}{Colors.END}")
        print(f"{Colors.BOLD}DETAILED PERFORMANCE ANALYSIS REPORT{Colors.END}")
        print(f"{Colors.BOLD}{'═' * 70}{Colors.END}\n")

        # Group by severity
        critical = [i for i in self.issues if i.severity == "CRITICAL"]
        high = [i for i in self.issues if i.severity == "HIGH"]
        medium = [i for i in self.issues if i.severity == "MEDIUM"]
        low = [i for i in self.issues if i.severity == "LOW"]

        print(f"Total Issues Found: {len(self.issues)}")
        print(f"  {Colors.RED}CRITICAL: {len(critical)}{Colors.END}")
        print(f"  {Colors.YELLOW}HIGH: {len(high)}{Colors.END}")
        print(f"  {Colors.YELLOW}MEDIUM: {len(medium)}{Colors.END}")
        print(f"  LOW: {len(low)}\n")

        # Print critical issues
        if critical:
            print(f"{Colors.RED}{Colors.BOLD}CRITICAL ISSUES (BLOCKING PRODUCTION):{Colors.END}\n")
            for idx, issue in enumerate(critical, 1):
                self.print_issue(idx, issue)

        # Print high priority issues
        if high:
            print(f"\n{Colors.YELLOW}{Colors.BOLD}HIGH PRIORITY ISSUES:{Colors.END}\n")
            for idx, issue in enumerate(high, 1):
                self.print_issue(idx, issue)

        # Print medium priority issues
        if medium:
            print(f"\n{Colors.YELLOW}MEDIUM PRIORITY ISSUES:{Colors.END}\n")
            for idx, issue in enumerate(medium, 1):
                self.print_issue(idx, issue)

        # Print recommendations
        if critical or high:
            print(f"\n{Colors.BOLD}IMMEDIATE ACTIONS REQUIRED:{Colors.END}\n")
            if critical:
                print(f"{Colors.RED}1. FIX ALL CRITICAL ISSUES BEFORE PRODUCTION{Colors.END}")
            if high:
                print("2. Address high priority issues within 1 week")
            if medium:
                print("3. Schedule medium priority fixes for next sprint")

        print(f"\n{Colors.BOLD}{'═' * 70}{Colors.END}\n")

    def print_issue(self, idx: int, issue: Issue):
        """Print detailed issue information"""
        color = Colors.RED if issue.severity == "CRITICAL" else Colors.YELLOW

        print(f"{color}{Colors.BOLD}[{issue.severity}] {issue.title}{Colors.END}")
        print(f"Category: {issue.category}")
        print(f"Description: {issue.description}")
        print(f"Observed: {issue.observed_behavior}")
        print(f"Impact: {issue.performance_impact}")
        print(f"{Colors.GREEN}Fix: {issue.recommended_fix}{Colors.END}")
        print()


async def main():
    """Run detailed performance analysis"""
    print(f"{Colors.BOLD}{'═' * 70}{Colors.END}")
    print(f"{Colors.BOLD}KAMIYO PLATFORM - DETAILED PERFORMANCE ANALYSIS{Colors.END}")
    print(f"{Colors.BOLD}{'═' * 70}{Colors.END}")
    print(f"\nStarted at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    print(f"Target: {base_url}\n")

    analyzer = DetailedAnalyzer(base_url)

    # Run all analysis tests
    await analyzer.analyze_rate_limiting_enforcement()
    await analyzer.analyze_database_connection_pool()
    await analyzer.analyze_cache_performance()
    await analyzer.analyze_query_performance()
    await analyzer.analyze_edge_cases()
    # await analyzer.analyze_websocket_performance()  # TODO

    # Print final report
    analyzer.print_issues_report()


if __name__ == "__main__":
    asyncio.run(main())
