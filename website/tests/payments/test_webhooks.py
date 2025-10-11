# -*- coding: utf-8 -*-
"""
Webhook Handler Tests
Comprehensive tests for Stripe webhook processing
"""

import pytest
import json
from unittest.mock import Mock, patch, AsyncMock
from fastapi import HTTPException
import stripe

from api.webhooks.stripe_handler import handle_webhook_event, EVENT_PROCESSORS
from tests.payments.fixtures import (
    webhook_customer_created,
    webhook_subscription_created,
    webhook_payment_succeeded,
    webhook_payment_failed
)


class TestWebhookSignatureVerification:
    """Test webhook signature verification"""

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    async def test_valid_signature(self, mock_construct, mock_config):
        """Test webhook with valid signature"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        mock_event = {'id': 'evt_123', 'type': 'customer.created'}
        mock_construct.return_value = mock_event

        request = Mock()
        request.headers = {'stripe-signature': 'valid_sig'}
        raw_body = b'{"id": "evt_123"}'

        with patch('api.webhooks.stripe_handler.store_event', return_value=None):
            result = await handle_webhook_event(request, raw_body)
            assert result['status'] == 'success'

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    async def test_missing_signature(self, mock_config):
        """Test webhook with missing signature"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        request = Mock()
        request.headers = {}
        raw_body = b'test'

        with pytest.raises(HTTPException) as exc_info:
            await handle_webhook_event(request, raw_body)
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    async def test_invalid_signature(self, mock_construct, mock_config):
        """Test webhook with invalid signature"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        mock_construct.side_effect = stripe.error.SignatureVerificationError(
            'Invalid signature', 'sig'
        )

        request = Mock()
        request.headers = {'stripe-signature': 'invalid'}
        raw_body = b'test'

        with pytest.raises(HTTPException) as exc_info:
            await handle_webhook_event(request, raw_body)
        assert exc_info.value.status_code == 400


class TestIdempotency:
    """Test idempotent webhook processing"""

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.stripe_handler.store_event')
    async def test_duplicate_event(self, mock_store, mock_construct, mock_config):
        """Test duplicate webhook event is handled"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        event = {'id': 'evt_123', 'type': 'customer.created'}
        mock_construct.return_value = event
        mock_store.return_value = None  # Already processed

        request = Mock()
        request.headers = {'stripe-signature': 'sig'}
        raw_body = b'test'

        result = await handle_webhook_event(request, raw_body)
        assert result['message'] == 'Event already processed'


class TestEventProcessors:
    """Test individual event processors"""

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.stripe_handler.store_event')
    @patch('api.webhooks.stripe_handler.mark_event_processed')
    async def test_customer_created_processor(
        self, mock_mark, mock_store, mock_construct, mock_config
    ):
        """Test customer.created event processing"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        event = {'id': 'evt_123', 'type': 'customer.created', 'data': {'object': {}}}
        mock_construct.return_value = event
        mock_store.return_value = {'id': 1}

        with patch('api.webhooks.stripe_handler.process_customer_created', new_callable=AsyncMock):
            request = Mock()
            request.headers = {'stripe-signature': 'sig'}
            result = await handle_webhook_event(request, b'test')
            assert result['status'] == 'success'

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.stripe_handler.store_event')
    async def test_unsupported_event_type(self, mock_store, mock_construct, mock_config):
        """Test unsupported event type is skipped"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        event = {'id': 'evt_123', 'type': 'unsupported.event'}
        mock_construct.return_value = event
        mock_store.return_value = {'id': 1}

        request = Mock()
        request.headers = {'stripe-signature': 'sig'}
        
        with patch('api.webhooks.stripe_handler.mark_event_processed'):
            result = await handle_webhook_event(request, b'test')
            assert 'not handled' in result['message']


