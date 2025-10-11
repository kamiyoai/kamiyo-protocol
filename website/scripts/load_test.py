#!/usr/bin/env python3
"""
Kamiyo Load Testing Suite
Tests system performance under various load conditions using Locust
"""

from locust import HttpUser, task, between, events
import random
import json
import time
from datetime import datetime

# Test configuration
TEST_API_KEYS = [
    "test_key_1",  # Replace with actual test keys
    "test_key_2",
    "test_key_3"
]

TEST_USERS = [
    {"email": "loadtest1@example.com", "password": "LoadTest123!"},
    {"email": "loadtest2@example.com", "password": "LoadTest123!"},
    {"email": "loadtest3@example.com", "password": "LoadTest123!"}
]

CHAINS = ["ethereum", "bsc", "polygon", "arbitrum", "optimism", "avalanche"]
EXPLOIT_TYPES = ["reentrancy", "flash_loan", "oracle_manipulation", "access_control"]

# Metrics tracking
response_times = []
error_count = 0
success_count = 0

@events.quitting.add_listener
def on_test_quit(environment, **kwargs):
    """Save test results when quitting"""
    if response_times:
        avg_response = sum(response_times) / len(response_times)
        p95_response = sorted(response_times)[int(len(response_times) * 0.95)]
        p99_response = sorted(response_times)[int(len(response_times) * 0.99)]

        results = {
            "timestamp": datetime.utcnow().isoformat(),
            "total_requests": len(response_times),
            "success_count": success_count,
            "error_count": error_count,
            "error_rate": error_count / (success_count + error_count) * 100,
            "avg_response_time": avg_response,
            "p95_response_time": p95_response,
            "p99_response_time": p99_response,
            "min_response_time": min(response_times),
            "max_response_time": max(response_times)
        }

        with open("load_test_results.json", "w") as f:
            json.dump(results, f, indent=2)

        print("\n" + "="*60)
        print("LOAD TEST RESULTS")
        print("="*60)
        print(f"Total Requests:    {results['total_requests']}")
        print(f"Success:           {results['success_count']}")
        print(f"Errors:            {results['error_count']}")
        print(f"Error Rate:        {results['error_rate']:.2f}%")
        print(f"Avg Response:      {results['avg_response_time']:.2f}ms")
        print(f"P95 Response:      {results['p95_response_time']:.2f}ms")
        print(f"P99 Response:      {results['p99_response_time']:.2f}ms")
        print("="*60)

class ExploitAPIUser(HttpUser):
    """Simulates a user accessing the Kamiyo API"""
    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks

    def on_start(self):
        """Setup: Login and get API key"""
        self.api_key = random.choice(TEST_API_KEYS)
        self.user_data = random.choice(TEST_USERS)
        self.auth_token = None

    @task(10)
    def fetch_latest_exploits(self):
        """Most common task: Fetch latest exploits"""
        headers = {"X-API-Key": self.api_key}
        with self.client.get(
            "/api/v1/exploits?limit=20",
            headers=headers,
            catch_response=True
        ) as response:
            self._track_response(response)

    @task(5)
    def filter_by_chain(self):
        """Filter exploits by blockchain"""
        chain = random.choice(CHAINS)
        headers = {"X-API-Key": self.api_key}
        with self.client.get(
            f"/api/v1/exploits?chain={chain}&limit=20",
            headers=headers,
            catch_response=True
        ) as response:
            self._track_response(response)

    @task(5)
    def search_exploits(self):
        """Search exploits by keyword"""
        query = random.choice(EXPLOIT_TYPES)
        headers = {"X-API-Key": self.api_key}
        with self.client.get(
            f"/api/v1/exploits/search?q={query}",
            headers=headers,
            catch_response=True
        ) as response:
            self._track_response(response)

    @task(3)
    def get_exploit_stats(self):
        """Get exploit statistics"""
        headers = {"X-API-Key": self.api_key}
        with self.client.get(
            "/api/v1/exploits/stats",
            headers=headers,
            catch_response=True
        ) as response:
            self._track_response(response)

    @task(2)
    def get_chain_stats(self):
        """Get chain-specific statistics"""
        chain = random.choice(CHAINS)
        headers = {"X-API-Key": self.api_key}
        with self.client.get(
            f"/api/v1/exploits/stats?chain={chain}",
            headers=headers,
            catch_response=True
        ) as response:
            self._track_response(response)

    @task(2)
    def get_exploit_by_id(self):
        """Get specific exploit details"""
        exploit_id = random.randint(1, 1000)  # Assuming IDs 1-1000 exist
        headers = {"X-API-Key": self.api_key}
        with self.client.get(
            f"/api/v1/exploits/{exploit_id}",
            headers=headers,
            catch_response=True
        ) as response:
            # 404s are expected for non-existent IDs
            if response.status_code in [200, 404]:
                response.success()
            self._track_response(response)

    @task(1)
    def check_subscription_status(self):
        """Check user subscription status (authenticated)"""
        if not self.auth_token:
            self._login()

        if self.auth_token:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            with self.client.get(
                "/api/v1/subscriptions/status",
                headers=headers,
                catch_response=True
            ) as response:
                self._track_response(response)

    @task(1)
    def get_api_usage(self):
        """Get API usage statistics (authenticated)"""
        if not self.auth_token:
            self._login()

        if self.auth_token:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            with self.client.get(
                "/api/v1/usage/stats",
                headers=headers,
                catch_response=True
            ) as response:
                self._track_response(response)

    def _login(self):
        """Helper: Login to get auth token"""
        response = self.client.post(
            "/api/v1/auth/login",
            json=self.user_data
        )
        if response.status_code == 200:
            self.auth_token = response.json().get("access_token")

    def _track_response(self, response):
        """Track response metrics"""
        global response_times, error_count, success_count

        response_time = response.elapsed.total_seconds() * 1000  # Convert to ms
        response_times.append(response_time)

        if response.status_code >= 400:
            error_count += 1
        else:
            success_count += 1


