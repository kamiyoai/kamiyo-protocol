# -*- coding: utf-8 -*-
"""
Stripe Client Tests
Comprehensive tests for Stripe API wrapper functionality
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import stripe

from api.payments.stripe_client import StripeClient, get_stripe_client
from tests.payments.fixtures import (
    mock_stripe_customer,
    mock_stripe_subscription,
    mock_stripe_payment_method,
    mock_db,
    test_user,
    test_customer,
    test_subscription
)


# ==========================================
# INITIALIZATION TESTS
# ==========================================

class TestStripeClientInitialization:
    """Test Stripe client initialization"""

    @patch('api.payments.stripe_client.get_stripe_config')
    @patch('api.payments.stripe_client.get_db')
    @patch('api.payments.stripe_client.get_alert_manager')
    def test_init_success(self, mock_alert_mgr, mock_get_db, mock_config):
        """Test successful client initialization"""
        # Arrange
        config = Mock()
        config.secret_key = 'sk_test_123'
        config.api_version = '2023-10-16'
        mock_config.return_value = config

        # Act
        client = StripeClient()

        # Assert
        assert client.config == config
        assert client.db is not None
        assert client.alert_manager is not None

    @patch('api.payments.stripe_client.get_stripe_config')
    def test_init_missing_api_key(self, mock_config):
        """Test initialization fails without API key"""
        # Arrange
        config = Mock()
        config.secret_key = None
        mock_config.return_value = config

        # Act & Assert
        with pytest.raises(ValueError, match="STRIPE_SECRET_KEY"):
            StripeClient()

    def test_singleton_pattern(self):
        """Test get_stripe_client returns singleton"""
        # Act
        with patch('api.payments.stripe_client.StripeClient'):
            client1 = get_stripe_client()
            client2 = get_stripe_client()

        # Assert
        assert client1 is client2


# ==========================================
# CUSTOMER OPERATIONS TESTS
# ==========================================

class TestCustomerOperations:
    """Test customer CRUD operations"""

    @pytest.fixture
    def stripe_client(self, mock_db):
        """Create Stripe client with mocked dependencies"""
        with patch('api.payments.stripe_client.get_stripe_config') as mock_config:
            config = Mock()
            config.secret_key = 'sk_test_123'
            config.api_version = '2023-10-16'
            mock_config.return_value = config

            with patch('api.payments.stripe_client.get_db', return_value=mock_db):
                with patch('api.payments.stripe_client.get_alert_manager'):
                    client = StripeClient()
                    client.db = mock_db
                    return client

    @pytest.mark.asyncio
    @patch('stripe.Customer.create')
    async def test_create_customer_success(
        self,
        mock_stripe_create,
        stripe_client,
        mock_stripe_customer,
        test_user
    ):
        """Test successful customer creation"""
        # Arrange
        mock_stripe_create.return_value = mock_stripe_customer
        stripe_client.db.execute_with_retry.return_value = [{
            'id': 1,
            'stripe_customer_id': mock_stripe_customer.id,
            'user_id': test_user['id'],
            'email': test_user['email'],
            'name': test_user['name'],
            'metadata': {},
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }]

        # Act
        result = await stripe_client.create_customer(
            user_id=test_user['id'],
            email=test_user['email'],
            name=test_user['name']
        )

        # Assert
        assert result is not None
        assert result['stripe_customer_id'] == mock_stripe_customer.id
        assert result['email'] == test_user['email']
        mock_stripe_create.assert_called_once()
        stripe_client.db.execute_with_retry.assert_called()

    @pytest.mark.asyncio
    @patch('stripe.Customer.create')
    async def test_create_customer_stripe_error(
        self,
        mock_stripe_create,
        stripe_client,
        test_user
    ):
        """Test customer creation with Stripe API error"""
        # Arrange
        mock_stripe_create.side_effect = stripe.error.InvalidRequestError(
            message="Invalid email",
            param="email"
        )

        # Act & Assert
        with pytest.raises(stripe.error.InvalidRequestError):
            await stripe_client.create_customer(
                user_id=test_user['id'],
                email="invalid-email",
                name=test_user['name']
            )

    @pytest.mark.asyncio
    async def test_create_customer_db_error(
        self,
        stripe_client,
        mock_stripe_customer,
        test_user
    ):
        """Test customer creation with database error"""
        # Arrange
        with patch('stripe.Customer.create', return_value=mock_stripe_customer):
            stripe_client.db.execute_with_retry.return_value = None

            # Act & Assert
            with pytest.raises(Exception, match="Failed to store customer"):
                await stripe_client.create_customer(
                    user_id=test_user['id'],
                    email=test_user['email'],
                    name=test_user['name']
                )

    @pytest.mark.asyncio
    async def test_get_customer_success(
        self,
        stripe_client,
        test_customer
    ):
        """Test successful customer retrieval"""
        # Arrange
        stripe_client.db.execute_with_retry.return_value = [test_customer]

        # Act
        result = await stripe_client.get_customer(test_customer['id'])

        # Assert
        assert result is not None
        assert result['id'] == test_customer['id']
        assert result['email'] == test_customer['email']

    @pytest.mark.asyncio
    async def test_get_customer_not_found(self, stripe_client):
        """Test customer retrieval when not found"""
        # Arrange
        stripe_client.db.execute_with_retry.return_value = []

        # Act
        result = await stripe_client.get_customer(999)

        # Assert
        assert result is None

    @pytest.mark.asyncio
    async def test_get_customer_by_stripe_id_success(
        self,
        stripe_client,
        test_customer
    ):
        """Test customer retrieval by Stripe ID"""
        # Arrange
        stripe_client.db.execute_with_retry.return_value = [test_customer]

        # Act
        result = await stripe_client.get_customer_by_stripe_id(
            test_customer['stripe_customer_id']
        )

        # Assert
        assert result is not None
        assert result['stripe_customer_id'] == test_customer['stripe_customer_id']

    @pytest.mark.asyncio
    @patch('stripe.Customer.modify')
    async def test_update_customer_success(
        self,
        mock_stripe_modify,
        stripe_client,
        test_customer
    ):
        """Test successful customer update"""
        # Arrange
        stripe_client.db.execute_with_retry.side_effect = [
            [test_customer],  # get_customer
            [{**test_customer, 'email': 'newemail@kamiyo.io'}]  # update
        ]

        # Act
        result = await stripe_client.update_customer(
            customer_id=test_customer['id'],
            email='newemail@kamiyo.io'
        )

        # Assert
        assert result is not None
        assert result['email'] == 'newemail@kamiyo.io'
        mock_stripe_modify.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_customer_not_found(self, stripe_client):
        """Test update non-existent customer"""
        # Arrange
        stripe_client.db.execute_with_retry.return_value = []

        # Act & Assert
        with pytest.raises(ValueError, match="not found"):
            await stripe_client.update_customer(
                customer_id=999,
                email='newemail@kamiyo.io'
            )

    @pytest.mark.asyncio
    @patch('stripe.Customer.delete')
    async def test_delete_customer_success(
        self,
        mock_stripe_delete,
        stripe_client,
        test_customer
    ):
        """Test successful customer deletion"""
        # Arrange
        stripe_client.db.execute_with_retry.side_effect = [
            [test_customer],  # get_customer
            None  # delete
        ]

        # Act
        result = await stripe_client.delete_customer(test_customer['id'])

        # Assert
        assert result is True
        mock_stripe_delete.assert_called_once_with(test_customer['stripe_customer_id'])


# ==========================================
# SUBSCRIPTION OPERATIONS TESTS
# ==========================================

class TestSubscriptionOperations:
    """Test subscription CRUD operations"""

    @pytest.fixture
    def stripe_client(self, mock_db):
        """Create Stripe client with mocked dependencies"""
        with patch('api.payments.stripe_client.get_stripe_config') as mock_config:
            config = Mock()
            config.secret_key = 'sk_test_123'
            config.api_version = '2023-10-16'
            config.get_plan_config = Mock(return_value={'price': 1900})
            mock_config.return_value = config

            with patch('api.payments.stripe_client.get_db', return_value=mock_db):
                with patch('api.payments.stripe_client.get_alert_manager'):
                    client = StripeClient()
                    client.db = mock_db
                    return client

    @pytest.mark.asyncio
    @patch('stripe.Subscription.create')
    async def test_create_subscription_success(
        self,
        mock_stripe_create,
        stripe_client,
        mock_stripe_subscription,
        test_customer,
        test_subscription
    ):
        """Test successful subscription creation"""
        # Arrange
        mock_stripe_create.return_value = mock_stripe_subscription
        stripe_client.db.execute_with_retry.side_effect = [
            [test_customer],  # get_customer
            [test_subscription]  # insert subscription
        ]

        # Act
        result = await stripe_client.create_subscription(
            customer_id=test_customer['id'],
            price_id='price_test123',
            tier='basic'
        )

        # Assert
        assert result is not None
        assert result['stripe_subscription_id'] == mock_stripe_subscription.id
        assert result['tier'] == 'basic'
        mock_stripe_create.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_subscription_customer_not_found(
        self,
        stripe_client
    ):
        """Test subscription creation with non-existent customer"""
        # Arrange
        stripe_client.db.execute_with_retry.return_value = []

        # Act & Assert
        with pytest.raises(ValueError, match="Customer .* not found"):
            await stripe_client.create_subscription(
                customer_id=999,
                price_id='price_test123',
                tier='basic'
            )

    @pytest.mark.asyncio
    @patch('stripe.Subscription.create')
    async def test_create_subscription_stripe_error(
        self,
        mock_stripe_create,
        stripe_client,
        test_customer
    ):
        """Test subscription creation with Stripe error"""
        # Arrange
        stripe_client.db.execute_with_retry.return_value = [test_customer]
        mock_stripe_create.side_effect = stripe.error.InvalidRequestError(
            message="Invalid price",
            param="price"
        )

        # Act & Assert
        with pytest.raises(stripe.error.InvalidRequestError):
            await stripe_client.create_subscription(
                customer_id=test_customer['id'],
                price_id='invalid_price',
                tier='basic'
            )

    @pytest.mark.asyncio
    async def test_get_subscription_success(
        self,
        stripe_client,
        test_subscription
    ):
        """Test successful subscription retrieval"""
        # Arrange
        stripe_client.db.execute_with_retry.return_value = [test_subscription]

        # Act
        result = await stripe_client.get_subscription(test_subscription['id'])

        # Assert
        assert result is not None
        assert result['id'] == test_subscription['id']
        assert result['tier'] == test_subscription['tier']

    @pytest.mark.asyncio
    @patch('stripe.Subscription.retrieve')
    @patch('stripe.Subscription.modify')
    async def test_update_subscription_success(
        self,
        mock_stripe_modify,
        mock_stripe_retrieve,
        stripe_client,
        mock_stripe_subscription,
        test_subscription
    ):
        """Test successful subscription update"""
        # Arrange
        mock_stripe_retrieve.return_value = mock_stripe_subscription
        mock_stripe_modify.return_value = mock_stripe_subscription

        stripe_client.db.execute_with_retry.side_effect = [
            [test_subscription],  # get_subscription
            [{**test_subscription, 'tier': 'pro'}]  # update
        ]

        # Act
        result = await stripe_client.update_subscription(
            subscription_id=test_subscription['id'],
            tier='pro'
        )

        # Assert
        assert result is not None

    @pytest.mark.asyncio
    @patch('stripe.Subscription.modify')
    async def test_cancel_subscription_at_period_end(
        self,
        mock_stripe_modify,
        stripe_client,
        mock_stripe_subscription,
        test_subscription
    ):
        """Test subscription cancellation at period end"""
        # Arrange
        mock_stripe_modify.return_value = mock_stripe_subscription
        stripe_client.db.execute_with_retry.side_effect = [
            [test_subscription],  # get_subscription
            [{**test_subscription, 'cancel_at_period_end': True}]  # update
        ]

        # Act
        result = await stripe_client.cancel_subscription(
            subscription_id=test_subscription['id'],
            cancel_immediately=False
        )

        # Assert
        assert result is not None
        assert result['cancel_at_period_end'] is True
        mock_stripe_modify.assert_called_once()

    @pytest.mark.asyncio
    @patch('stripe.Subscription.delete')
    async def test_cancel_subscription_immediately(
        self,
        mock_stripe_delete,
        stripe_client,
        mock_stripe_subscription,
        test_subscription
    ):
        """Test immediate subscription cancellation"""
        # Arrange
        mock_stripe_delete.return_value = mock_stripe_subscription
        stripe_client.db.execute_with_retry.side_effect = [
            [test_subscription],  # get_subscription
            [{**test_subscription, 'status': 'canceled'}]  # update
        ]

        # Act
        result = await stripe_client.cancel_subscription(
            subscription_id=test_subscription['id'],
            cancel_immediately=True
        )

        # Assert
        assert result is not None
        mock_stripe_delete.assert_called_once()


# ==========================================
# PAYMENT METHOD TESTS
# ==========================================

class TestPaymentMethodOperations:
    """Test payment method operations"""

    @pytest.fixture
    def stripe_client(self, mock_db):
        """Create Stripe client with mocked dependencies"""
        with patch('api.payments.stripe_client.get_stripe_config') as mock_config:
            config = Mock()
            config.secret_key = 'sk_test_123'
            config.api_version = '2023-10-16'
            mock_config.return_value = config

            with patch('api.payments.stripe_client.get_db', return_value=mock_db):
                with patch('api.payments.stripe_client.get_alert_manager'):
                    client = StripeClient()
                    client.db = mock_db
                    return client

    @pytest.mark.asyncio
    @patch('stripe.PaymentMethod.attach')
    @patch('stripe.Customer.modify')
    @patch('stripe.PaymentMethod.retrieve')
    async def test_attach_payment_method_success(
        self,
        mock_pm_retrieve,
        mock_customer_modify,
        mock_pm_attach,
        stripe_client,
        mock_stripe_payment_method,
        test_customer
    ):
        """Test successful payment method attachment"""
        # Arrange
        mock_pm_retrieve.return_value = mock_stripe_payment_method
        stripe_client.db.execute_with_retry.side_effect = [
            [test_customer],  # get_customer
            [{
                'id': 1,
                'stripe_payment_method_id': mock_stripe_payment_method.id,
                'customer_id': test_customer['id'],
                'type': 'card',
                'card_brand': 'visa',
                'card_last4': '4242',
                'card_exp_month': 12,
                'card_exp_year': 2025,
                'is_default': True,
                'created_at': datetime.utcnow()
            }]  # insert payment method
        ]

        # Act
        result = await stripe_client.attach_payment_method(
            customer_id=test_customer['id'],
            payment_method_id=mock_stripe_payment_method.id
        )

        # Assert
        assert result is not None
        assert result['stripe_payment_method_id'] == mock_stripe_payment_method.id
        assert result['is_default'] is True
        mock_pm_attach.assert_called_once()
        mock_customer_modify.assert_called_once()

    @pytest.mark.asyncio
    async def test_attach_payment_method_customer_not_found(
        self,
        stripe_client
    ):
        """Test payment method attachment with non-existent customer"""
        # Arrange
        stripe_client.db.execute_with_retry.return_value = []

        # Act & Assert
        with pytest.raises(ValueError, match="Customer .* not found"):
            await stripe_client.attach_payment_method(
                customer_id=999,
                payment_method_id='pm_test123'
            )


# ==========================================
# ERROR HANDLING TESTS
# ==========================================

class TestErrorHandling:
    """Test error handling and retry logic"""

    @pytest.fixture
    def stripe_client(self, mock_db):
        """Create Stripe client with mocked dependencies"""
        with patch('api.payments.stripe_client.get_stripe_config') as mock_config:
            config = Mock()
            config.secret_key = 'sk_test_123'
            config.api_version = '2023-10-16'
            mock_config.return_value = config

            with patch('api.payments.stripe_client.get_db', return_value=mock_db):
                with patch('api.payments.stripe_client.get_alert_manager'):
                    client = StripeClient()
                    client.db = mock_db
                    return client

    @pytest.mark.asyncio
    @patch('stripe.Customer.create')
    async def test_network_error_handling(
        self,
        mock_stripe_create,
        stripe_client,
        test_user
    ):
        """Test handling of network errors"""
        # Arrange
        mock_stripe_create.side_effect = stripe.error.APIConnectionError(
            "Network error"
        )

        # Act & Assert
        with pytest.raises(stripe.error.APIConnectionError):
            await stripe_client.create_customer(
                user_id=test_user['id'],
                email=test_user['email']
            )

    @pytest.mark.asyncio
    @patch('stripe.Customer.create')
    async def test_rate_limit_error_handling(
        self,
        mock_stripe_create,
        stripe_client,
        test_user
    ):
        """Test handling of rate limit errors"""
        # Arrange
        mock_stripe_create.side_effect = stripe.error.RateLimitError(
            "Rate limit exceeded"
        )

        # Act & Assert
        with pytest.raises(stripe.error.RateLimitError):
            await stripe_client.create_customer(
                user_id=test_user['id'],
                email=test_user['email']
            )

    @pytest.mark.asyncio
    @patch('stripe.Customer.create')
    async def test_authentication_error_handling(
        self,
        mock_stripe_create,
        stripe_client,
        test_user
    ):
        """Test handling of authentication errors"""
        # Arrange
        mock_stripe_create.side_effect = stripe.error.AuthenticationError(
            "Invalid API key"
        )

        # Act & Assert
        with pytest.raises(stripe.error.AuthenticationError):
            await stripe_client.create_customer(
                user_id=test_user['id'],
                email=test_user['email']
            )


# ==========================================
# METRICS TESTS
# ==========================================

class TestMetricsTracking:
    """Test metrics tracking for Stripe operations"""

    @pytest.fixture
    def stripe_client(self, mock_db):
        """Create Stripe client with mocked dependencies"""
        with patch('api.payments.stripe_client.get_stripe_config') as mock_config:
            config = Mock()
            config.secret_key = 'sk_test_123'
            config.api_version = '2023-10-16'
            config.get_plan_config = Mock(return_value={'price': 1900})
            mock_config.return_value = config

            with patch('api.payments.stripe_client.get_db', return_value=mock_db):
                with patch('api.payments.stripe_client.get_alert_manager'):
                    client = StripeClient()
                    client.db = mock_db
                    return client

    @pytest.mark.asyncio
    @patch('api.payments.stripe_client.subscriptions_total')
    @patch('api.payments.stripe_client.revenue_total')
    @patch('stripe.Subscription.create')
    async def test_subscription_metrics_tracked(
        self,
        mock_stripe_create,
        mock_revenue,
        mock_subs,
        stripe_client,
        mock_stripe_subscription,
        test_customer,
        test_subscription
    ):
        """Test that subscription metrics are tracked"""
        # Arrange
        mock_stripe_create.return_value = mock_stripe_subscription
        stripe_client.db.execute_with_retry.side_effect = [
            [test_customer],
            [test_subscription]
        ]

        # Act
        await stripe_client.create_subscription(
            customer_id=test_customer['id'],
            price_id='price_test123',
            tier='basic'
        )

        # Assert
        assert mock_subs.labels.called
        assert mock_revenue.labels.called
