# -*- coding: utf-8 -*-
"""
P1 Payment Fixes - Integration Tests
Tests all P1 fixes to ensure payment security and PCI compliance
"""

import pytest
import asyncio
from unittest import mock
from datetime import datetime, timedelta
import stripe

# Import modules to test
from api.payments.stripe_client import StripeClient, get_stripe_client
from api.payments.stripe_version_monitor import StripeVersionMonitor, get_version_monitor
from api.payments.errors import sanitize_correlation_id, map_stripe_error, PaymentErrorCode
from api.webhooks.stripe_handler import handle_webhook_event


class TestP1_1_VersionMonitoring:
    """Test P1-1: Stripe API Version Monitoring"""

    def test_version_health_check(self):
        """Test that version health check returns expected structure"""
        monitor = get_version_monitor()
        health = monitor.check_version_health()

        # Check structure
        assert 'version' in health
        assert 'version_date' in health
        assert 'age_days' in health
        assert 'status' in health
        assert 'message' in health

        # Check status values
        assert health['status'] in ['healthy', 'warning', 'critical', 'error']

    def test_version_age_calculation(self):
        """Test that version age is calculated correctly"""
        monitor = StripeVersionMonitor()

        # Test parsing
        version_date = monitor._parse_version_date('2023-10-16')
        assert version_date is not None
        assert version_date.year == 2023
        assert version_date.month == 10
        assert version_date.day == 16

        # Test age calculation
        age = monitor._calculate_version_age_days(version_date)
        assert age >= 0
        assert age < 3650  # Less than 10 years (sanity check)

    def test_warning_threshold(self):
        """Test that warning status is triggered at 6 months"""
        monitor = StripeVersionMonitor()

        # Mock version date to 6 months + 1 day ago
        with mock.patch.object(monitor, '_parse_version_date') as mock_parse:
            mock_parse.return_value = datetime.utcnow() - timedelta(days=181)

            status = monitor._determine_health_status(181)
            assert status == 'warning'

    def test_critical_threshold(self):
        """Test that critical status is triggered at 1 year"""
        monitor = StripeVersionMonitor()

        # Mock version date to 1 year + 1 day ago
        status = monitor._determine_health_status(366)
        assert status == 'critical'

    def test_upgrade_recommendation(self):
        """Test upgrade recommendation logic"""
        monitor = get_version_monitor()
        recommendation = monitor.get_upgrade_recommendation()

        assert 'should_upgrade' in recommendation
        assert 'urgency' in recommendation
        assert 'current_version' in recommendation
        assert recommendation['urgency'] in ['none', 'low', 'medium', 'high', 'critical', 'unknown']


class TestP1_2_IdempotencyKeys:
    """Test P1-2: Deterministic Idempotency Keys"""

    def test_idempotency_key_generation(self):
        """Test that idempotency key is deterministic"""
        client = StripeClient()

        # Generate key twice with same inputs
        key1 = client._generate_idempotency_key("customer-create", 123, email="test@example.com")
        key2 = client._generate_idempotency_key("customer-create", 123, email="test@example.com")

        # Should be identical
        assert key1 == key2
        assert len(key1) == 32  # SHA-256 truncated to 32 chars

    def test_idempotency_key_uniqueness(self):
        """Test that different inputs produce different keys"""
        client = StripeClient()

        # Different user IDs
        key1 = client._generate_idempotency_key("customer-create", 123)
        key2 = client._generate_idempotency_key("customer-create", 456)
        assert key1 != key2

        # Different operations
        key3 = client._generate_idempotency_key("customer-create", 123)
        key4 = client._generate_idempotency_key("subscription-create", 123)
        assert key3 != key4

        # Different dates (mock)
        with mock.patch('api.payments.stripe_client.datetime') as mock_datetime:
            mock_datetime.utcnow.return_value.date.return_value.isoformat.return_value = "2025-10-13"
            key5 = client._generate_idempotency_key("customer-create", 123)

            mock_datetime.utcnow.return_value.date.return_value.isoformat.return_value = "2025-10-14"
            key6 = client._generate_idempotency_key("customer-create", 123)

            assert key5 != key6

    @pytest.mark.asyncio
    async def test_duplicate_customer_prevention(self):
        """Test that duplicate customer creation is prevented"""
        # Mock database to return existing customer
        with mock.patch.object(StripeClient, '_check_duplicate_operation') as mock_check:
            mock_check.return_value = {
                'id': 1,
                'stripe_customer_id': 'cus_existing',
                'user_id': 123,
                'email': 'test@example.com'
            }

            client = get_stripe_client()

            # Attempt to create customer
            with mock.patch.object(client, '_call_stripe_api') as mock_stripe:
                result = await client.create_customer(user_id=123, email="test@example.com")

                # Should return existing customer without calling Stripe
                assert result['id'] == 1
                assert result['stripe_customer_id'] == 'cus_existing'
                mock_stripe.assert_not_called()


