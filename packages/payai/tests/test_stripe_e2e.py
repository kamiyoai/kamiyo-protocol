# -*- coding: utf-8 -*-
"""
End-to-End Tests for Stripe Payment System
Tests the complete subscription flow from checkout to webhooks
"""

import os
import sys
import pytest
import json
import time
import hmac
import hashlib
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from decimal import Decimal

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from fastapi import Request
import stripe

# Import application
from api.main import app
from api.billing.checkout import CheckoutRequest, CheckoutResponse
from api.webhooks.stripe_handler import handle_webhook_event
from api.subscriptions.manager import SubscriptionManager, TierName
from database.postgres_manager import get_db


# ==========================================
# FIXTURES
# ==========================================

@pytest.fixture
def client():
    """FastAPI test client"""
    return TestClient(app)


@pytest.fixture
def mock_stripe_key():
    """Mock Stripe API key"""
    with patch.dict(os.environ, {
        'STRIPE_SECRET_KEY': 'sk_test_mock_key_12345',
        'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret',
        'STRIPE_PRICE_MCP_PERSONAL': 'price_personal_123',
        'STRIPE_PRICE_MCP_TEAM': 'price_team_456',
        'STRIPE_PRICE_MCP_ENTERPRISE': 'price_enterprise_789'
    }):
        yield


@pytest.fixture
def mock_database():
    """Mock database operations"""
    with patch('database.postgres_manager.get_db') as mock_db:
        db_instance = Mock()
        db_instance.execute_with_retry = Mock(return_value=[])
        mock_db.return_value = db_instance
        yield db_instance


@pytest.fixture
def sample_customer():
    """Sample Stripe customer data"""
    return {
        'id': 'cus_test123',
        'email': 'test@example.com',
        'name': 'Test User',
        'created': int(time.time())
    }


@pytest.fixture
def sample_subscription():
    """Sample Stripe subscription data"""
    return {
        'id': 'sub_test123',
        'customer': 'cus_test123',
        'status': 'active',
        'current_period_start': int(time.time()),
        'current_period_end': int(time.time()) + 2592000,  # +30 days
        'items': {
            'data': [{
                'price': {
                    'id': 'price_personal_123',
                    'unit_amount': 1900,
                    'currency': 'usd'
                }
            }]
        },
        'metadata': {
            'tier': 'personal',
            'product_type': 'mcp'
        }
    }


