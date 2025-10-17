#!/usr/bin/env python3
"""
Comprehensive Load Testing Suite for Kamiyo Platform
Tests performance under realistic production load, concurrent users, and adversarial conditions
"""

import asyncio
import aiohttp
import time
import statistics
import json
import sys
import random
import string
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import multiprocessing

# ANSI color codes
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'


@dataclass
class LoadTestResult:
    """Result of a load test scenario"""
    scenario_name: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    rate_limited: int
    response_times: List[float] = field(default_factory=list)
    errors: Dict[str, int] = field(default_factory=dict)
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def success_rate(self) -> float:
        return (self.successful_requests / self.total_requests * 100) if self.total_requests > 0 else 0

    @property
    def avg_response_time(self) -> float:
        return statistics.mean(self.response_times) if self.response_times else 0

    @property
    def p50_response_time(self) -> float:
        return statistics.median(self.response_times) if self.response_times else 0

    @property
    def p95_response_time(self) -> float:
        if not self.response_times:
            return 0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[idx]

    @property
    def p99_response_time(self) -> float:
        if not self.response_times:
            return 0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[idx]

    @property
    def max_response_time(self) -> float:
        return max(self.response_times) if self.response_times else 0

    @property
    def min_response_time(self) -> float:
        return min(self.response_times) if self.response_times else 0

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time

    @property
    def requests_per_second(self) -> float:
        return self.total_requests / self.duration if self.duration > 0 else 0


