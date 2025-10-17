"""
Locust Load Testing Configuration

Simulates realistic user behavior with multiple user types:
- Anonymous visitors browsing exploits
- Free tier users making API calls
- Paid users with heavy API usage
- Admin users

Tests various load scenarios:
- Gradual ramp-up (0 → 10,000 users over 5 minutes)
- Peak load (10,000 concurrent users)
- Endurance (1,000 users for 1 hour)
- Spike test (sudden traffic spike)

Days 19-21: Testing Suite & Documentation
"""

from locust import HttpUser, task, between, events
from locust.contrib.fasthttp import FastHttpUser
import random
import json
import time
from datetime import datetime

# Test configuration
BASE_URL = "http://localhost:8000"
API_KEYS = {
    "free": "test_free_api_key_12345",
    "pro": "test_pro_api_key_67890",
    "enterprise": "test_enterprise_key_abcde"
}

# Test data
CHAINS = ["ethereum", "bsc", "polygon", "arbitrum", "optimism", "avalanche"]
SEVERITIES = ["critical", "high", "medium", "low"]
PROTOCOLS = ["Uniswap", "Aave", "Compound", "Curve", "Balancer", "SushiSwap"]


class AnonymousVisitor(HttpUser):
    """
    Anonymous user browsing the website
    - Views homepage
    - Browses exploits
    - Views pricing
    - No authentication
    """
    weight = 40  # 40% of users
    wait_time = between(2, 5)  # Wait 2-5 seconds between tasks

    @task(10)
    def browse_homepage(self):
        """View homepage"""
        self.client.get("/")

    @task(20)
    def browse_exploits(self):
        """Browse exploit list"""
        self.client.get("/exploits")

    @task(5)
    def view_pricing(self):
        """View pricing page"""
        self.client.get("/pricing")

    @task(3)
    def view_docs(self):
        """View documentation"""
        self.client.get("/docs")

    @task(8)
    def filter_exploits(self):
        """Filter exploits by chain"""
        chain = random.choice(CHAINS)
        self.client.get(f"/exploits?chain={chain}")

    @task(5)
    def search_exploits(self):
        """Search for exploits"""
        protocol = random.choice(PROTOCOLS)
        self.client.get(f"/exploits/search?q={protocol}")

    @task(2)
    def view_exploit_detail(self):
        """View specific exploit"""
        exploit_id = random.randint(1, 1000)
        self.client.get(f"/exploits/{exploit_id}")


class FreeUserAPIUser(FastHttpUser):
    """
    Free tier user making API calls
    - Limited to 100 requests/day
    - Reads exploit data
    - Lightweight usage
    """
    weight = 30  # 30% of users
    wait_time = between(5, 10)

    def on_start(self):
        """Setup: Get API key"""
        self.api_key = API_KEYS["free"]
        self.headers = {"X-API-Key": self.api_key}

    @task(20)
    def list_exploits(self):
        """List recent exploits"""
        self.client.get("/api/exploits", headers=self.headers)

    @task(10)
    def filter_by_chain(self):
        """Filter exploits by blockchain"""
        chain = random.choice(CHAINS)
        self.client.get(f"/api/exploits?chain={chain}", headers=self.headers)

    @task(5)
    def filter_by_severity(self):
        """Filter by severity"""
        severity = random.choice(SEVERITIES)
        self.client.get(f"/api/exploits?severity={severity}", headers=self.headers)

    @task(8)
    def get_exploit_detail(self):
        """Get exploit details"""
        exploit_id = random.randint(1, 1000)
        self.client.get(f"/api/exploits/{exploit_id}", headers=self.headers)

    @task(3)
    def check_usage(self):
        """Check API usage"""
        self.client.get("/api/usage", headers=self.headers)