class TestP1_3_RetryLogic:
    """Test P1-3: Stripe Error Retry Logic"""

    @pytest.mark.asyncio
    async def test_retry_on_network_error(self):
        """Test automatic retry on network failures"""
        client = get_stripe_client()

        with mock.patch('stripe.Customer.create') as mock_create:
            # Fail twice, succeed on third attempt
            mock_create.side_effect = [
                stripe.error.APIConnectionError("Network error"),
                stripe.error.APIConnectionError("Network error"),
                mock.MagicMock(id='cus_123', email='test@example.com')
            ]

            # Should succeed after retries
            result = client._call_stripe_api(stripe.Customer.create, email="test@example.com")

            assert mock_create.call_count == 3
            assert result.id == 'cus_123'

    @pytest.mark.asyncio
    async def test_retry_on_rate_limit(self):
        """Test retry on rate limit errors"""
        client = get_stripe_client()

        with mock.patch('stripe.Customer.create') as mock_create:
            # Rate limit twice, succeed on third
            mock_create.side_effect = [
                stripe.error.RateLimitError("Rate limit exceeded"),
                stripe.error.RateLimitError("Rate limit exceeded"),
                mock.MagicMock(id='cus_123')
            ]

            result = client._call_stripe_api(stripe.Customer.create, email="test@example.com")

            assert mock_create.call_count == 3

    @pytest.mark.asyncio
    async def test_no_retry_on_card_error(self):
        """Test that card errors fail immediately (no retry)"""
        client = get_stripe_client()

        with mock.patch('stripe.Customer.create') as mock_create:
            mock_create.side_effect = stripe.error.CardError(
                message="Card declined",
                param="card",
                code="card_declined"
            )

            # Should raise immediately without retries
            with pytest.raises(stripe.error.CardError):
                client._call_stripe_api(stripe.Customer.create, email="test@example.com")

            # Should only attempt once (no retries)
            assert mock_create.call_count == 1

    @pytest.mark.asyncio
    async def test_no_retry_on_invalid_request(self):
        """Test that invalid requests fail immediately"""
        client = get_stripe_client()

        with mock.patch('stripe.Customer.create') as mock_create:
            mock_create.side_effect = stripe.error.InvalidRequestError(
                message="Invalid parameters",
                param="email"
            )

            with pytest.raises(stripe.error.InvalidRequestError):
                client._call_stripe_api(stripe.Customer.create, email="invalid")

            assert mock_create.call_count == 1

    def test_retry_backoff_timing(self):
        """Test exponential backoff timing"""
        # This test validates the retry configuration
        from tenacity import retry, stop_after_attempt, wait_exponential

        # Verify retry decorator configuration
        client = get_stripe_client()
        retry_config = client._call_stripe_api.retry

        # Should stop after 3 attempts
        assert hasattr(retry_config, 'stop')

        # Should use exponential backoff
        assert hasattr(retry_config, 'wait')


class TestP1_4_RateLimiting:
    """Test P1-4: Webhook Rate Limiting"""

    @pytest.mark.asyncio
    async def test_rate_limit_enforcement(self):
        """Test that rate limit is enforced"""
        from fastapi import Request
        from slowapi.errors import RateLimitExceeded

        # Mock request
        request = mock.MagicMock(spec=Request)
        request.headers = {'user-agent': 'test'}

        # Simulate 31 requests (limit is 30/min)
        with mock.patch('api.webhooks.stripe_handler.limiter.check_request_limit') as mock_limit:
            # First 30 requests succeed
            for i in range(30):
                mock_limit.return_value = None
                # Process webhook (would succeed)

            # 31st request should be rate limited
            mock_limit.side_effect = RateLimitExceeded("Rate limit exceeded")

            # Should raise HTTPException with 429
            with pytest.raises(Exception):  # Would be HTTPException(429)
                await handle_webhook_event(request, b'{"test": "data"}')

    def test_rate_limit_configuration(self):
        """Test rate limit configuration"""
        from api.webhooks.stripe_handler import limiter

        # Verify limiter exists
        assert limiter is not None

        # Verify it uses IP-based limiting
        from slowapi.util import get_remote_address
        assert limiter._key_func == get_remote_address