class TestErrorHandling:
    """Test webhook error handling"""

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.stripe_handler.store_event')
    @patch('api.webhooks.stripe_handler.mark_event_failed')
    async def test_processor_error(self, mock_fail, mock_store, mock_construct, mock_config):
        """Test processor error is handled"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        event = {'id': 'evt_123', 'type': 'customer.created', 'data': {'object': {}}}
        mock_construct.return_value = event
        mock_store.return_value = {'id': 1}

        with patch('api.webhooks.stripe_handler.process_customer_created', new_callable=AsyncMock) as mock_proc:
            mock_proc.side_effect = Exception("Processing failed")
            
            request = Mock()
            request.headers = {'stripe-signature': 'sig'}
            
            with pytest.raises(HTTPException) as exc_info:
                await handle_webhook_event(request, b'test')
            assert exc_info.value.status_code == 500


class TestRetryLogic:
    """Test webhook retry logic"""

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.stripe_handler.store_event')
    async def test_retry_on_failure(self, mock_store, mock_construct, mock_config):
        """Test webhook returns 500 for retry"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        event = {'id': 'evt_123', 'type': 'customer.created', 'data': {'object': {}}}
        mock_construct.return_value = event
        mock_store.return_value = {'id': 1}

        with patch('api.webhooks.stripe_handler.process_customer_created', new_callable=AsyncMock) as mock_proc:
            with patch('api.webhooks.stripe_handler.mark_event_failed'):
                mock_proc.side_effect = Exception("Temporary error")
                
                request = Mock()
                request.headers = {'stripe-signature': 'sig'}
                
                with pytest.raises(HTTPException) as exc_info:
                    await handle_webhook_event(request, b'test')
                assert exc_info.value.status_code == 500


class TestAlertIntegration:
    """Test alert system integration"""

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.stripe_handler.store_event')
    @patch('api.webhooks.stripe_handler.get_alert_manager')
    async def test_critical_event_alert(self, mock_alert, mock_store, mock_construct, mock_config):
        """Test alerts sent for critical events"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        event = {'id': 'evt_123', 'type': 'invoice.payment_failed', 'data': {'object': {}}}
        mock_construct.return_value = event
        mock_store.return_value = {'id': 1}

        alert_mgr = Mock()
        alert_mgr.send_alert = Mock()
        mock_alert.return_value = alert_mgr

        with patch('api.webhooks.stripe_handler.process_payment_failed', new_callable=AsyncMock) as mock_proc:
            with patch('api.webhooks.stripe_handler.mark_event_failed'):
                mock_proc.side_effect = Exception("Payment processing failed")
                
                request = Mock()
                request.headers = {'stripe-signature': 'sig'}
                
                with pytest.raises(HTTPException):
                    await handle_webhook_event(request, b'test')
                
                alert_mgr.send_alert.assert_called()


# Test all event processors are registered
def test_all_processors_registered():
    """Test all expected event processors are registered"""
    expected_events = [
        'customer.created',
        'customer.updated',
        'customer.deleted',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.payment_succeeded',
        'invoice.payment_failed',
        'payment_method.attached',
        'payment_method.detached'
    ]

    for event_type in expected_events:
        assert event_type in EVENT_PROCESSORS
        assert callable(EVENT_PROCESSORS[event_type])


# Performance tests
class TestWebhookPerformance:
    """Test webhook processing performance"""

    @pytest.mark.asyncio
    @patch('api.webhooks.stripe_handler.get_stripe_config')
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.stripe_handler.store_event')
    async def test_processing_time_tracked(self, mock_store, mock_construct, mock_config):
        """Test processing time is tracked"""
        config = Mock()
        config.webhook_secret = 'whsec_test123'
        mock_config.return_value = config

        event = {'id': 'evt_123', 'type': 'customer.created', 'data': {'object': {}}}
        mock_construct.return_value = event
        mock_store.return_value = {'id': 1}

        with patch('api.webhooks.stripe_handler.process_customer_created', new_callable=AsyncMock):
            with patch('api.webhooks.stripe_handler.mark_event_processed'):
                with patch('api.webhooks.stripe_handler.log_processing_attempt') as mock_log:
                    request = Mock()
                    request.headers = {'stripe-signature': 'sig'}
                    
                    result = await handle_webhook_event(request, b'test')
                    assert 'processing_time_ms' in result