class ProUserAPIUser(FastHttpUser):
    """
    Pro tier user with heavy API usage
    - 10,000 requests/day limit
    - Frequent polling
    - Webhooks
    """
    weight = 25  # 25% of users
    wait_time = between(1, 3)

    def on_start(self):
        """Setup: Get API key"""
        self.api_key = API_KEYS["pro"]
        self.headers = {"X-API-Key": self.api_key}

    @task(30)
    def list_exploits(self):
        """List exploits with pagination"""
        page = random.randint(1, 10)
        self.client.get(f"/api/exploits?page={page}&limit=50", headers=self.headers)

    @task(15)
    def filter_multiple(self):
        """Filter with multiple criteria"""
        chain = random.choice(CHAINS)
        severity = random.choice(SEVERITIES)
        self.client.get(
            f"/api/exploits?chain={chain}&severity={severity}&sort=amount&order=desc",
            headers=self.headers
        )

    @task(10)
    def search_exploits(self):
        """Search exploits"""
        protocol = random.choice(PROTOCOLS)
        self.client.get(f"/api/exploits/search?q={protocol}", headers=self.headers)

    @task(5)
    def get_statistics(self):
        """Get statistics"""
        self.client.get("/api/stats", headers=self.headers)

    @task(5)
    def get_chains(self):
        """Get chain statistics"""
        self.client.get("/api/chains", headers=self.headers)

    @task(3)
    def webhook_test(self):
        """Test webhook endpoint"""
        data = {
            "event": "exploit.created",
            "data": {"id": random.randint(1, 1000)}
        }
        self.client.post("/api/webhooks/test", json=data, headers=self.headers)


class EnterpriseUser(FastHttpUser):
    """
    Enterprise user with unlimited access
    - Heavy API usage
    - Real-time WebSocket connections
    - Custom integrations
    """
    weight = 5  # 5% of users
    wait_time = between(0.5, 2)

    def on_start(self):
        """Setup: Get API key"""
        self.api_key = API_KEYS["enterprise"]
        self.headers = {"X-API-Key": self.api_key}

    @task(40)
    def bulk_fetch(self):
        """Bulk fetch exploits"""
        self.client.get("/api/exploits?limit=100", headers=self.headers)

    @task(20)
    def advanced_filtering(self):
        """Advanced filtering"""
        params = {
            "chain": random.choice(CHAINS),
            "severity": random.choice(SEVERITIES),
            "min_amount": random.randint(100000, 1000000),
            "date_from": "2024-01-01",
            "sort": "timestamp",
            "order": "desc",
            "limit": 100
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        self.client.get(f"/api/exploits?{query}", headers=self.headers)

    @task(15)
    def export_data(self):
        """Export data"""
        self.client.get("/api/exploits/export?format=json", headers=self.headers)

    @task(10)
    def analytics_query(self):
        """Run analytics query"""
        data = {
            "metric": "total_amount",
            "group_by": "chain",
            "time_range": "30d"
        }
        self.client.post("/api/analytics", json=data, headers=self.headers)

    @task(5)
    def custom_alerts(self):
        """Manage custom alerts"""
        self.client.get("/api/alerts", headers=self.headers)


class WebSocketUser(HttpUser):
    """
    User with WebSocket connection for real-time updates
    """
    weight = 10  # 10% of users
    wait_time = between(10, 30)

    @task
    def connect_websocket(self):
        """Simulate WebSocket connection"""
        # In real scenario, we'd use actual WebSocket
        # For load testing, we simulate with polling
        self.client.get("/api/exploits/stream")
        time.sleep(random.uniform(5, 15))


# Event handlers for metrics collection
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when load test starts"""
    print(f"Load test started at {datetime.now()}")
    print(f"Target URL: {environment.host}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when load test stops"""
    print(f"\nLoad test completed at {datetime.now()}")
    print(f"Total requests: {environment.stats.total.num_requests}")
    print(f"Failed requests: {environment.stats.total.num_failures}")
    print(f"Average response time: {environment.stats.total.avg_response_time}ms")
    print(f"RPS: {environment.stats.total.total_rps}")

    # Check if test passed
    if environment.stats.total.fail_ratio > 0.01:  # More than 1% failure
        print("❌ FAILED: Error rate too high!")
        environment.process_exit_code = 1
    elif environment.stats.total.avg_response_time > 500:  # Slower than 500ms
        print("⚠️  WARNING: Response time too slow!")
        environment.process_exit_code = 1
    else:
        print("✅ PASSED: All performance targets met!")


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kwargs):
    """Called for each request"""
    if exception:
        print(f"❌ Request failed: {name} - {exception}")


