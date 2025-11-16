#!/usr/bin/env python3
"""
Load testing for ERC-8004 API
Tests performance under concurrent load
"""

import asyncio
import aiohttp
import time
from datetime import datetime
from typing import List, Dict
import statistics
import sys


BASE_URL = "http://localhost:8000/api/v1/agents"
API_KEY = "test_api_key"


class LoadTestResults:
    """Container for load test results"""

    def __init__(self):
        self.durations: List[float] = []
        self.errors: List[str] = []
        self.status_codes: Dict[int, int] = {}

    def add_result(self, duration: float, status_code: int, error: str = None):
        self.durations.append(duration)
        self.status_codes[status_code] = self.status_codes.get(status_code, 0) + 1
        if error:
            self.errors.append(error)

    def print_summary(self, test_name: str, total_time: float):
        print(f"\n{'='*60}")
        print(f"Load Test Results: {test_name}")
        print(f"{'='*60}")
        print(f"Total requests: {len(self.durations)}")
        print(f"Total time: {total_time:.2f}s")
        print(f"Requests/sec: {len(self.durations)/total_time:.2f}")
        print(f"\nDuration stats (seconds):")
        if self.durations:
            print(f"  Min: {min(self.durations):.3f}")
            print(f"  Max: {max(self.durations):.3f}")
            print(f"  Mean: {statistics.mean(self.durations):.3f}")
            print(f"  Median: {statistics.median(self.durations):.3f}")
            print(f"  P95: {statistics.quantiles(self.durations, n=20)[18]:.3f}")
            print(f"  P99: {statistics.quantiles(self.durations, n=100)[98]:.3f}")
        print(f"\nStatus codes:")
        for code, count in sorted(self.status_codes.items()):
            print(f"  {code}: {count}")
        if self.errors:
            print(f"\nErrors: {len(self.errors)}")
            for error in self.errors[:5]:
                print(f"  - {error}")


async def make_request(
    session: aiohttp.ClientSession,
    method: str,
    url: str,
    **kwargs
) -> tuple[float, int, str]:
    """Make HTTP request and return duration, status, error"""
    start = time.time()
    error = None
    status_code = 0

    try:
        async with session.request(method, url, **kwargs) as response:
            status_code = response.status
            await response.read()
            duration = time.time() - start
            return duration, status_code, error
    except Exception as e:
        duration = time.time() - start
        error = str(e)
        return duration, status_code, error


async def test_agent_search(concurrent: int = 100, iterations: int = 10):
    """
    Test agent search endpoint under load

    Target: >200 RPS with <500ms p95 latency
    """
    results = LoadTestResults()

    headers = {"Authorization": f"Bearer {API_KEY}"}

    async with aiohttp.ClientSession(headers=headers) as session:
        start_time = time.time()

        for _ in range(iterations):
            tasks = []
            for i in range(concurrent):
                url = f"{BASE_URL}/?limit=10&offset={i*10}"
                tasks.append(make_request(session, "GET", url))

            batch_results = await asyncio.gather(*tasks)
            for duration, status, error in batch_results:
                results.add_result(duration, status, error)

        total_time = time.time() - start_time

    results.print_summary("Agent Search", total_time)

    rps = len(results.durations) / total_time
    p95 = statistics.quantiles(results.durations, n=20)[18] if results.durations else 0

    success = rps > 200 and p95 < 0.5
    print(f"\n{'PASS' if success else 'FAIL'}: Target >200 RPS with <500ms p95")
    print(f"  Actual: {rps:.2f} RPS with {p95*1000:.0f}ms p95")

    return success


async def test_agent_stats(concurrent: int = 50, iterations: int = 20):
    """
    Test agent stats endpoint (with caching)

    Target: Fast response with high cache hit rate
    """
    results = LoadTestResults()

    agent_uuid = "test-uuid-1"
    headers = {"Authorization": f"Bearer {API_KEY}"}

    async with aiohttp.ClientSession(headers=headers) as session:
        start_time = time.time()

        for _ in range(iterations):
            tasks = []
            for _ in range(concurrent):
                url = f"{BASE_URL}/{agent_uuid}/stats"
                tasks.append(make_request(session, "GET", url))

            batch_results = await asyncio.gather(*tasks)
            for duration, status, error in batch_results:
                results.add_result(duration, status, error)

        total_time = time.time() - start_time

    results.print_summary("Agent Stats (Cached)", total_time)

    rps = len(results.durations) / total_time
    p95 = statistics.quantiles(results.durations, n=20)[18] if results.durations else 0

    success = rps > 500 and p95 < 0.1
    print(f"\n{'PASS' if success else 'FAIL'}: Target >500 RPS with <100ms p95 (cached)")
    print(f"  Actual: {rps:.2f} RPS with {p95*1000:.0f}ms p95")

    return success


async def test_mixed_workload(duration_seconds: int = 60):
    """
    Test mixed workload simulating real usage

    Mix of:
    - 70% search queries
    - 20% agent stats
    - 10% feedback submissions
    """
    results = LoadTestResults()

    headers = {"Authorization": f"Bearer {API_KEY}"}

    async with aiohttp.ClientSession(headers=headers) as session:
        start_time = time.time()
        request_count = 0

        while time.time() - start_time < duration_seconds:
            tasks = []

            for i in range(100):
                rand = i % 10

                if rand < 7:
                    url = f"{BASE_URL}/?limit=10"
                    tasks.append(make_request(session, "GET", url))
                elif rand < 9:
                    url = f"{BASE_URL}/test-uuid/stats"
                    tasks.append(make_request(session, "GET", url))
                else:
                    url = f"{BASE_URL}/feedback"
                    data = {
                        "agent_uuid": "test-uuid",
                        "client_address": "0x" + "0" * 40,
                        "score": 85
                    }
                    tasks.append(make_request(session, "POST", url, json=data))

            batch_results = await asyncio.gather(*tasks)
            for duration, status, error in batch_results:
                results.add_result(duration, status, error)
                request_count += 1

        total_time = time.time() - start_time

    results.print_summary("Mixed Workload", total_time)

    rps = len(results.durations) / total_time
    print(f"\nSustained RPS: {rps:.2f}")

    return True


async def run_all_tests():
    """Run all load tests"""
    print("Starting ERC-8004 Load Tests")
    print(f"Target: {BASE_URL}")
    print(f"Time: {datetime.now()}")

    tests = [
        ("Agent Search", lambda: test_agent_search(concurrent=100, iterations=10)),
        ("Agent Stats (Cached)", lambda: test_agent_stats(concurrent=50, iterations=20)),
        ("Mixed Workload", lambda: test_mixed_workload(duration_seconds=30)),
    ]

    results = []

    for test_name, test_func in tests:
        print(f"\n\nRunning: {test_name}")
        print("="*60)
        try:
            passed = await test_func()
            results.append((test_name, passed))
        except Exception as e:
            print(f"ERROR: {e}")
            results.append((test_name, False))

        await asyncio.sleep(2)

    print("\n\n" + "="*60)
    print("FINAL RESULTS")
    print("="*60)
    for test_name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"{status}: {test_name}")

    all_passed = all(passed for _, passed in results)
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    asyncio.run(run_all_tests())
