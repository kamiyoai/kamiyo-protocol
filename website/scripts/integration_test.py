#!/usr/bin/env python3
"""
Kamiyo End-to-End Integration Test Suite
Tests complete user flows from signup to API usage
"""

import os
import sys
import time
import requests
import json
from typing import Dict, Any, Optional
from datetime import datetime
import stripe

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
STRIPE_TEST_KEY = os.getenv("STRIPE_SECRET_KEY", "sk_test_...")

# Test results tracking
class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.tests = []

    def add_result(self, test_name: str, status: str, message: str = "", duration: float = 0):
        self.tests.append({
            "test": test_name,
            "status": status,
            "message": message,
            "duration": duration,
            "timestamp": datetime.utcnow().isoformat()
        })
        if status == "PASS":
            self.passed += 1
        elif status == "FAIL":
            self.failed += 1
        else:
            self.warnings += 1

    def print_summary(self):
        print("\n" + "="*60)
        print("INTEGRATION TEST SUMMARY")
        print("="*60)
        print(f"✓ Passed:   {self.passed}")
        print(f"✗ Failed:   {self.failed}")
        print(f"⚠ Warnings: {self.warnings}")
        print(f"Total:      {len(self.tests)}")
        print("="*60)

        if self.failed > 0:
            print("\nFailed Tests:")
            for test in self.tests:
                if test["status"] == "FAIL":
                    print(f"  ✗ {test['test']}: {test['message']}")

        # Save detailed results
        with open("integration_test_results.json", "w") as f:
            json.dump({
                "summary": {
                    "passed": self.passed,
                    "failed": self.failed,
                    "warnings": self.warnings,
                    "total": len(self.tests)
                },
                "tests": self.tests
            }, f, indent=2)

        return self.failed == 0

results = TestResults()