# Custom load shapes for different scenarios
from locust import LoadTestShape

class GradualRampUp(LoadTestShape):
    """
    Gradual ramp-up: 0 → 10,000 users over 5 minutes
    """
    time_limit = 300  # 5 minutes
    spawn_rate = 33  # Users per second

    def tick(self):
        run_time = self.get_run_time()

        if run_time < self.time_limit:
            user_count = int(run_time * self.spawn_rate)
            return (user_count, self.spawn_rate)

        return None


class PeakLoad(LoadTestShape):
    """
    Peak load test: Maintain 10,000 users for 10 minutes
    """
    time_limit = 600  # 10 minutes
    user_count = 10000

    def tick(self):
        run_time = self.get_run_time()

        if run_time < self.time_limit:
            return (self.user_count, 100)

        return None


class SpikeTest(LoadTestShape):
    """
    Spike test: Sudden traffic spike from 100 to 5000 users
    """
    stages = [
        {"duration": 60, "users": 100, "spawn_rate": 10},
        {"duration": 120, "users": 5000, "spawn_rate": 100},  # Spike!
        {"duration": 180, "users": 100, "spawn_rate": 50},
    ]

    def tick(self):
        run_time = self.get_run_time()

        for stage in self.stages:
            if run_time < stage["duration"]:
                return (stage["users"], stage["spawn_rate"])

        return None


class EnduranceTest(LoadTestShape):
    """
    Endurance test: 1,000 users for 1 hour
    """
    time_limit = 3600  # 1 hour
    user_count = 1000

    def tick(self):
        run_time = self.get_run_time()

        if run_time < self.time_limit:
            return (self.user_count, 10)

        return None


# Performance thresholds
class PerformanceThresholds:
    """Define performance requirements"""

    MAX_RESPONSE_TIME = 500  # ms
    MAX_ERROR_RATE = 0.01  # 1%
    MIN_RPS = 1000  # requests per second

    @staticmethod
    def check_thresholds(stats):
        """Check if performance meets requirements"""
        issues = []

        if stats.avg_response_time > PerformanceThresholds.MAX_RESPONSE_TIME:
            issues.append(
                f"Response time {stats.avg_response_time}ms exceeds {PerformanceThresholds.MAX_RESPONSE_TIME}ms"
            )

        if stats.fail_ratio > PerformanceThresholds.MAX_ERROR_RATE:
            issues.append(
                f"Error rate {stats.fail_ratio:.2%} exceeds {PerformanceThresholds.MAX_ERROR_RATE:.2%}"
            )

        if stats.total_rps < PerformanceThresholds.MIN_RPS:
            issues.append(
                f"RPS {stats.total_rps:.2f} below minimum {PerformanceThresholds.MIN_RPS}"
            )

        return issues


# Database and Redis load testing
class DatabaseLoadTest(HttpUser):
    """
    Test database performance under load
    """
    weight = 5
    wait_time = between(1, 3)

    @task
    def heavy_query(self):
        """Perform database-heavy query"""
        self.client.get("/api/exploits?limit=100&sort=amount&order=desc")

    @task
    def aggregation_query(self):
        """Test aggregation performance"""
        self.client.get("/api/stats/totals")

    @task
    def join_query(self):
        """Test complex joins"""
        self.client.get("/api/exploits/1?include=comments,reactions")


# Cache load testing
class CacheLoadTest(HttpUser):
    """
    Test Redis cache performance
    """
    weight = 5
    wait_time = between(0.5, 2)

    @task(20)
    def cached_read(self):
        """Read from cache"""
        self.client.get("/api/exploits")  # Should be cached

    @task(5)
    def cache_miss(self):
        """Force cache miss"""
        timestamp = int(time.time())
        self.client.get(f"/api/exploits?t={timestamp}")

    @task(2)
    def invalidate_cache(self):
        """Invalidate cache"""
        self.client.post("/api/admin/cache/invalidate", json={"key": "exploits"})