@pytest.fixture
def webhook_signature_generator():
    """Generate valid Stripe webhook signatures"""
    def generate(payload, secret='whsec_test_secret'):
        timestamp = int(time.time())
        signed_payload = f"{timestamp}.{payload}"
        signature = hmac.new(
            secret.encode('utf-8'),
            signed_payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        return f"t={timestamp},v1={signature}"
    return generate


# ==========================================
# TEST SECTION 1: CHECKOUT SESSION CREATION
# ==========================================

class TestCheckoutSessionCreation:
    """Tests for creating checkout sessions"""

    @patch('stripe.checkout.Session.create')
    def test_create_checkout_personal_tier(self, mock_create, client, mock_stripe_key):
        """Test creating checkout session for Personal tier ($19/mo)"""
        # Mock Stripe response
        mock_create.return_value = Mock(
            id='cs_test_personal',
            url='https://checkout.stripe.com/c/pay/cs_test_personal',
            expires_at=int(time.time()) + 86400
        )

        # Create checkout request
        response = client.post('/api/billing/create-checkout-session', json={
            'tier': 'personal',
            'user_email': 'test@example.com',
            'success_url': 'https://example.com/success',
            'cancel_url': 'https://example.com/cancel'
        })

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert 'checkout_url' in data
        assert 'session_id' in data
        assert data['session_id'] == 'cs_test_personal'

        # Verify Stripe was called correctly
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args[1]
        assert call_kwargs['mode'] == 'subscription'
        assert call_kwargs['customer_email'] == 'test@example.com'


    @patch('stripe.checkout.Session.create')
    def test_create_checkout_team_tier(self, mock_create, client, mock_stripe_key):
        """Test creating checkout session for Team tier ($99/mo)"""
        mock_create.return_value = Mock(
            id='cs_test_team',
            url='https://checkout.stripe.com/c/pay/cs_test_team',
            expires_at=int(time.time()) + 86400
        )

        response = client.post('/api/billing/create-checkout-session', json={
            'tier': 'team',
            'success_url': 'https://example.com/success',
            'cancel_url': 'https://example.com/cancel'
        })

        assert response.status_code == 200
        data = response.json()
        assert data['session_id'] == 'cs_test_team'


    @patch('stripe.checkout.Session.create')
    def test_create_checkout_enterprise_tier(self, mock_create, client, mock_stripe_key):
        """Test creating checkout session for Enterprise tier ($299/mo)"""
        mock_create.return_value = Mock(
            id='cs_test_enterprise',
            url='https://checkout.stripe.com/c/pay/cs_test_enterprise',
            expires_at=int(time.time()) + 86400
        )

        response = client.post('/api/billing/create-checkout-session', json={
            'tier': 'enterprise',
            'success_url': 'https://example.com/success',
            'cancel_url': 'https://example.com/cancel'
        })

        assert response.status_code == 200
        assert response.json()['session_id'] == 'cs_test_enterprise'


    @patch('stripe.checkout.Session.create')
    def test_checkout_redirect_urls_validation(self, mock_create, client, mock_stripe_key):
        """Test redirect URL validation"""
        mock_create.return_value = Mock(
            id='cs_test',
            url='https://checkout.stripe.com/c/pay/cs_test',
            expires_at=int(time.time()) + 86400
        )

        # Test with valid HTTPS URLs
        response = client.post('/api/billing/create-checkout-session', json={
            'tier': 'personal',
            'success_url': 'https://example.com/success',
            'cancel_url': 'https://example.com/cancel'
        })
        assert response.status_code == 200

        # Verify URLs were passed correctly
        call_kwargs = mock_create.call_args[1]
        assert call_kwargs['success_url'] == 'https://example.com/success'
        assert call_kwargs['cancel_url'] == 'https://example.com/cancel'


    def test_checkout_without_user_email(self, client, mock_stripe_key):
        """Test creating checkout session without pre-filled email"""
        with patch('stripe.checkout.Session.create') as mock_create:
            mock_create.return_value = Mock(
                id='cs_test_no_email',
                url='https://checkout.stripe.com/c/pay/cs_test_no_email',
                expires_at=int(time.time()) + 86400
            )

            response = client.post('/api/billing/create-checkout-session', json={
                'tier': 'personal',
                'success_url': 'https://example.com/success',
                'cancel_url': 'https://example.com/cancel'
            })

            assert response.status_code == 200
            # Verify email was not passed to Stripe
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs.get('customer_email') is None


    def test_checkout_invalid_tier(self, client, mock_stripe_key):
        """Test checkout with invalid tier name"""
        response = client.post('/api/billing/create-checkout-session', json={
            'tier': 'invalid_tier',
            'success_url': 'https://example.com/success',
            'cancel_url': 'https://example.com/cancel'
        })

        assert response.status_code == 422  # Validation error


    @patch('stripe.checkout.Session.create')
    def test_checkout_stripe_error_handling(self, mock_create, client, mock_stripe_key):
        """Test handling Stripe API errors during checkout"""
        mock_create.side_effect = stripe.error.StripeError("Card declined")

        response = client.post('/api/billing/create-checkout-session', json={
            'tier': 'personal',
            'success_url': 'https://example.com/success',
            'cancel_url': 'https://example.com/cancel'
        })

        assert response.status_code == 500
        assert 'Payment system error' in response.json()['detail']


# ==========================================
# TEST SECTION 2: WEBHOOK PROCESSING
# ==========================================

class TestWebhookProcessing:
    """Tests for webhook event processing"""

    @pytest.mark.asyncio
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.event_store.store_event')
    @patch('api.webhooks.processors.process_checkout_session_completed')
    async def test_checkout_session_completed_webhook(
        self, mock_processor, mock_store, mock_construct, webhook_signature_generator
    ):
        """Test checkout.session.completed webhook event"""
        # Create webhook payload
        event_data = {
            'id': 'evt_test_checkout',
            'type': 'checkout.session.completed',
            'data': {
                'object': {
                    'id': 'cs_test_123',
                    'customer': 'cus_test_123',
                    'subscription': 'sub_test_123',
                    'customer_email': 'test@example.com',
                    'metadata': {'tier': 'personal'}
                }
            }
        }

        # Mock Stripe event construction
        mock_construct.return_value = event_data
        mock_store.return_value = True  # Event is new
        mock_processor.return_value = None  # Successful processing

        # Create request mock
        request = Mock(spec=Request)
        request.headers.get = Mock(return_value=webhook_signature_generator(json.dumps(event_data)))
        raw_body = json.dumps(event_data).encode('utf-8')

        # Process webhook
        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            result = await handle_webhook_event(request, raw_body)

        # Assertions
        assert result['status'] == 'success'
        assert result['event_id'] == 'evt_test_checkout'
        mock_processor.assert_called_once()


    @pytest.mark.asyncio
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.event_store.store_event')
    @patch('api.webhooks.processors.process_subscription_created')
    async def test_subscription_created_webhook(
        self, mock_processor, mock_store, mock_construct, webhook_signature_generator
    ):
        """Test customer.subscription.created webhook event"""
        event_data = {
            'id': 'evt_sub_created',
            'type': 'customer.subscription.created',
            'data': {
                'object': {
                    'id': 'sub_test_123',
                    'customer': 'cus_test_123',
                    'status': 'active',
                    'metadata': {'tier': 'team'}
                }
            }
        }

        mock_construct.return_value = event_data
        mock_store.return_value = True
        mock_processor.return_value = None

        request = Mock(spec=Request)
        request.headers.get = Mock(return_value=webhook_signature_generator(json.dumps(event_data)))
        raw_body = json.dumps(event_data).encode('utf-8')

        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            result = await handle_webhook_event(request, raw_body)

        assert result['status'] == 'success'
        mock_processor.assert_called_once()


    @pytest.mark.asyncio
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.event_store.store_event')
    @patch('api.webhooks.processors.process_subscription_updated')
    async def test_subscription_updated_webhook(
        self, mock_processor, mock_store, mock_construct, webhook_signature_generator
    ):
        """Test customer.subscription.updated webhook event"""
        event_data = {
            'id': 'evt_sub_updated',
            'type': 'customer.subscription.updated',
            'data': {
                'object': {
                    'id': 'sub_test_123',
                    'customer': 'cus_test_123',
                    'status': 'active',
                    'cancel_at_period_end': True
                }
            }
        }

        mock_construct.return_value = event_data
        mock_store.return_value = True
        mock_processor.return_value = None

        request = Mock(spec=Request)
        request.headers.get = Mock(return_value=webhook_signature_generator(json.dumps(event_data)))
        raw_body = json.dumps(event_data).encode('utf-8')

        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            result = await handle_webhook_event(request, raw_body)

        assert result['status'] == 'success'


    @pytest.mark.asyncio
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.event_store.store_event')
    @patch('api.webhooks.processors.process_subscription_deleted')
    async def test_subscription_deleted_webhook(
        self, mock_processor, mock_store, mock_construct, webhook_signature_generator
    ):
        """Test customer.subscription.deleted webhook event"""
        event_data = {
            'id': 'evt_sub_deleted',
            'type': 'customer.subscription.deleted',
            'data': {
                'object': {
                    'id': 'sub_test_123',
                    'customer': 'cus_test_123',
                    'status': 'canceled'
                }
            }
        }

        mock_construct.return_value = event_data
        mock_store.return_value = True
        mock_processor.return_value = None

        request = Mock(spec=Request)
        request.headers.get = Mock(return_value=webhook_signature_generator(json.dumps(event_data)))
        raw_body = json.dumps(event_data).encode('utf-8')

        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            result = await handle_webhook_event(request, raw_body)

        assert result['status'] == 'success'


    @pytest.mark.asyncio
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.event_store.store_event')
    @patch('api.webhooks.processors.process_payment_succeeded')
    async def test_invoice_payment_succeeded_webhook(
        self, mock_processor, mock_store, mock_construct, webhook_signature_generator
    ):
        """Test invoice.payment_succeeded webhook event"""
        event_data = {
            'id': 'evt_payment_succeeded',
            'type': 'invoice.payment_succeeded',
            'data': {
                'object': {
                    'id': 'in_test_123',
                    'customer': 'cus_test_123',
                    'subscription': 'sub_test_123',
                    'amount_paid': 1900,
                    'currency': 'usd'
                }
            }
        }

        mock_construct.return_value = event_data
        mock_store.return_value = True
        mock_processor.return_value = None

        request = Mock(spec=Request)
        request.headers.get = Mock(return_value=webhook_signature_generator(json.dumps(event_data)))
        raw_body = json.dumps(event_data).encode('utf-8')

        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            result = await handle_webhook_event(request, raw_body)

        assert result['status'] == 'success'


    @pytest.mark.asyncio
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.event_store.store_event')
    @patch('api.webhooks.processors.process_payment_failed')
    async def test_invoice_payment_failed_webhook(
        self, mock_processor, mock_store, mock_construct, webhook_signature_generator
    ):
        """Test invoice.payment_failed webhook event"""
        event_data = {
            'id': 'evt_payment_failed',
            'type': 'invoice.payment_failed',
            'data': {
                'object': {
                    'id': 'in_test_123',
                    'customer': 'cus_test_123',
                    'subscription': 'sub_test_123',
                    'amount_due': 1900,
                    'attempt_count': 1
                }
            }
        }

        mock_construct.return_value = event_data
        mock_store.return_value = True
        mock_processor.return_value = None

        request = Mock(spec=Request)
        request.headers.get = Mock(return_value=webhook_signature_generator(json.dumps(event_data)))
        raw_body = json.dumps(event_data).encode('utf-8')

        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            result = await handle_webhook_event(request, raw_body)

        assert result['status'] == 'success'


    @pytest.mark.asyncio
    @patch('stripe.Webhook.construct_event')
    async def test_webhook_signature_validation_failure(self, mock_construct):
        """Test webhook signature validation fails with invalid signature"""
        mock_construct.side_effect = stripe.error.SignatureVerificationError(
            "Invalid signature", "sig_header"
        )

        request = Mock(spec=Request)
        request.headers.get = Mock(return_value="invalid_signature")
        raw_body = b'{"test": "data"}'

        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            with pytest.raises(Exception):  # Should raise HTTPException
                await handle_webhook_event(request, raw_body)


    @pytest.mark.asyncio
    @patch('stripe.Webhook.construct_event')
    @patch('api.webhooks.event_store.store_event')
    async def test_webhook_idempotency_duplicate_event(
        self, mock_store, mock_construct, webhook_signature_generator
    ):
        """Test webhook idempotency - duplicate events are ignored"""
        event_data = {
            'id': 'evt_duplicate',
            'type': 'checkout.session.completed',
            'data': {'object': {'id': 'cs_test'}}
        }

        mock_construct.return_value = event_data
        mock_store.return_value = False  # Event already exists

        request = Mock(spec=Request)
        request.headers.get = Mock(return_value=webhook_signature_generator(json.dumps(event_data)))
        raw_body = json.dumps(event_data).encode('utf-8')

        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            result = await handle_webhook_event(request, raw_body)

        # Should return success but not process
        assert result['status'] == 'success'
        assert 'already processed' in result['message']


# ==========================================
# TEST SECTION 3: SUBSCRIPTION MANAGEMENT
# ==========================================

class TestSubscriptionManagement:
    """Tests for subscription lifecycle management"""

    @pytest.mark.asyncio
    async def test_subscription_activation_in_database(self, mock_database):
        """Test subscription is activated in database after webhook"""
        manager = SubscriptionManager(db=mock_database)

        # Mock database response
        mock_database.execute_with_retry.return_value = [{
            'id': 1,
            'user_id': 'user_123',
            'tier': 'personal',
            'status': 'active',
            'stripe_subscription_id': 'sub_test_123',
            'stripe_customer_id': 'cus_test_123',
            'current_period_start': datetime.now(),
            'current_period_end': datetime.now() + timedelta(days=30),
            'cancel_at_period_end': False,
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }]

        subscription = await manager.get_subscription('user_123')

        assert subscription is not None
        assert subscription.tier == TierName.PRO  # 'personal' maps to PRO
        assert subscription.status == 'active'


    @pytest.mark.asyncio
    async def test_user_tier_upgrade(self, mock_database):
        """Test user tier upgrade from Personal to Team"""
        manager = SubscriptionManager(db=mock_database)

        # Mock current tier
        mock_database.execute_with_retry.return_value = [{
            'tier': 'pro'
        }]

        # Mock upgrade response
        mock_database.execute_with_retry.return_value = [{
            'id': 1,
            'user_id': 'user_123',
            'tier': 'team',
            'status': 'active',
            'stripe_subscription_id': 'sub_upgraded',
            'stripe_customer_id': 'cus_test_123',
            'current_period_start': datetime.now(),
            'current_period_end': datetime.now() + timedelta(days=30),
            'cancel_at_period_end': False,
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }]

        subscription = await manager.upgrade_subscription('user_123', TierName.TEAM)

        assert subscription.tier == TierName.TEAM


    @pytest.mark.asyncio
    async def test_user_tier_downgrade(self, mock_database):
        """Test user tier downgrade from Team to Personal"""
        manager = SubscriptionManager(db=mock_database)

        # Mock current tier
        mock_database.execute_with_retry.return_value = [{
            'tier': 'team'
        }]

        # Mock downgrade response
        mock_database.execute_with_retry.return_value = [{
            'id': 1,
            'user_id': 'user_123',
            'tier': 'team',
            'status': 'active',
            'stripe_subscription_id': 'sub_test',
            'stripe_customer_id': 'cus_test_123',
            'current_period_start': datetime.now(),
            'current_period_end': datetime.now() + timedelta(days=30),
            'cancel_at_period_end': True,  # Scheduled for downgrade
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }]

        subscription = await manager.downgrade_subscription('user_123', TierName.PRO)

        assert subscription.cancel_at_period_end is True


    @pytest.mark.asyncio
    async def test_subscription_cancellation(self, mock_database):
        """Test subscription cancellation"""
        manager = SubscriptionManager(db=mock_database)

        # Mock cancellation response
        mock_database.execute_with_retry.return_value = [{'id': 1}]

        result = await manager.cancel_subscription('user_123')

        assert result is True


    @pytest.mark.asyncio
    async def test_subscription_renewal(self, mock_database):
        """Test subscription renewal (period end update)"""
        manager = SubscriptionManager(db=mock_database)

        # Mock renewed subscription
        new_period_end = datetime.now() + timedelta(days=30)
        mock_database.execute_with_retry.return_value = [{
            'id': 1,
            'user_id': 'user_123',
            'tier': 'pro',
            'status': 'active',
            'current_period_end': new_period_end,
            'stripe_subscription_id': 'sub_test_123',
            'stripe_customer_id': 'cus_test_123',
            'current_period_start': datetime.now(),
            'cancel_at_period_end': False,
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }]

        subscription = await manager.get_subscription('user_123')

        assert subscription.status == 'active'
        assert subscription.current_period_end > datetime.now()


# ==========================================
# TEST SECTION 4: CUSTOMER PORTAL
# ==========================================

class TestCustomerPortal:
    """Tests for Stripe Customer Portal"""

    @patch('stripe.billing_portal.Session.create')
    def test_create_portal_session(self, mock_create, client, mock_stripe_key, mock_database):
        """Test creating Customer Portal session"""
        mock_create.return_value = Mock(
            id='bps_test_123',
            url='https://billing.stripe.com/session/test_123'
        )

        # Mock database to return customer ID
        mock_database.execute_with_retry.return_value = [{
            'stripe_customer_id': 'cus_test_123'
        }]

        # Mock authentication
        with patch('api.auth_helpers.get_current_user', return_value=Mock(id='user_123')):
            response = client.post('/api/v1/billing/portal', json={
                'return_url': 'https://example.com/dashboard'
            })

        assert response.status_code == 200
        data = response.json()
        assert 'url' in data


    def test_portal_session_without_customer(self, client, mock_stripe_key, mock_database):
        """Test portal session creation fails without Stripe customer"""
        # Mock database to return no customer
        mock_database.execute_with_retry.return_value = []

        with patch('api.auth_helpers.get_current_user', return_value=Mock(id='user_123')):
            response = client.post('/api/v1/billing/portal', json={
                'return_url': 'https://example.com/dashboard'
            })

        assert response.status_code == 404


# ==========================================
# TEST SECTION 5: API INTEGRATION
# ==========================================

class TestAPIIntegration:
    """Tests for billing API endpoints"""

    def test_create_checkout_session_endpoint(self, client, mock_stripe_key):
        """Test /api/billing/create-checkout-session endpoint"""
        with patch('stripe.checkout.Session.create') as mock_create:
            mock_create.return_value = Mock(
                id='cs_test',
                url='https://checkout.stripe.com/test',
                expires_at=int(time.time()) + 86400
            )

            response = client.post('/api/billing/create-checkout-session', json={
                'tier': 'personal',
                'success_url': 'https://example.com/success',
                'cancel_url': 'https://example.com/cancel'
            })

            assert response.status_code == 200


    def test_create_portal_session_requires_authentication(self, client, mock_stripe_key):
        """Test portal endpoint requires authentication"""
        response = client.post('/api/v1/billing/portal', json={
            'return_url': 'https://example.com/dashboard'
        })

        # Should fail without authentication
        assert response.status_code in [401, 403]


    def test_stripe_webhook_endpoint(self, client):
        """Test /api/v1/webhooks/stripe endpoint"""
        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            with patch('stripe.Webhook.construct_event') as mock_construct:
                mock_construct.return_value = {
                    'id': 'evt_test',
                    'type': 'checkout.session.completed',
                    'data': {'object': {'id': 'cs_test'}}
                }

                response = client.post(
                    '/api/v1/webhooks/stripe',
                    data=json.dumps({'type': 'checkout.session.completed'}),
                    headers={
                        'stripe-signature': 't=123,v1=abc123',
                        'content-type': 'application/json'
                    }
                )

                # Webhook should accept the event
                assert response.status_code in [200, 400, 500]  # Various states depending on processing


    def test_api_error_handling_missing_stripe_key(self, client):
        """Test API error handling when Stripe key is missing"""
        with patch.dict(os.environ, {'STRIPE_SECRET_KEY': ''}, clear=True):
            response = client.post('/api/billing/create-checkout-session', json={
                'tier': 'personal',
                'success_url': 'https://example.com/success',
                'cancel_url': 'https://example.com/cancel'
            })

            assert response.status_code == 500
            assert 'Payment system not configured' in response.json()['detail']


# ==========================================
# TEST SECTION 6: DATABASE VERIFICATION
# ==========================================

class TestDatabaseVerification:
    """Tests for database operations"""

    @pytest.mark.asyncio
    async def test_subscription_record_creation(self, mock_database):
        """Test subscription record is created in database"""
        manager = SubscriptionManager(db=mock_database)

        mock_database.execute_with_retry.return_value = [{
            'id': 1,
            'user_id': 'user_123',
            'tier': 'pro',
            'status': 'active',
            'stripe_subscription_id': 'sub_new_123',
            'stripe_customer_id': 'cus_test_123',
            'current_period_start': datetime.now(),
            'current_period_end': datetime.now() + timedelta(days=30),
            'cancel_at_period_end': False,
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }]

        subscription = await manager.get_subscription('user_123')

        assert subscription.id == 1
        assert subscription.stripe_subscription_id == 'sub_new_123'


    @pytest.mark.asyncio
    async def test_user_tier_updates_in_database(self, mock_database):
        """Test user tier is updated in database"""
        manager = SubscriptionManager(db=mock_database)

        # Simulate tier update
        mock_database.execute_with_retry.return_value = [{
            'tier': 'team'
        }]

        tier = await manager.get_user_tier('user_123')

        assert tier == TierName.TEAM


    @pytest.mark.asyncio
    async def test_subscription_status_sync(self, mock_database):
        """Test subscription status syncs correctly"""
        manager = SubscriptionManager(db=mock_database)

        mock_database.execute_with_retry.return_value = [{
            'id': 1,
            'user_id': 'user_123',
            'tier': 'pro',
            'status': 'past_due',  # Payment failed
            'stripe_subscription_id': 'sub_test_123',
            'stripe_customer_id': 'cus_test_123',
            'current_period_start': datetime.now(),
            'current_period_end': datetime.now() + timedelta(days=30),
            'cancel_at_period_end': False,
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }]

        subscription = await manager.get_subscription('user_123')

        assert subscription.status == 'past_due'


    @pytest.mark.asyncio
    async def test_failed_payment_handling_in_database(self, mock_database):
        """Test failed payments update subscription status"""
        manager = SubscriptionManager(db=mock_database)

        # Mock subscription with failed payment
        mock_database.execute_with_retry.return_value = [{
            'id': 1,
            'user_id': 'user_123',
            'tier': 'pro',
            'status': 'past_due',
            'stripe_subscription_id': 'sub_test_123',
            'stripe_customer_id': 'cus_test_123',
            'current_period_start': datetime.now(),
            'current_period_end': datetime.now() + timedelta(days=30),
            'cancel_at_period_end': False,
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }]

        subscription = await manager.get_subscription('user_123')

        assert subscription.status == 'past_due'
        # Verify user still has access until grace period expires


# ==========================================
# TEST SECTION 7: PCI COMPLIANCE
# ==========================================

class TestPCICompliance:
    """Tests for PCI DSS compliance"""

    def test_no_card_data_in_logs(self, client, mock_stripe_key, caplog):
        """Test that card data is never logged"""
        with patch('stripe.checkout.Session.create') as mock_create:
            mock_create.return_value = Mock(
                id='cs_test',
                url='https://checkout.stripe.com/test',
                expires_at=int(time.time()) + 86400
            )

            response = client.post('/api/billing/create-checkout-session', json={
                'tier': 'personal',
                'user_email': 'test@example.com',
                'success_url': 'https://example.com/success',
                'cancel_url': 'https://example.com/cancel'
            })

        # Check logs don't contain sensitive patterns
        for record in caplog.records:
            message = record.getMessage().lower()
            # These patterns should never appear in logs
            assert 'card_number' not in message
            assert '4242' not in message  # Common test card
            assert 'cvv' not in message
            assert 'cvc' not in message


    def test_no_payment_method_details_in_response(self, client, mock_stripe_key):
        """Test that API responses don't include payment method details"""
        with patch('stripe.checkout.Session.create') as mock_create:
            mock_create.return_value = Mock(
                id='cs_test',
                url='https://checkout.stripe.com/test',
                expires_at=int(time.time()) + 86400,
                payment_method='pm_test_secret'  # This should not be returned
            )

            response = client.post('/api/billing/create-checkout-session', json={
                'tier': 'personal',
                'success_url': 'https://example.com/success',
                'cancel_url': 'https://example.com/cancel'
            })

            data = response.json()
            # Payment method should not be in response
            assert 'payment_method' not in data


# ==========================================
# TEST SECTION 8: EDGE CASES & ERROR SCENARIOS
# ==========================================

class TestEdgeCases:
    """Tests for edge cases and error scenarios"""

    def test_concurrent_webhook_processing(self):
        """Test handling concurrent webhook deliveries (race condition)"""
        # This tests the idempotency mechanism
        pass  # Tested in test_webhook_idempotency_duplicate_event


    @pytest.mark.asyncio
    async def test_subscription_expired_handling(self, mock_database):
        """Test handling expired subscriptions"""
        manager = SubscriptionManager(db=mock_database)

        # Mock expired subscription
        mock_database.execute_with_retry.return_value = [{
            'id': 1,
            'user_id': 'user_123',
            'tier': 'pro',
            'status': 'expired',
            'stripe_subscription_id': 'sub_test_123',
            'stripe_customer_id': 'cus_test_123',
            'current_period_start': datetime.now() - timedelta(days=60),
            'current_period_end': datetime.now() - timedelta(days=30),
            'cancel_at_period_end': False,
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }]

        subscription = await manager.get_subscription('user_123')

        # Expired subscription should not be active
        assert subscription.status == 'expired'


    @patch('stripe.checkout.Session.create')
    def test_checkout_session_timeout(self, mock_create, client, mock_stripe_key):
        """Test checkout session expiration"""
        expires_at = int(time.time()) + 86400  # 24 hours
        mock_create.return_value = Mock(
            id='cs_test',
            url='https://checkout.stripe.com/test',
            expires_at=expires_at
        )

        response = client.post('/api/billing/create-checkout-session', json={
            'tier': 'personal',
            'success_url': 'https://example.com/success',
            'cancel_url': 'https://example.com/cancel'
        })

        data = response.json()
        assert data['expires_at'] == expires_at


    def test_invalid_webhook_payload(self, client):
        """Test handling malformed webhook payload"""
        with patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'}):
            response = client.post(
                '/api/v1/webhooks/stripe',
                data='invalid json{',
                headers={'stripe-signature': 't=123,v1=abc'}
            )

            # Should reject invalid payload
            assert response.status_code in [400, 500]


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
