# -*- coding: utf-8 -*-
"""
CSRF Protection Tests
Tests for BLOCKER 1 resolution - CSRF token generation and validation
"""

import pytest
import os
from fastapi.testclient import TestClient

# Set test environment
os.environ["ENVIRONMENT"] = "development"
os.environ["CSRF_SECRET_KEY"] = "test_csrf_secret_key_at_least_32_chars_long_1234567890"

from api.main import app

client = TestClient(app)


class TestCSRFTokenGeneration:
    """Test CSRF token generation endpoint"""

    def test_get_csrf_token_success(self):
        """Test successful CSRF token generation"""
        response = client.get("/api/csrf-token")

        assert response.status_code == 200
        data = response.json()

        # Verify response structure
        assert "csrf_token" in data
        assert "expires_in" in data
        assert "header_name" in data
        assert "usage" in data

        # Verify token is non-empty
        assert len(data["csrf_token"]) > 0

        # Verify header name is correct
        assert data["header_name"] == "X-CSRF-Token"

        # Verify token is in response headers
        assert "X-CSRF-Token" in response.headers

        print(f"✓ CSRF token generated successfully: {data['csrf_token'][:20]}...")

    def test_csrf_token_in_cookie(self):
        """Test that CSRF token is set as cookie"""
        response = client.get("/api/csrf-token")

        assert response.status_code == 200

        # Check for Set-Cookie header
        cookies = response.cookies
        assert len(cookies) > 0

        print(f"✓ CSRF token set in cookies: {list(cookies.keys())}")


class TestCSRFProtection:
    """Test CSRF protection on state-changing endpoints"""

    def test_post_without_csrf_token_fails(self):
        """Test that POST request without CSRF token is rejected"""
        # Try to create a webhook without CSRF token
        response = client.post(
            "/api/v1/user-webhooks",
            json={
                "name": "Test Webhook",
                "url": "https://example.com/webhook",
                "chains": ["Ethereum"]
            },
            headers={
                "Authorization": "Bearer test_key"
            }
        )

        # Should fail with 403 Forbidden
        assert response.status_code == 403
        data = response.json()
        assert data["error"] == "csrf_token_invalid"

        print("✓ POST without CSRF token correctly rejected")

    def test_delete_without_csrf_token_fails(self):
        """Test that DELETE request without CSRF token is rejected"""
        response = client.delete(
            "/api/v1/user-webhooks/1",
            headers={
                "Authorization": "Bearer test_key"
            }
        )

        # Should fail with 403 Forbidden
        assert response.status_code == 403
        data = response.json()
        assert data["error"] == "csrf_token_invalid"

        print("✓ DELETE without CSRF token correctly rejected")

    def test_put_without_csrf_token_fails(self):
        """Test that PUT request without CSRF token is rejected"""
        response = client.patch(
            "/api/v1/watchlists/1",
            json={"name": "Updated Watchlist"},
            headers={
                "Authorization": "Bearer test_key"
            }
        )

        # Should fail with 403 Forbidden
        assert response.status_code == 403
        data = response.json()
        assert data["error"] == "csrf_token_invalid"

        print("✓ PATCH without CSRF token correctly rejected")


class TestCSRFExemptions:
    """Test that exempt endpoints work without CSRF token"""

    def test_get_request_no_csrf_required(self):
        """Test that GET requests don't require CSRF token"""
        response = client.get("/")

        assert response.status_code == 200

        print("✓ GET requests work without CSRF token")

    def test_health_endpoint_no_csrf_required(self):
        """Test that health check doesn't require CSRF token"""
        response = client.get("/health")

        assert response.status_code == 200

        print("✓ Health endpoint works without CSRF token")

    def test_docs_endpoint_no_csrf_required(self):
        """Test that API docs don't require CSRF token"""
        response = client.get("/docs")

        # Should redirect or return docs
        assert response.status_code in [200, 307]

        print("✓ Docs endpoint works without CSRF token")


class TestCSRFWithValidToken:
    """Test requests with valid CSRF token"""

    def test_post_with_valid_csrf_token(self):
        """Test that POST request with valid CSRF token succeeds (if endpoint exists)"""
        # First, get a CSRF token
        token_response = client.get("/api/csrf-token")
        assert token_response.status_code == 200

        csrf_token = token_response.json()["csrf_token"]

        # Note: This will still fail if the endpoint requires authentication
        # but it should NOT fail with CSRF error
        response = client.post(
            "/api/v1/user-webhooks",
            json={
                "name": "Test Webhook",
                "url": "https://example.com/webhook",
                "chains": ["Ethereum"]
            },
            headers={
                "X-CSRF-Token": csrf_token,
                "Authorization": "Bearer test_key"
            }
        )

        # Should not be 403 CSRF error
        # May be 401 (unauthorized) or other errors, but not CSRF
        assert response.status_code != 403 or response.json().get("error") != "csrf_token_invalid"

        print(f"✓ POST with valid CSRF token bypasses CSRF protection (status: {response.status_code})")


class TestCSRFConfiguration:
    """Test CSRF configuration"""

    def test_csrf_settings_loaded(self):
        """Test that CSRF settings are properly loaded"""
        from api.csrf_protection import csrf_settings

        assert csrf_settings.csrf_secret_key is not None
        assert len(csrf_settings.csrf_secret_key) >= 32
        assert csrf_settings.csrf_header_name == "X-CSRF-Token"
        assert csrf_settings.csrf_cookie_httponly is True

        print("✓ CSRF settings loaded correctly")

    def test_production_validation_in_dev(self):
        """Test that production validation doesn't fail in development"""
        from api.csrf_protection import validate_csrf_production_config

        # Should not raise error in development
        try:
            validate_csrf_production_config()
            print("✓ Production validation skipped in development")
        except RuntimeError:
            pytest.fail("Production validation should not fail in development")


def run_manual_tests():
    """Run manual tests for CSRF protection"""
    print("\n" + "=" * 60)
    print("CSRF PROTECTION MANUAL TESTS")
    print("=" * 60 + "\n")

    # Test 1: Token Generation
    print("Test 1: Token Generation")
    response = client.get("/api/csrf-token")
    print(f"  Status: {response.status_code}")
    print(f"  Token: {response.json().get('csrf_token', 'N/A')[:30]}...")
    print()

    # Test 2: POST without token
    print("Test 2: POST without CSRF token")
    response = client.post("/api/v1/user-webhooks", json={"test": "data"})
    print(f"  Status: {response.status_code}")
    print(f"  Error: {response.json().get('error', 'N/A')}")
    print()

    # Test 3: GET (safe method)
    print("Test 3: GET request (no CSRF needed)")
    response = client.get("/")
    print(f"  Status: {response.status_code}")
    print()

    # Test 4: Health endpoint
    print("Test 4: Health endpoint (exempt)")
    response = client.get("/health")
    print(f"  Status: {response.status_code}")
    print()

    print("=" * 60)
    print("MANUAL TESTS COMPLETE")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    # Run manual tests
    run_manual_tests()

    # Run pytest
    print("\nRunning pytest suite...\n")
    pytest.main([__file__, "-v"])