def test(name: str):
    """Decorator for test functions"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            print(f"\nRunning: {name}...")
            start = time.time()
            try:
                func(*args, **kwargs)
                duration = time.time() - start
                print(f"  ✓ PASS ({duration:.2f}s)")
                results.add_result(name, "PASS", "", duration)
            except AssertionError as e:
                duration = time.time() - start
                print(f"  ✗ FAIL ({duration:.2f}s): {str(e)}")
                results.add_result(name, "FAIL", str(e), duration)
            except Exception as e:
                duration = time.time() - start
                print(f"  ✗ ERROR ({duration:.2f}s): {str(e)}")
                results.add_result(name, "FAIL", f"Error: {str(e)}", duration)
        return wrapper
    return decorator

# Test Data
test_user = {
    "email": f"test_{int(time.time())}@kamiyo.test",
    "password": "TestPassword123!",
    "name": "Integration Test User"
}

test_context = {
    "api_key": None,
    "user_id": None,
    "subscription_id": None,
    "auth_token": None
}

# ============================================
# API Health Tests
# ============================================

@test("API Health Check")
def test_api_health():
    response = requests.get(f"{API_BASE_URL}/health")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert data["status"] == "healthy", "API not healthy"

@test("API Docs Available")
def test_api_docs():
    response = requests.get(f"{API_BASE_URL}/docs")
    assert response.status_code == 200, f"Docs not available: {response.status_code}"

@test("Database Connection")
def test_database_connection():
    response = requests.get(f"{API_BASE_URL}/health/db")
    assert response.status_code == 200, "Database not connected"
    data = response.json()
    assert data["database"] == "connected", "Database connection failed"

@test("Redis Cache Connection")
def test_redis_connection():
    response = requests.get(f"{API_BASE_URL}/health/cache")
    assert response.status_code == 200, "Redis not connected"
    data = response.json()
    assert data["cache"] == "connected", "Cache connection failed"

# ============================================
# User Registration & Authentication Tests
# ============================================

@test("User Registration")
def test_user_registration():
    response = requests.post(
        f"{API_BASE_URL}/api/v1/auth/register",
        json=test_user
    )
    assert response.status_code == 201, f"Registration failed: {response.text}"
    data = response.json()
    assert "user_id" in data, "No user_id in response"
    test_context["user_id"] = data["user_id"]

@test("User Login")
def test_user_login():
    response = requests.post(
        f"{API_BASE_URL}/api/v1/auth/login",
        json={
            "email": test_user["email"],
            "password": test_user["password"]
        }
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access token in response"
    test_context["auth_token"] = data["access_token"]

@test("Protected Endpoint Access")
def test_protected_endpoint():
    headers = {"Authorization": f"Bearer {test_context['auth_token']}"}
    response = requests.get(f"{API_BASE_URL}/api/v1/user/profile", headers=headers)
    assert response.status_code == 200, f"Cannot access protected endpoint: {response.status_code}"

# ============================================
# API Key Management Tests
# ============================================

@test("API Key Generation")
def test_api_key_generation():
    headers = {"Authorization": f"Bearer {test_context['auth_token']}"}
    response = requests.post(
        f"{API_BASE_URL}/api/v1/api-keys/generate",
        headers=headers,
        json={"name": "Test API Key"}
    )
    assert response.status_code == 201, f"API key generation failed: {response.text}"
    data = response.json()
    assert "api_key" in data, "No API key in response"
    test_context["api_key"] = data["api_key"]

@test("API Key Authentication")
def test_api_key_auth():
    headers = {"X-API-Key": test_context["api_key"]}
    response = requests.get(f"{API_BASE_URL}/api/v1/exploits", headers=headers)
    assert response.status_code == 200, f"API key auth failed: {response.status_code}"

# ============================================
# Exploit Data Tests
# ============================================

@test("Fetch Latest Exploits")
def test_fetch_exploits():
    headers = {"X-API-Key": test_context["api_key"]}
    response = requests.get(
        f"{API_BASE_URL}/api/v1/exploits?limit=10",
        headers=headers
    )
    assert response.status_code == 200, f"Fetch exploits failed: {response.status_code}"
    data = response.json()
    assert isinstance(data, list), "Response should be a list"

@test("Filter Exploits by Chain")
def test_filter_by_chain():
    headers = {"X-API-Key": test_context["api_key"]}
    response = requests.get(
        f"{API_BASE_URL}/api/v1/exploits?chain=ethereum",
        headers=headers
    )
    assert response.status_code == 200, f"Filter failed: {response.status_code}"

@test("Search Exploits")
def test_search_exploits():
    headers = {"X-API-Key": test_context["api_key"]}
    response = requests.get(
        f"{API_BASE_URL}/api/v1/exploits/search?q=reentrancy",
        headers=headers
    )
    assert response.status_code == 200, f"Search failed: {response.status_code}"

@test("Get Exploit Statistics")
def test_exploit_stats():
    headers = {"X-API-Key": test_context["api_key"]}
    response = requests.get(
        f"{API_BASE_URL}/api/v1/exploits/stats",
        headers=headers
    )
    assert response.status_code == 200, f"Stats failed: {response.status_code}"
    data = response.json()
    assert "total_exploits" in data, "Missing total_exploits in stats"

# ============================================
# Payment Flow Tests
# ============================================

@test("Create Checkout Session")
def test_create_checkout_session():
    headers = {"Authorization": f"Bearer {test_context['auth_token']}"}
    response = requests.post(
        f"{API_BASE_URL}/api/v1/payments/create-checkout-session",
        headers=headers,
        json={"tier": "basic"}
    )
    assert response.status_code == 200, f"Checkout creation failed: {response.text}"
    data = response.json()
    assert "checkout_url" in data, "No checkout URL in response"

@test("Get Subscription Status")
def test_subscription_status():
    headers = {"Authorization": f"Bearer {test_context['auth_token']}"}
    response = requests.get(
        f"{API_BASE_URL}/api/v1/subscriptions/status",
        headers=headers
    )
    assert response.status_code == 200, f"Subscription status failed: {response.status_code}"
    data = response.json()
    assert "tier" in data, "No tier in subscription status"

# ============================================
# Rate Limiting Tests
# ============================================

@test("Rate Limit Enforcement - Free Tier")
def test_rate_limiting():
    headers = {"X-API-Key": test_context["api_key"]}
    # Make requests until rate limited
    for i in range(15):  # Free tier limit is 10/min
        response = requests.get(f"{API_BASE_URL}/api/v1/exploits", headers=headers)
        if response.status_code == 429:
            return  # Rate limit working
    raise AssertionError("Rate limiting not enforced")

# ============================================
# WebSocket Tests
# ============================================

@test("WebSocket Connection")
def test_websocket_connection():
    try:
        import websocket
        ws_url = API_BASE_URL.replace("http", "ws") + "/ws/exploits"
        ws = websocket.create_connection(
            ws_url,
            header={"X-API-Key": test_context["api_key"]}
        )
        ws.close()
    except ImportError:
        print("  ⚠ WebSocket test skipped (install websocket-client)")
        results.add_result("WebSocket Connection", "WARN", "Module not installed")
    except Exception as e:
        raise AssertionError(f"WebSocket connection failed: {str(e)}")

# ============================================
# Webhook Tests
# ============================================

@test("Webhook Endpoint Available")
def test_webhook_endpoint():
    response = requests.post(
        f"{API_BASE_URL}/api/v1/payments/webhook",
        json={"type": "test"},
        headers={"stripe-signature": "test"}
    )
    # Should fail signature verification but endpoint should exist
    assert response.status_code in [400, 401], f"Webhook endpoint issue: {response.status_code}"

# ============================================
# Cache Performance Tests
# ============================================

@test("Cache Performance")
def test_cache_performance():
    headers = {"X-API-Key": test_context["api_key"]}

    # First request (cache miss)
    start = time.time()
    response1 = requests.get(f"{API_BASE_URL}/api/v1/exploits?limit=100", headers=headers)
    duration1 = time.time() - start
    assert response1.status_code == 200

    # Second request (cache hit)
    start = time.time()
    response2 = requests.get(f"{API_BASE_URL}/api/v1/exploits?limit=100", headers=headers)
    duration2 = time.time() - start
    assert response2.status_code == 200

    # Cache should make second request faster
    if duration2 < duration1 * 0.5:  # At least 2x faster
        print(f"  Cache speedup: {duration1/duration2:.2f}x")
    else:
        print(f"  ⚠ Cache may not be working optimally (speedup: {duration1/duration2:.2f}x)")

# ============================================
# Error Handling Tests
# ============================================

@test("404 Error Handling")
def test_404_handling():
    response = requests.get(f"{API_BASE_URL}/api/v1/nonexistent")
    assert response.status_code == 404, "404 not returned for invalid endpoint"

@test("Invalid API Key")
def test_invalid_api_key():
    headers = {"X-API-Key": "invalid_key"}
    response = requests.get(f"{API_BASE_URL}/api/v1/exploits", headers=headers)
    assert response.status_code == 401, "Invalid API key accepted"

@test("Missing Authentication")
def test_missing_auth():
    response = requests.get(f"{API_BASE_URL}/api/v1/user/profile")
    assert response.status_code == 401, "Missing auth accepted"

# ============================================
# Data Aggregation Tests
# ============================================

@test("Aggregator Sources Available")
def test_aggregator_sources():
    headers = {"X-API-Key": test_context["api_key"]}
    response = requests.get(f"{API_BASE_URL}/api/v1/sources", headers=headers)
    assert response.status_code == 200, "Sources endpoint failed"
    data = response.json()
    assert len(data) > 0, "No aggregator sources configured"

    # Verify key sources
    source_names = [s["name"] for s in data]
    required_sources = ["Rekt News", "BlockSec", "PeckShield"]
    for source in required_sources:
        assert any(source in name for name in source_names), f"Missing source: {source}"

# ============================================
# Main Test Runner
# ============================================

def run_all_tests():
    print("="*60)
    print("KAMIYO INTEGRATION TEST SUITE")
    print("="*60)
    print(f"API Base URL: {API_BASE_URL}")
    print(f"Start Time: {datetime.utcnow().isoformat()}")
    print("="*60)

    # Run all tests
    test_api_health()
    test_api_docs()
    test_database_connection()
    test_redis_connection()

    test_user_registration()
    test_user_login()
    test_protected_endpoint()

    test_api_key_generation()
    test_api_key_auth()

    test_fetch_exploits()
    test_filter_by_chain()
    test_search_exploits()
    test_exploit_stats()

    test_create_checkout_session()
    test_subscription_status()

    test_rate_limiting()
    test_websocket_connection()
    test_webhook_endpoint()

    test_cache_performance()

    test_404_handling()
    test_invalid_api_key()
    test_missing_auth()

    test_aggregator_sources()

    # Print summary
    success = results.print_summary()

    print(f"\nResults saved to: integration_test_results.json")
    print(f"End Time: {datetime.utcnow().isoformat()}")

    return 0 if success else 1

if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
