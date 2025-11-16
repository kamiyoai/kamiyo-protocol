# -*- coding: utf-8 -*-
"""
Checkout API Tests
Tests for KAMIYO MCP Stripe checkout endpoints
"""

import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient

# Set test environment
os.environ["ENVIRONMENT"] = "development"
os.environ["CSRF_SECRET_KEY"] = "test_csrf_secret_key_at_least_32_chars_long_1234567890"
os.environ["STRIPE_SECRET_KEY"] = "sk_test_mock_key_for_testing_purposes_only"
os.environ["STRIPE_PRICE_MCP_PERSONAL"] = "price_test_personal_123"
os.environ["STRIPE_PRICE_MCP_TEAM"] = "price_test_team_456"
os.environ["STRIPE_PRICE_MCP_ENTERPRISE"] = "price_test_enterprise_789"

from api.main import app

client = TestClient(app)


class TestCheckoutSessionCreation:
    """Test checkout session creation endpoint"""

    @patch('stripe.checkout.Session.create')
    def test_create_checkout_session_success(self, mock_stripe_create):
        """Test successful checkout session creation"""
        # Mock Stripe response
        mock_session = Mock()
        mock_session.id = "cs_test_123456"
        mock_session.url = "https://checkout.stripe.com/c/pay/cs_test_123456"
        mock_session.expires_at = 1234567890
        mock_stripe_create.return_value = mock_session

        # Make request
        response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "personal",
                "user_email": "test@example.com",
                "success_url": "https://kamiyo.ai/dashboard/success?session_id={CHECKOUT_SESSION_ID}",
                "cancel_url": "https://kamiyo.ai/pricing"
            }
        )

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert "checkout_url" in data
        assert "session_id" in data
        assert "expires_at" in data
        assert data["session_id"] == "cs_test_123456"
        assert data["checkout_url"].startswith("https://checkout.stripe.com")

        # Verify Stripe was called correctly
        mock_stripe_create.assert_called_once()
        call_kwargs = mock_stripe_create.call_args.kwargs
        assert call_kwargs["mode"] == "subscription"
        assert call_kwargs["customer_email"] == "test@example.com"
        assert call_kwargs["metadata"]["tier"] == "personal"
        assert call_kwargs["metadata"]["product_type"] == "mcp"

        print("✓ Checkout session creation successful")

    @patch('stripe.checkout.Session.create')
    def test_create_checkout_session_team_tier(self, mock_stripe_create):
        """Test checkout session for team tier"""
        mock_session = Mock()
        mock_session.id = "cs_test_team"
        mock_session.url = "https://checkout.stripe.com/c/pay/cs_test_team"
        mock_session.expires_at = 1234567890
        mock_stripe_create.return_value = mock_session

        response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "team",
                "success_url": "https://kamiyo.ai/success",
                "cancel_url": "https://kamiyo.ai/cancel"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "cs_test_team"

        # Verify correct price ID was used
        call_kwargs = mock_stripe_create.call_args.kwargs
        assert call_kwargs["line_items"][0]["price"] == "price_test_team_456"

        print("✓ Team tier checkout session created")

    def test_create_checkout_invalid_tier(self):
        """Test checkout with invalid tier"""
        response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "invalid_tier",
                "success_url": "https://kamiyo.ai/success",
                "cancel_url": "https://kamiyo.ai/cancel"
            }
        )

        # Should fail validation
        assert response.status_code == 422
        print("✓ Invalid tier rejected")

    def test_create_checkout_missing_urls(self):
        """Test checkout with missing required URLs"""
        response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "personal"
                # Missing success_url and cancel_url
            }
        )

        # Should fail validation
        assert response.status_code == 422
        print("✓ Missing URLs rejected")

    def test_create_checkout_invalid_url_format(self):
        """Test checkout with invalid URL format"""
        response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "personal",
                "success_url": "not-a-valid-url",
                "cancel_url": "https://kamiyo.ai/cancel"
            }
        )

        # Should fail validation
        assert response.status_code == 422
        print("✓ Invalid URL format rejected")

    @patch('stripe.checkout.Session.create')
    def test_create_checkout_without_email(self, mock_stripe_create):
        """Test checkout session without pre-filled email"""
        mock_session = Mock()
        mock_session.id = "cs_test_no_email"
        mock_session.url = "https://checkout.stripe.com/c/pay/cs_test_no_email"
        mock_session.expires_at = 1234567890
        mock_stripe_create.return_value = mock_session

        response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "personal",
                "success_url": "https://kamiyo.ai/success",
                "cancel_url": "https://kamiyo.ai/cancel"
            }
        )

        assert response.status_code == 200

        # Verify email was not set
        call_kwargs = mock_stripe_create.call_args.kwargs
        assert call_kwargs["customer_email"] is None

        print("✓ Checkout without email works")

    @patch('stripe.checkout.Session.create')
    def test_create_checkout_stripe_error(self, mock_stripe_create):
        """Test handling of Stripe API errors"""
        import stripe
        mock_stripe_create.side_effect = stripe.error.StripeError("Test error")

        response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "personal",
                "success_url": "https://kamiyo.ai/success",
                "cancel_url": "https://kamiyo.ai/cancel"
            }
        )

        assert response.status_code == 500
        data = response.json()
        assert "error" in data["detail"] or "Payment system error" in data["detail"]

        print("✓ Stripe error handled gracefully")