class LoadTester:
    """Load testing framework for Kamiyo platform"""

    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.results: List[LoadTestResult] = []

    async def make_request(
        self,
        session: aiohttp.ClientSession,
        method: str,
        endpoint: str,
        headers: Dict = None,
        json_data: Dict = None,
        params: Dict = None
    ) -> Tuple[int, float, str]:
        """
        Make HTTP request and return status, response time, and error message

        Returns:
            (status_code, response_time_ms, error_message)
        """
        url = f"{self.base_url}{endpoint}"
        start = time.time()
        error_msg = ""

        try:
            async with session.request(
                method,
                url,
                headers=headers,
                json=json_data,
                params=params,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                await response.read()  # Read body to complete request
                elapsed = (time.time() - start) * 1000  # Convert to ms
                return response.status, elapsed, ""

        except asyncio.TimeoutError:
            elapsed = (time.time() - start) * 1000
            return 0, elapsed, "Timeout"
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            return 0, elapsed, str(e)

    async def concurrent_requests_test(
        self,
        num_requests: int,
        endpoint: str,
        method: str = "GET",
        concurrency: int = 10,
        headers: Dict = None,
        json_data: Dict = None
    ) -> LoadTestResult:
        """
        Test with concurrent requests

        Args:
            num_requests: Total number of requests to make
            endpoint: API endpoint to test
            method: HTTP method
            concurrency: Number of concurrent requests
            headers: Request headers
            json_data: JSON payload
        """
        result = LoadTestResult(
            scenario_name=f"Concurrent {method} {endpoint}",
            total_requests=num_requests,
            successful_requests=0,
            failed_requests=0,
            rate_limited=0
        )

        result.start_time = time.time()

        async with aiohttp.ClientSession() as session:
            # Create batches of concurrent requests
            for batch_start in range(0, num_requests, concurrency):
                batch_size = min(concurrency, num_requests - batch_start)

                # Create tasks for this batch
                tasks = [
                    self.make_request(session, method, endpoint, headers, json_data)
                    for _ in range(batch_size)
                ]

                # Execute batch concurrently
                responses = await asyncio.gather(*tasks)

                # Process results
                for status, elapsed, error in responses:
                    result.response_times.append(elapsed)

                    if status == 200:
                        result.successful_requests += 1
                    elif status == 429:
                        result.rate_limited += 1
                    else:
                        result.failed_requests += 1

                    if error:
                        result.errors[error] = result.errors.get(error, 0) + 1

        result.end_time = time.time()
        return result

    async def sustained_load_test(
        self,
        duration_seconds: int,
        requests_per_second: int,
        endpoint: str,
        method: str = "GET"
    ) -> LoadTestResult:
        """
        Test sustained load over time

        Args:
            duration_seconds: How long to run the test
            requests_per_second: Target RPS
            endpoint: API endpoint
            method: HTTP method
        """
        result = LoadTestResult(
            scenario_name=f"Sustained Load: {requests_per_second} RPS for {duration_seconds}s",
            total_requests=0,
            successful_requests=0,
            failed_requests=0,
            rate_limited=0
        )

        result.start_time = time.time()

        async with aiohttp.ClientSession() as session:
            end_time = time.time() + duration_seconds

            while time.time() < end_time:
                batch_start = time.time()

                # Create tasks for this second
                tasks = [
                    self.make_request(session, method, endpoint)
                    for _ in range(requests_per_second)
                ]

                result.total_requests += len(tasks)

                # Execute batch
                responses = await asyncio.gather(*tasks)

                # Process results
                for status, elapsed, error in responses:
                    result.response_times.append(elapsed)

                    if status == 200:
                        result.successful_requests += 1
                    elif status == 429:
                        result.rate_limited += 1
                    else:
                        result.failed_requests += 1

                    if error:
                        result.errors[error] = result.errors.get(error, 0) + 1

                # Sleep to maintain RPS (if we finished early)
                elapsed = time.time() - batch_start
                if elapsed < 1.0:
                    await asyncio.sleep(1.0 - elapsed)

        result.end_time = time.time()
        return result

    async def spike_test(
        self,
        baseline_rps: int,
        spike_rps: int,
        baseline_duration: int,
        spike_duration: int,
        endpoint: str
    ) -> LoadTestResult:
        """
        Test response to sudden spike in traffic

        Args:
            baseline_rps: Normal request rate
            spike_rps: Spike request rate
            baseline_duration: Duration of baseline load (seconds)
            spike_duration: Duration of spike (seconds)
            endpoint: API endpoint
        """
        result = LoadTestResult(
            scenario_name=f"Spike Test: {baseline_rps}→{spike_rps} RPS",
            total_requests=0,
            successful_requests=0,
            failed_requests=0,
            rate_limited=0
        )

        result.start_time = time.time()

        async with aiohttp.ClientSession() as session:
            # Phase 1: Baseline load
            for _ in range(baseline_duration):
                tasks = [
                    self.make_request(session, "GET", endpoint)
                    for _ in range(baseline_rps)
                ]
                result.total_requests += len(tasks)
                responses = await asyncio.gather(*tasks)

                for status, elapsed, error in responses:
                    result.response_times.append(elapsed)
                    if status == 200:
                        result.successful_requests += 1
                    elif status == 429:
                        result.rate_limited += 1
                    else:
                        result.failed_requests += 1
                    if error:
                        result.errors[error] = result.errors.get(error, 0) + 1

                await asyncio.sleep(1)

            # Phase 2: Spike
            for _ in range(spike_duration):
                tasks = [
                    self.make_request(session, "GET", endpoint)
                    for _ in range(spike_rps)
                ]
                result.total_requests += len(tasks)
                responses = await asyncio.gather(*tasks)

                for status, elapsed, error in responses:
                    result.response_times.append(elapsed)
                    if status == 200:
                        result.successful_requests += 1
                    elif status == 429:
                        result.rate_limited += 1
                    else:
                        result.failed_requests += 1
                    if error:
                        result.errors[error] = result.errors.get(error, 0) + 1

                await asyncio.sleep(1)

        result.end_time = time.time()
        return result

    async def adversarial_test(self) -> LoadTestResult:
        """
        Test with adversarial inputs (SQL injection, XSS, malformed data)
        """
        result = LoadTestResult(
            scenario_name="Adversarial Input Test",
            total_requests=0,
            successful_requests=0,
            failed_requests=0,
            rate_limited=0
        )

        result.start_time = time.time()

        # SQL injection attempts
        sql_payloads = [
            "' OR '1'='1",
            "'; DROP TABLE users; --",
            "1' UNION SELECT * FROM users--",
            "admin'--",
            "1' AND 1=1--"
        ]

        # XSS payloads
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "javascript:alert('XSS')",
            "<svg onload=alert('XSS')>",
        ]

        # Malformed inputs
        malformed_payloads = [
            "A" * 10000,  # Very long string
            "\x00\x01\x02",  # Binary data
            "../../../../../../etc/passwd",  # Path traversal
            "%00",  # Null byte
            "\n\n\n\n",  # Newlines
        ]

        async with aiohttp.ClientSession() as session:
            # Test SQL injection in query params
            for payload in sql_payloads:
                status, elapsed, error = await self.make_request(
                    session, "GET", "/exploits",
                    params={"search": payload}
                )
                result.total_requests += 1
                result.response_times.append(elapsed)

                # Should reject or sanitize (not 500)
                if status in [200, 400, 422]:
                    result.successful_requests += 1
                else:
                    result.failed_requests += 1
                    result.errors[f"SQL Injection not handled: {status}"] = \
                        result.errors.get(f"SQL Injection not handled: {status}", 0) + 1

            # Test XSS in search
            for payload in xss_payloads:
                status, elapsed, error = await self.make_request(
                    session, "GET", "/exploits",
                    params={"search": payload}
                )
                result.total_requests += 1
                result.response_times.append(elapsed)

                if status in [200, 400, 422]:
                    result.successful_requests += 1
                else:
                    result.failed_requests += 1
                    result.errors[f"XSS not handled: {status}"] = \
                        result.errors.get(f"XSS not handled: {status}", 0) + 1

            # Test malformed inputs
            for payload in malformed_payloads:
                status, elapsed, error = await self.make_request(
                    session, "GET", "/exploits",
                    params={"page": payload}
                )
                result.total_requests += 1
                result.response_times.append(elapsed)

                # Should reject gracefully (400/422)
                if status in [400, 422]:
                    result.successful_requests += 1
                elif status == 500:
                    result.failed_requests += 1
                    result.errors["Server crash on malformed input"] = \
                        result.errors.get("Server crash on malformed input", 0) + 1
                else:
                    result.successful_requests += 1

            # Test extremely large payloads
            large_payload = {"data": "X" * 1000000}  # 1MB
            status, elapsed, error = await self.make_request(
                session, "POST", "/exploits",
                json_data=large_payload
            )
            result.total_requests += 1
            result.response_times.append(elapsed)

            # Should reject (413 or 400)
            if status in [413, 400, 404, 405]:  # Method might not be allowed
                result.successful_requests += 1
            else:
                result.failed_requests += 1
                result.errors[f"Large payload handling: {status}"] = 1

        result.end_time = time.time()
        return result

    async def database_stress_test(self) -> LoadTestResult:
        """
        Test database performance with large result sets and complex queries
        """
        result = LoadTestResult(
            scenario_name="Database Stress Test",
            total_requests=0,
            successful_requests=0,
            failed_requests=0,
            rate_limited=0
        )

        result.start_time = time.time()

        async with aiohttp.ClientSession() as session:
            # Test large page sizes
            for page_size in [100, 500, 1000, 5000]:
                status, elapsed, error = await self.make_request(
                    session, "GET", "/exploits",
                    params={"page": 1, "page_size": page_size}
                )
                result.total_requests += 1
                result.response_times.append(elapsed)

                if status == 200:
                    result.successful_requests += 1
                    if elapsed > 5000:  # More than 5 seconds
                        result.errors[f"Slow query: page_size={page_size}, {elapsed:.0f}ms"] = 1
                else:
                    result.failed_requests += 1
                    result.errors[f"Failed page_size={page_size}: status {status}"] = 1

            # Test deep pagination
            for page in [1, 10, 50, 100, 500]:
                status, elapsed, error = await self.make_request(
                    session, "GET", "/exploits",
                    params={"page": page, "page_size": 50}
                )
                result.total_requests += 1
                result.response_times.append(elapsed)

                if status == 200:
                    result.successful_requests += 1
                    if elapsed > 3000:
                        result.errors[f"Slow deep pagination: page={page}, {elapsed:.0f}ms"] = 1
                else:
                    result.failed_requests += 1

            # Test complex filters (if supported)
            filter_tests = [
                {"chain": "Ethereum"},
                {"protocol": "Uniswap"},
                {"min_loss": 1000000},
                {"days": 365},
                {"chain": "Ethereum", "days": 90},
            ]

            for filters in filter_tests:
                status, elapsed, error = await self.make_request(
                    session, "GET", "/exploits",
                    params=filters
                )
                result.total_requests += 1
                result.response_times.append(elapsed)

                if status == 200:
                    result.successful_requests += 1
                else:
                    result.failed_requests += 1

        result.end_time = time.time()
        return result

    async def rate_limiting_test(self) -> LoadTestResult:
        """
        Test rate limiting enforcement across different tiers
        """
        result = LoadTestResult(
            scenario_name="Rate Limiting Test",
            total_requests=0,
            successful_requests=0,
            failed_requests=0,
            rate_limited=0
        )

        result.start_time = time.time()

        async with aiohttp.ClientSession() as session:
            # Free tier: Should rate limit quickly
            free_tier_user = ''.join(random.choices(string.ascii_letters, k=10))

            # Rapid fire requests (should trigger rate limit)
            for i in range(100):
                status, elapsed, error = await self.make_request(
                    session, "GET", "/exploits",
                    headers={"X-API-Key": f"free_{free_tier_user}"}
                )
                result.total_requests += 1
                result.response_times.append(elapsed)

                if status == 200:
                    result.successful_requests += 1
                elif status == 429:
                    result.rate_limited += 1
                else:
                    result.failed_requests += 1

            # Check if rate limiting kicked in
            if result.rate_limited == 0:
                result.errors["Rate limiting not enforced"] = 1

        result.end_time = time.time()
        return result

    def print_result(self, result: LoadTestResult, severity: str = "INFO"):
        """Print test result with formatting"""

        # Determine color based on severity and metrics
        if severity == "CRITICAL" or result.success_rate < 90:
            color = Colors.RED
            icon = "✗"
        elif severity == "HIGH" or result.success_rate < 95:
            color = Colors.YELLOW
            icon = "⚠"
        else:
            color = Colors.GREEN
            icon = "✓"

        print(f"\n{color}{Colors.BOLD}{icon} {result.scenario_name}{Colors.END}")
        print(f"{Colors.CYAN}{'─' * 70}{Colors.END}")

        print(f"Total Requests:     {result.total_requests}")
        print(f"Successful:         {result.successful_requests} ({result.success_rate:.1f}%)")
        print(f"Failed:             {result.failed_requests}")
        print(f"Rate Limited:       {result.rate_limited}")
        print(f"Duration:           {result.duration:.2f}s")
        print(f"Throughput:         {result.requests_per_second:.2f} req/s")

        print(f"\n{Colors.BOLD}Response Times:{Colors.END}")
        print(f"  Min:              {result.min_response_time:.0f}ms")
        print(f"  Avg:              {result.avg_response_time:.0f}ms")
        print(f"  Median (P50):     {result.p50_response_time:.0f}ms")
        print(f"  P95:              {result.p95_response_time:.0f}ms")
        print(f"  P99:              {result.p99_response_time:.0f}ms")
        print(f"  Max:              {result.max_response_time:.0f}ms")

        if result.errors:
            print(f"\n{Colors.YELLOW}{Colors.BOLD}Errors:{Colors.END}")
            for error, count in result.errors.items():
                print(f"  {error}: {count}")

        # Performance warnings
        if result.avg_response_time > 1000:
            print(f"{Colors.YELLOW}⚠ WARNING: High average response time{Colors.END}")
        if result.p95_response_time > 3000:
            print(f"{Colors.YELLOW}⚠ WARNING: High P95 response time{Colors.END}")
        if result.success_rate < 95:
            print(f"{Colors.RED}⚠ CRITICAL: Low success rate{Colors.END}")

    def print_summary(self):
        """Print summary of all tests"""
        print(f"\n{Colors.BOLD}{'═' * 70}{Colors.END}")
        print(f"{Colors.BOLD}LOAD TEST SUMMARY{Colors.END}")
        print(f"{Colors.BOLD}{'═' * 70}{Colors.END}\n")

        total_requests = sum(r.total_requests for r in self.results)
        total_successful = sum(r.successful_requests for r in self.results)
        total_failed = sum(r.failed_requests for r in self.results)
        total_rate_limited = sum(r.rate_limited for r in self.results)

        avg_success_rate = statistics.mean([r.success_rate for r in self.results])
        avg_response_time = statistics.mean([r.avg_response_time for r in self.results])
        max_p99 = max([r.p99_response_time for r in self.results])

        print(f"Total Requests:     {total_requests}")
        print(f"Successful:         {total_successful} ({avg_success_rate:.1f}%)")
        print(f"Failed:             {total_failed}")
        print(f"Rate Limited:       {total_rate_limited}")
        print(f"Avg Response Time:  {avg_response_time:.0f}ms")
        print(f"Max P99:            {max_p99:.0f}ms")

        # Critical issues
        critical_issues = []
        high_issues = []
        medium_issues = []

        for result in self.results:
            if result.success_rate < 90:
                critical_issues.append(f"{result.scenario_name}: {result.success_rate:.1f}% success rate")
            elif result.success_rate < 95:
                high_issues.append(f"{result.scenario_name}: {result.success_rate:.1f}% success rate")

            if result.p99_response_time > 5000:
                critical_issues.append(f"{result.scenario_name}: P99 {result.p99_response_time:.0f}ms")
            elif result.p99_response_time > 3000:
                high_issues.append(f"{result.scenario_name}: P99 {result.p99_response_time:.0f}ms")

            if result.avg_response_time > 2000:
                high_issues.append(f"{result.scenario_name}: Avg {result.avg_response_time:.0f}ms")
            elif result.avg_response_time > 1000:
                medium_issues.append(f"{result.scenario_name}: Avg {result.avg_response_time:.0f}ms")

        if critical_issues:
            print(f"\n{Colors.RED}{Colors.BOLD}CRITICAL ISSUES:{Colors.END}")
            for issue in critical_issues:
                print(f"  ✗ {issue}")

        if high_issues:
            print(f"\n{Colors.YELLOW}{Colors.BOLD}HIGH PRIORITY ISSUES:{Colors.END}")
            for issue in high_issues:
                print(f"  ⚠ {issue}")

        if medium_issues:
            print(f"\n{Colors.YELLOW}MEDIUM PRIORITY ISSUES:{Colors.END}")
            for issue in medium_issues:
                print(f"  • {issue}")

        if not critical_issues and not high_issues:
            print(f"\n{Colors.GREEN}{Colors.BOLD}✓ All tests passed with acceptable performance{Colors.END}")

        print(f"\n{Colors.BOLD}{'═' * 70}{Colors.END}\n")