class WebSocketUser(HttpUser):
    """Simulates WebSocket connections for real-time updates"""
    wait_time = between(5, 10)

    def on_start(self):
        self.api_key = random.choice(TEST_API_KEYS)

    @task
    def connect_websocket(self):
        """Simulate WebSocket connection"""
        # Note: Locust doesn't natively support WebSockets well
        # This is a placeholder - use a dedicated WebSocket load tester
        pass


class AdminUser(HttpUser):
    """Simulates admin operations"""
    wait_time = between(10, 30)

    def on_start(self):
        self.admin_token = None
        # Admin login would go here

    @task(1)
    def view_metrics(self):
        """View system metrics"""
        if self.admin_token:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            with self.client.get(
                "/api/v1/admin/metrics",
                headers=headers,
                catch_response=True
            ) as response:
                self._track_response(response)

    def _track_response(self, response):
        """Track response metrics"""
        global response_times, error_count, success_count

        response_time = response.elapsed.total_seconds() * 1000
        response_times.append(response_time)

        if response.status_code >= 400:
            error_count += 1
        else:
            success_count += 1


# Load test scenarios
"""
Run different load test scenarios:

1. Normal Load Test (100 users):
   locust -f scripts/load_test.py --users 100 --spawn-rate 10 --run-time 10m --host http://localhost:8000

2. Stress Test (1000 users):
   locust -f scripts/load_test.py --users 1000 --spawn-rate 50 --run-time 30m --host http://localhost:8000

3. Spike Test (sudden 500 users):
   locust -f scripts/load_test.py --users 500 --spawn-rate 100 --run-time 5m --host http://localhost:8000

4. Endurance Test (100 users for 1 hour):
   locust -f scripts/load_test.py --users 100 --spawn-rate 10 --run-time 1h --host http://localhost:8000

5. Headless mode (for CI/CD):
   locust -f scripts/load_test.py --users 100 --spawn-rate 10 --run-time 5m --host http://localhost:8000 --headless --csv=results

Performance Targets:
- Average response time: < 500ms
- P95 response time: < 1000ms
- P99 response time: < 2000ms
- Error rate: < 1%
- Concurrent users: 1000+
- Requests per second: 500+
"""

if __name__ == "__main__":
    import os
    print("Kamiyo Load Testing Suite")
    print("="*60)
    print("\nUsage:")
    print("  locust -f scripts/load_test.py --host http://localhost:8000")
    print("\nScenarios:")
    print("  Normal:    --users 100 --spawn-rate 10 --run-time 10m")
    print("  Stress:    --users 1000 --spawn-rate 50 --run-time 30m")
    print("  Spike:     --users 500 --spawn-rate 100 --run-time 5m")
    print("  Endurance: --users 100 --spawn-rate 10 --run-time 1h")
    print("="*60)