class TestCheckoutSessionRetrieval:
    """Test checkout session retrieval endpoint"""

    @patch('stripe.checkout.Session.retrieve')
    def test_get_checkout_session_success(self, mock_stripe_retrieve):
        """Test successful session retrieval"""
        # Mock Stripe response
        mock_session = Mock()
        mock_session.id = "cs_test_123456"
        mock_session.status = "complete"
        mock_session.customer_email = "test@example.com"
        mock_session.metadata = {"tier": "personal", "product_type": "mcp"}
        mock_session.amount_total = 1900
        mock_session.currency = "usd"
        mock_session.subscription = "sub_123456"
        mock_session.customer = "cus_123456"
        mock_session.payment_status = "paid"
        mock_stripe_retrieve.return_value = mock_session

        response = client.get("/api/billing/checkout-session/cs_test_123456")

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "cs_test_123456"
        assert data["status"] == "complete"
        assert data["customer_email"] == "test@example.com"
        assert data["tier"] == "personal"
        assert data["amount_total"] == 1900
        assert data["payment_status"] == "paid"

        print("✓ Checkout session retrieved successfully")

    @patch('stripe.checkout.Session.retrieve')
    def test_get_checkout_session_not_found(self, mock_stripe_retrieve):
        """Test retrieval of non-existent session"""
        import stripe
        mock_stripe_retrieve.side_effect = stripe.error.InvalidRequestError(
            "No such checkout session",
            param="id"
        )

        response = client.get("/api/billing/checkout-session/cs_invalid")

        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()

        print("✓ Non-existent session returns 404")

    @patch('stripe.checkout.Session.retrieve')
    def test_get_checkout_session_pending(self, mock_stripe_retrieve):
        """Test retrieval of pending session"""
        mock_session = Mock()
        mock_session.id = "cs_test_pending"
        mock_session.status = "open"
        mock_session.customer_email = None
        mock_session.metadata = {"tier": "team"}
        mock_session.amount_total = None
        mock_session.currency = "usd"
        mock_session.subscription = None
        mock_session.customer = None
        mock_session.payment_status = "unpaid"
        mock_stripe_retrieve.return_value = mock_session

        response = client.get("/api/billing/checkout-session/cs_test_pending")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "open"
        assert data["payment_status"] == "unpaid"
        assert data["subscription_id"] is None

        print("✓ Pending session retrieved correctly")


class TestPortalSession:
    """Test customer portal session endpoint"""

    def test_create_portal_session_not_implemented(self):
        """Test that portal session returns 501 (not implemented)"""
        response = client.post(
            "/api/billing/create-portal-session",
            json={
                "return_url": "https://kamiyo.ai/dashboard"
            }
        )

        assert response.status_code == 501
        data = response.json()
        assert "not yet implemented" in data["detail"].lower()

        print("✓ Portal session correctly marked as not implemented")