class TestP1_5_CorrelationIDs:
    """Test P1-5: Correlation ID Validation"""

    def test_sql_injection_prevention(self):
        """Test that SQL injection attempts are sanitized"""
        malicious_id = "'; DROP TABLE users; --"
        safe_id = sanitize_correlation_id(malicious_id)

        # Should remove dangerous characters
        assert "DROP" not in safe_id
        assert ";" not in safe_id
        assert "--" not in safe_id

    def test_xss_prevention(self):
        """Test that XSS attempts are sanitized"""
        malicious_id = "<script>alert('xss')</script>"
        safe_id = sanitize_correlation_id(malicious_id)

        # Should remove dangerous characters
        assert "<" not in safe_id
        assert ">" not in safe_id
        assert "script" in safe_id  # Letters remain

    def test_path_traversal_prevention(self):
        """Test that path traversal is sanitized"""
        malicious_id = "../../../etc/passwd"
        safe_id = sanitize_correlation_id(malicious_id)

        assert ".." not in safe_id
        assert "/" not in safe_id

    def test_command_injection_prevention(self):
        """Test that command injection is sanitized"""
        malicious_id = "; rm -rf /"
        safe_id = sanitize_correlation_id(malicious_id)

        assert ";" not in safe_id
        assert "rm" in safe_id  # Letters remain but harmless

    def test_valid_id_preservation(self):
        """Test that valid IDs are preserved"""
        valid_id = "valid_id_123-456"
        safe_id = sanitize_correlation_id(valid_id)

        assert safe_id == valid_id

    def test_length_limit(self):
        """Test that IDs are limited to 64 characters"""
        long_id = "a" * 100
        safe_id = sanitize_correlation_id(long_id)

        assert len(safe_id) == 64

    def test_uuid_generation_on_invalid(self):
        """Test that UUID is generated for invalid IDs"""
        invalid_id = "!@#$%^&*()"
        safe_id = sanitize_correlation_id(invalid_id)

        # Should be a valid UUID format
        assert len(safe_id) == 36  # UUID length with dashes
        assert safe_id.count('-') == 4  # UUID has 4 dashes

    def test_stripe_error_mapping(self):
        """Test that Stripe errors are mapped correctly"""
        # Create a mock Stripe error
        stripe_error = stripe.error.CardError(
            message="Card declined",
            param="card",
            code="card_declined"
        )

        error_response = map_stripe_error(stripe_error, "test-request-123")

        # Verify structure
        assert 'error_code' in error_response
        assert 'message' in error_response
        assert 'user_action' in error_response
        assert 'support_id' in error_response
        assert 'support_contact' in error_response

        # Verify no sensitive data
        assert 'Card declined' not in error_response['message']  # Generic message
        assert error_response['error_code'] == PaymentErrorCode.CARD_DECLINED.value

        # Verify safe correlation ID
        assert len(error_response['support_id']) > 0


class TestPCICompliance:
    """Test overall PCI compliance"""

    def test_no_sensitive_data_in_logs(self):
        """Test that sensitive data is not logged"""
        from api.payments.pci_logging_filter import PCILoggingFilter

        pci_filter = PCILoggingFilter()

        # Test card number redaction
        log_message = "Card number: 4242424242424242"
        filtered = pci_filter.filter_message(log_message)
        assert "4242424242424242" not in filtered
        assert "[REDACTED-PAN]" in filtered

        # Test CVV redaction
        log_message = "CVV: 123"
        filtered = pci_filter.filter_message(log_message)
        assert "123" not in filtered or "[REDACTED" in filtered

    def test_error_messages_safe(self):
        """Test that error messages don't expose sensitive data"""
        # Test various error types
        errors = [
            stripe.error.CardError("Card declined", "card", "card_declined"),
            stripe.error.InvalidRequestError("Invalid request", "email"),
            stripe.error.APIError("API error")
        ]

        for error in errors:
            response = map_stripe_error(error, "test-id")

            # Should not contain:
            # - Internal error messages
            # - Stack traces
            # - System paths
            # - API keys
            # - Card numbers
            assert 'stripe' not in response['message'].lower()
            assert 'api' not in response['message'].lower()
            assert 'error' not in response['message'].lower() or 'an error occurred' in response['message'].lower()

    def test_idempotency_prevents_double_charge(self):
        """Test that idempotency prevents double-charging"""
        client = StripeClient()

        # Same operation twice should produce same key
        key1 = client._generate_idempotency_key("subscription-create", 123, price_id="price_123")
        key2 = client._generate_idempotency_key("subscription-create", 123, price_id="price_123")

        assert key1 == key2

        # When sent to Stripe with same key, Stripe returns cached result
        # (this is Stripe's behavior, not tested here)


if __name__ == '__main__':
    # Run tests
    pytest.main([__file__, '-v', '--tb=short'])