async def main():
    """Run all load tests"""
    print(f"{Colors.BOLD}{'═' * 70}{Colors.END}")
    print(f"{Colors.BOLD}KAMIYO PLATFORM - LOAD TESTING SUITE{Colors.END}")
    print(f"{Colors.BOLD}{'═' * 70}{Colors.END}")
    print(f"\nStarted at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    print(f"Target: {base_url}\n")

    tester = LoadTester(base_url)

    # Test 1: Concurrent users
    print(f"\n{Colors.BLUE}{Colors.BOLD}TEST 1: Concurrent Users{Colors.END}")
    result = await tester.concurrent_requests_test(
        num_requests=100,
        endpoint="/exploits",
        concurrency=50
    )
    tester.results.append(result)
    tester.print_result(result)

    # Test 2: Sustained load
    print(f"\n{Colors.BLUE}{Colors.BOLD}TEST 2: Sustained Load{Colors.END}")
    result = await tester.sustained_load_test(
        duration_seconds=30,
        requests_per_second=10,
        endpoint="/exploits"
    )
    tester.results.append(result)
    tester.print_result(result)

    # Test 3: Spike test
    print(f"\n{Colors.BLUE}{Colors.BOLD}TEST 3: Traffic Spike{Colors.END}")
    result = await tester.spike_test(
        baseline_rps=5,
        spike_rps=50,
        baseline_duration=10,
        spike_duration=5,
        endpoint="/exploits"
    )
    tester.results.append(result)
    tester.print_result(result)

    # Test 4: Adversarial inputs
    print(f"\n{Colors.BLUE}{Colors.BOLD}TEST 4: Adversarial Inputs{Colors.END}")
    result = await tester.adversarial_test()
    tester.results.append(result)
    tester.print_result(result)

    # Test 5: Database stress
    print(f"\n{Colors.BLUE}{Colors.BOLD}TEST 5: Database Stress{Colors.END}")
    result = await tester.database_stress_test()
    tester.results.append(result)
    tester.print_result(result)

    # Test 6: Rate limiting
    print(f"\n{Colors.BLUE}{Colors.BOLD}TEST 6: Rate Limiting{Colors.END}")
    result = await tester.rate_limiting_test()
    tester.results.append(result)
    tester.print_result(result)

    # Print final summary
    tester.print_summary()


if __name__ == "__main__":
    asyncio.run(main())