class TestCheckoutHealth:
    """Test checkout API health check"""

    def test_checkout_health_success(self):
        """Test health check with valid configuration"""
        response = client.get("/api/billing/checkout-health")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "service" in data
        assert data["service"] == "checkout"

        # Should be healthy since we set all env vars
        assert data["status"] in ["healthy", "degraded"]

        if data["status"] == "healthy":
            assert "configured_tiers" in data
            assert len(data["configured_tiers"]) == 3

        print(f"✓ Health check returned status: {data['status']}")

    def test_checkout_health_missing_config(self):
        """Test health check with missing configuration"""
        # Temporarily remove env var
        original_key = os.environ.get("STRIPE_SECRET_KEY")
        if "STRIPE_SECRET_KEY" in os.environ:
            del os.environ["STRIPE_SECRET_KEY"]

        try:
            response = client.get("/api/billing/checkout-health")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "unhealthy"
            assert "error" in data

            print("✓ Health check detects missing configuration")

        finally:
            # Restore env var
            if original_key:
                os.environ["STRIPE_SECRET_KEY"] = original_key


class TestCheckoutIntegration:
    """Integration tests for full checkout flow"""

    @patch('stripe.checkout.Session.retrieve')
    @patch('stripe.checkout.Session.create')
    def test_full_checkout_flow(self, mock_create, mock_retrieve):
        """Test complete checkout flow: create -> redirect -> verify"""
        # Step 1: Create checkout session
        mock_create_session = Mock()
        mock_create_session.id = "cs_test_flow"
        mock_create_session.url = "https://checkout.stripe.com/c/pay/cs_test_flow"
        mock_create_session.expires_at = 1234567890
        mock_create.return_value = mock_create_session

        create_response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "personal",
                "user_email": "test@example.com",
                "success_url": "https://kamiyo.ai/success?session_id={CHECKOUT_SESSION_ID}",
                "cancel_url": "https://kamiyo.ai/cancel"
            }
        )

        assert create_response.status_code == 200
        session_id = create_response.json()["session_id"]

        # Step 2: User redirected to Stripe (simulated)
        # Step 3: After payment, verify session

        mock_retrieve_session = Mock()
        mock_retrieve_session.id = session_id
        mock_retrieve_session.status = "complete"
        mock_retrieve_session.customer_email = "test@example.com"
        mock_retrieve_session.metadata = {"tier": "personal"}
        mock_retrieve_session.amount_total = 1900
        mock_retrieve_session.currency = "usd"
        mock_retrieve_session.subscription = "sub_test"
        mock_retrieve_session.customer = "cus_test"
        mock_retrieve_session.payment_status = "paid"
        mock_retrieve.return_value = mock_retrieve_session

        verify_response = client.get(f"/api/billing/checkout-session/{session_id}")

        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data["status"] == "complete"
        assert verify_data["payment_status"] == "paid"
        assert verify_data["customer_email"] == "test@example.com"

        print("✓ Full checkout flow completed successfully")


def run_manual_tests():
    """Run manual tests for checkout API"""
    print("\n" + "=" * 60)
    print("CHECKOUT API MANUAL TESTS")
    print("=" * 60 + "\n")

    # Test 1: Create checkout session
    print("Test 1: Create Checkout Session")
    with patch('stripe.checkout.Session.create') as mock_create:
        mock_session = Mock()
        mock_session.id = "cs_manual_test"
        mock_session.url = "https://checkout.stripe.com/test"
        mock_session.expires_at = 1234567890
        mock_create.return_value = mock_session

        response = client.post(
            "/api/billing/create-checkout-session",
            json={
                "tier": "personal",
                "user_email": "manual@test.com",
                "success_url": "https://kamiyo.ai/success",
                "cancel_url": "https://kamiyo.ai/cancel"
            }
        )
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            print(f"  Session ID: {response.json().get('session_id')}")
        print()

    # Test 2: Health check
    print("Test 2: Health Check")
    response = client.get("/api/billing/checkout-health")
    print(f"  Status: {response.status_code}")
    print(f"  Health: {response.json().get('status')}")
    print()

    # Test 3: Invalid tier
    print("Test 3: Invalid Tier")
    response = client.post(
        "/api/billing/create-checkout-session",
        json={
            "tier": "invalid",
            "success_url": "https://kamiyo.ai/success",
            "cancel_url": "https://kamiyo.ai/cancel"
        }
    )
    print(f"  Status: {response.status_code}")
    print(f"  Expected: 422 (validation error)")
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
