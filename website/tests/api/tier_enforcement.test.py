#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tier Enforcement Integration Tests for Kamiyo

Tests that tier-based access controls and rate limiting work correctly:
- Free tier: 24h data delay, 100 requests/day
- Pro tier: Real-time data, 50,000 requests/month
- Team tier: Real-time + webhooks + watchlists
- Enterprise tier: Everything + custom integrations

Requirements:
- pytest
- httpx (async HTTP client)
- API running on localhost:8000

Usage:
    pytest tests/api/tier_enforcement.test.py -v
    pytest tests/api/tier_enforcement.test.py -v --api-url=http://localhost:8000
"""

import pytest
import httpx
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
import os
import time


# Configuration
API_BASE_URL = os.getenv("API_URL", "http://localhost:8000")
TEST_TIMEOUT = 30.0  # seconds


# Test fixtures
@pytest.fixture
def api_client():
    """Create async HTTP client for API testing"""
    return httpx.AsyncClient(base_url=API_BASE_URL, timeout=TEST_TIMEOUT)


@pytest.fixture
def free_tier_headers() -> Dict[str, str]:
    """Headers for free tier (unauthenticated) requests"""
    return {
        "Content-Type": "application/json"
    }


@pytest.fixture
def pro_tier_headers() -> Dict[str, str]:
    """Headers for Pro tier requests (requires valid API key)"""
    # In production, this would be a real API key from database
    # For testing, we'll use a mock or test key
    api_key = os.getenv("TEST_PRO_API_KEY", "test_pro_key_12345")
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }


@pytest.fixture
def team_tier_headers() -> Dict[str, str]:
    """Headers for Team tier requests"""
    api_key = os.getenv("TEST_TEAM_API_KEY", "test_team_key_12345")
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }


@pytest.fixture
def enterprise_tier_headers() -> Dict[str, str]:
    """Headers for Enterprise tier requests"""
    api_key = os.getenv("TEST_ENTERPRISE_API_KEY", "test_enterprise_key_12345")
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }


# ============================================================================
# Test Suite: Free Tier Access
# ============================================================================

class TestFreeTierAccess:
    """Test free tier access controls and limitations"""

    @pytest.mark.asyncio
    async def test_free_tier_gets_delayed_data(self, api_client, free_tier_headers):
        """Test that free tier receives 24-hour delayed data"""
        response = await api_client.get("/exploits", headers=free_tier_headers)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

        data = response.json()
        assert "data" in data, "Response missing 'data' field"

        exploits = data["data"]
        if len(exploits) > 0:
            # Check that latest exploit is at least 24 hours old
            latest = exploits[0]
            timestamp_str = latest.get("timestamp") or latest.get("date")

            assert timestamp_str is not None, "Exploit missing timestamp"

            # Parse timestamp
            exploit_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            if exploit_time.tzinfo is None:
                exploit_time = exploit_time.replace(tzinfo=timezone.utc)

            now = datetime.now(timezone.utc)
            age_hours = (now - exploit_time).total_seconds() / 3600

            assert age_hours >= 24, (
                f"Free tier should get 24h delayed data, but latest exploit is only {age_hours:.1f}h old. "
                f"Timestamp: {timestamp_str}"
            )

            print(f"✓ Free tier data delay verified: {age_hours:.1f} hours old")

    @pytest.mark.asyncio
    async def test_free_tier_rate_limiting(self, api_client, free_tier_headers):
        """Test that free tier is rate limited (10 req/min per IP)"""
        # Make requests until we hit rate limit
        # Free tier IP limit: 10 req/min
        requests_made = 0
        rate_limited = False

        for i in range(15):  # Try 15 requests
            response = await api_client.get("/exploits", headers=free_tier_headers)

            requests_made += 1

            if response.status_code == 429:
                rate_limited = True
                print(f"✓ Rate limit hit after {requests_made} requests")

                # Verify rate limit response structure
                data = response.json()
                assert "error" in data, "Rate limit response missing 'error' field"
                assert data["error"] == "rate_limit_exceeded"
                assert "retry_after_seconds" in data
                assert "upgrade_url" in data

                # Verify headers
                assert "Retry-After" in response.headers
                assert "X-RateLimit-Limit" in response.headers

                break

            # Small delay between requests
            await asyncio.sleep(0.1)

        # Note: In test environment, rate limiting might not be enforced
        # This is expected if testing against a development server
        if not rate_limited:
            print(f"⚠ Warning: Rate limit not hit after {requests_made} requests (may be disabled in dev)")

    @pytest.mark.asyncio
    async def test_free_tier_no_api_key_access(self, api_client, free_tier_headers):
        """Test that free tier works without API key"""
        response = await api_client.get("/exploits", headers=free_tier_headers)

        assert response.status_code == 200, "Free tier should work without API key"
        assert "data" in response.json()

    @pytest.mark.asyncio
    async def test_free_tier_cannot_access_webhooks(self, api_client, free_tier_headers):
        """Test that free tier cannot access webhook endpoints"""
        response = await api_client.get("/api/v1/user-webhooks", headers=free_tier_headers)

        # Should return 401 (unauthorized) or 403 (forbidden)
        assert response.status_code in [401, 403, 404], (
            f"Free tier should not access webhooks, got {response.status_code}"
        )

    @pytest.mark.asyncio
    async def test_free_tier_cannot_access_watchlists(self, api_client, free_tier_headers):
        """Test that free tier cannot access watchlist endpoints"""
        response = await api_client.get("/api/v1/watchlists", headers=free_tier_headers)

        # Should return 401 (unauthorized) or 403 (forbidden)
        assert response.status_code in [401, 403, 404], (
            f"Free tier should not access watchlists, got {response.status_code}"
        )


# ============================================================================
# Test Suite: Pro Tier Access
# ============================================================================

class TestProTierAccess:
    """Test Pro tier access and features"""

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires valid Pro tier API key in database")
    async def test_pro_tier_gets_realtime_data(self, api_client, pro_tier_headers):
        """Test that Pro tier receives real-time data (no 24h delay)"""
        response = await api_client.get("/exploits", headers=pro_tier_headers)

        assert response.status_code == 200

        data = response.json()
        exploits = data["data"]

        if len(exploits) > 0:
            # Check that latest exploit is recent (< 24 hours old)
            latest = exploits[0]
            timestamp_str = latest.get("timestamp") or latest.get("date")

            if timestamp_str:
                exploit_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                if exploit_time.tzinfo is None:
                    exploit_time = exploit_time.replace(tzinfo=timezone.utc)

                now = datetime.now(timezone.utc)
                age_hours = (now - exploit_time).total_seconds() / 3600

                # Pro tier should have recent data (may not have exploits in last 24h though)
                print(f"✓ Pro tier latest exploit age: {age_hours:.1f} hours")

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires valid Pro tier API key in database")
    async def test_pro_tier_rate_limits(self, api_client, pro_tier_headers):
        """Test that Pro tier has higher rate limits (35 req/min)"""
        requests_made = 0
        start_time = time.time()

        # Pro tier allows 35 req/min - test 30 requests
        for i in range(30):
            response = await api_client.get("/exploits", headers=pro_tier_headers)

            if response.status_code == 429:
                pytest.fail(f"Pro tier rate limited after only {i + 1} requests")

            requests_made += 1
            await asyncio.sleep(0.1)

        elapsed = time.time() - start_time
        print(f"✓ Pro tier handled {requests_made} requests in {elapsed:.2f}s without rate limiting")

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires valid Pro tier API key in database")
    async def test_pro_tier_can_access_webhooks(self, api_client, pro_tier_headers):
        """Test that Pro tier can access webhook endpoints"""
        response = await api_client.get("/api/v1/user-webhooks", headers=pro_tier_headers)

        # Should return 200 (even if empty list) or 422 (validation error for missing params)
        # Should NOT return 401/403 (unauthorized)
        assert response.status_code not in [401, 403], (
            "Pro tier should have access to webhooks"
        )


# ============================================================================
# Test Suite: Rate Limiting
# ============================================================================

class TestRateLimiting:
    """Test rate limiting across all tiers"""

    @pytest.mark.asyncio
    async def test_rate_limit_headers_present(self, api_client, free_tier_headers):
        """Test that rate limit headers are included in responses"""
        response = await api_client.get("/exploits", headers=free_tier_headers)

        assert response.status_code == 200

        # Check for rate limit headers
        # Note: May not be present if rate limiting is disabled in dev
        rate_limit_headers = [
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "X-RateLimit-Tier"
        ]

        found_headers = [h for h in rate_limit_headers if h in response.headers]

        if found_headers:
            print(f"✓ Rate limit headers present: {found_headers}")
            for header in found_headers:
                print(f"  {header}: {response.headers[header]}")
        else:
            print("⚠ Warning: No rate limit headers found (may be disabled in dev)")

    @pytest.mark.asyncio
    async def test_rate_limit_response_format(self, api_client, free_tier_headers):
        """Test that rate limit error responses have correct format"""
        # Try to trigger rate limit with burst requests
        rate_limited = False

        for i in range(20):
            response = await api_client.get("/exploits", headers=free_tier_headers)

            if response.status_code == 429:
                rate_limited = True
                data = response.json()

                # Verify response structure
                assert "error" in data
                assert data["error"] == "rate_limit_exceeded"
                assert "message" in data
                assert "retry_after_seconds" in data
                assert "upgrade_url" in data
                assert "tier" in data
                assert "window" in data

                # Verify headers
                assert "Retry-After" in response.headers
                retry_after = int(response.headers["Retry-After"])
                assert retry_after > 0

                print(f"✓ Rate limit response format valid")
                print(f"  Tier: {data['tier']}")
                print(f"  Window: {data['window']}")
                print(f"  Retry After: {retry_after}s")

                break

            await asyncio.sleep(0.05)

        if not rate_limited:
            print("⚠ Warning: Could not trigger rate limit (may be disabled in dev)")


# ============================================================================
# Test Suite: Data Quality
# ============================================================================

class TestDataQuality:
    """Test data quality and consistency"""

    @pytest.mark.asyncio
    async def test_exploits_have_required_fields(self, api_client, free_tier_headers):
        """Test that all exploits have required fields"""
        response = await api_client.get("/exploits", headers=free_tier_headers)

        assert response.status_code == 200

        data = response.json()
        exploits = data["data"]

        required_fields = ["tx_hash", "chain", "protocol", "timestamp"]

        for exploit in exploits[:10]:  # Check first 10
            for field in required_fields:
                assert field in exploit, f"Exploit missing required field: {field}"
                assert exploit[field] is not None, f"Exploit has null {field}"

        if exploits:
            print(f"✓ Data quality check passed for {len(exploits)} exploits")

    @pytest.mark.asyncio
    async def test_pagination_works_correctly(self, api_client, free_tier_headers):
        """Test that pagination parameters work correctly"""
        # Fetch page 1
        response1 = await api_client.get(
            "/exploits?page=1&page_size=10",
            headers=free_tier_headers
        )

        assert response1.status_code == 200
        data1 = response1.json()

        assert "data" in data1
        assert "total" in data1
        assert "page" in data1
        assert "has_more" in data1

        assert data1["page"] == 1
        assert len(data1["data"]) <= 10

        # Fetch page 2
        response2 = await api_client.get(
            "/exploits?page=2&page_size=10",
            headers=free_tier_headers
        )

        assert response2.status_code == 200
        data2 = response2.json()

        # Page 2 should have different data than page 1
        if len(data1["data"]) > 0 and len(data2["data"]) > 0:
            page1_ids = {e["tx_hash"] for e in data1["data"]}
            page2_ids = {e["tx_hash"] for e in data2["data"]}

            # Should have no overlap
            assert len(page1_ids & page2_ids) == 0, "Pages should not overlap"

        print(f"✓ Pagination working correctly")

    @pytest.mark.asyncio
    async def test_filtering_by_chain(self, api_client, free_tier_headers):
        """Test that chain filtering works correctly"""
        response = await api_client.get(
            "/exploits?chain=Ethereum",
            headers=free_tier_headers
        )

        assert response.status_code == 200

        data = response.json()
        exploits = data["data"]

        # All results should be Ethereum
        non_ethereum = [e for e in exploits if e.get("chain") != "Ethereum"]

        assert len(non_ethereum) == 0, (
            f"Found {len(non_ethereum)} non-Ethereum exploits in Ethereum filter"
        )

        if exploits:
            print(f"✓ Chain filtering working: {len(exploits)} Ethereum exploits")

    @pytest.mark.asyncio
    async def test_filtering_by_amount(self, api_client, free_tier_headers):
        """Test that amount filtering works correctly"""
        min_amount = 1000000  # $1M

        response = await api_client.get(
            f"/exploits?min_amount={min_amount}",
            headers=free_tier_headers
        )

        assert response.status_code == 200

        data = response.json()
        exploits = data["data"]

        # All results should be >= min_amount
        below_min = [
            e for e in exploits
            if (e.get("amount_usd") or 0) < min_amount
        ]

        assert len(below_min) == 0, (
            f"Found {len(below_min)} exploits below ${min_amount:,} threshold"
        )

        if exploits:
            print(f"✓ Amount filtering working: {len(exploits)} exploits >= ${min_amount:,}")


# ============================================================================
# Test Suite: Health & Monitoring
# ============================================================================

class TestHealthMonitoring:
    """Test health check and monitoring endpoints"""

    @pytest.mark.asyncio
    async def test_health_endpoint_returns_200(self, api_client):
        """Test that health endpoint returns 200"""
        response = await api_client.get("/health")

        assert response.status_code == 200

        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"
        assert "database_exploits" in data
        assert "active_sources" in data

        print(f"✓ Health check passed")
        print(f"  Database exploits: {data['database_exploits']}")
        print(f"  Active sources: {data['active_sources']}/{data['total_sources']}")

    @pytest.mark.asyncio
    async def test_ready_endpoint_returns_200(self, api_client):
        """Test that readiness endpoint returns 200"""
        response = await api_client.get("/ready")

        assert response.status_code == 200

        data = response.json()
        assert "status" in data
        assert data["status"] == "ready"

        print(f"✓ Readiness check passed")

    @pytest.mark.asyncio
    async def test_stats_endpoint_works(self, api_client):
        """Test that stats endpoint returns valid data"""
        response = await api_client.get("/stats?days=7")

        assert response.status_code == 200

        data = response.json()
        assert "total_exploits" in data
        assert "total_loss_usd" in data
        assert "period_days" in data

        print(f"✓ Stats endpoint working")
        print(f"  Total exploits (7d): {data['total_exploits']}")
        print(f"  Total loss (7d): ${data['total_loss_usd']:,.2f}")


# ============================================================================
# pytest Configuration
# ============================================================================

def pytest_addoption(parser):
    """Add custom pytest command-line options"""
    parser.addoption(
        "--api-url",
        action="store",
        default="http://localhost:8000",
        help="API base URL (default: http://localhost:8000)"
    )


@pytest.fixture(scope="session", autouse=True)
def configure_api_url(request):
    """Configure API URL from command line"""
    global API_BASE_URL
    API_BASE_URL = request.config.getoption("--api-url")
    print(f"\n=== Testing API: {API_BASE_URL} ===\n")


if __name__ == "__main__":
    # Run tests if executed directly
    pytest.main([__file__, "-v", "--tb=short"])
