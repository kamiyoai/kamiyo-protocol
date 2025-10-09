# -*- coding: utf-8 -*-
"""
Payment Test Fixtures
Reusable test data and mock objects for payment system tests
"""

import pytest
import time
from datetime import datetime, timedelta
from typing import Dict, Any
from unittest.mock import Mock, MagicMock
import fakeredis
import stripe


# ==========================================
# PYTEST FIXTURES
# ==========================================

@pytest.fixture
def redis_client():
    """Provide fake Redis client for testing"""
    return fakeredis.FakeStrictRedis(decode_responses=True)


@pytest.fixture
def mock_db():
    """Provide mock database connection"""
    db = Mock()
    db.execute_with_retry = Mock(return_value=[])
    return db


@pytest.fixture
def mock_stripe_customer():
    """Mock Stripe customer object"""
    return create_mock_stripe_customer()


@pytest.fixture
def mock_stripe_subscription():
    """Mock Stripe subscription object"""
    return create_mock_stripe_subscription()


@pytest.fixture
def mock_stripe_invoice():
    """Mock Stripe invoice object"""
    return create_mock_stripe_invoice()


@pytest.fixture
def mock_stripe_payment_method():
    """Mock Stripe payment method object"""
    return create_mock_stripe_payment_method()


@pytest.fixture
def test_user():
    """Provide test user data"""
    return {
        'id': 1,
        'email': 'test@kamiyo.io',
        'name': 'Test User',
        'created_at': datetime.utcnow()
    }


@pytest.fixture
def test_customer():
    """Provide test customer data"""
    return {
        'id': 1,
        'stripe_customer_id': 'cus_test123',
        'user_id': 1,
        'email': 'test@kamiyo.io',
        'name': 'Test User',
        'metadata': {'platform': 'kamiyo'},
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }


@pytest.fixture
def test_subscription():
    """Provide test subscription data"""
    now = datetime.utcnow()
    return {
        'id': 1,
        'stripe_subscription_id': 'sub_test123',
        'customer_id': 1,
        'status': 'active',
        'tier': 'basic',
        'current_period_start': now,
        'current_period_end': now + timedelta(days=30),
        'cancel_at_period_end': False,
        'metadata': {},
        'created_at': now,
        'updated_at': now
    }


@pytest.fixture
def free_tier_subscription():
    """Test subscription for FREE tier"""
    now = datetime.utcnow()
    return {
        'id': 1,
        'user_id': 'test_user_1',
        'tier': 'free',
        'status': 'active',
        'current_period_start': now,
        'current_period_end': now + timedelta(days=365),
        'cancel_at_period_end': False,
        'created_at': now,
        'updated_at': now
    }


@pytest.fixture
def basic_tier_subscription():
    """Test subscription for BASIC tier"""
    now = datetime.utcnow()
    return {
        'id': 2,
        'user_id': 'test_user_2',
        'tier': 'basic',
        'status': 'active',
        'stripe_subscription_id': 'sub_basic123',
        'stripe_customer_id': 'cus_basic123',
        'current_period_start': now,
        'current_period_end': now + timedelta(days=30),
        'cancel_at_period_end': False,
        'created_at': now,
        'updated_at': now
    }


@pytest.fixture
def pro_tier_subscription():
    """Test subscription for PRO tier"""
    now = datetime.utcnow()
    return {
        'id': 3,
        'user_id': 'test_user_3',
        'tier': 'pro',
        'status': 'active',
        'stripe_subscription_id': 'sub_pro123',
        'stripe_customer_id': 'cus_pro123',
        'current_period_start': now,
        'current_period_end': now + timedelta(days=30),
        'cancel_at_period_end': False,
        'created_at': now,
        'updated_at': now
    }


@pytest.fixture
def enterprise_tier_subscription():
    """Test subscription for ENTERPRISE tier"""
    now = datetime.utcnow()
    return {
        'id': 4,
        'user_id': 'test_user_4',
        'tier': 'enterprise',
        'status': 'active',
        'stripe_subscription_id': 'sub_ent123',
        'stripe_customer_id': 'cus_ent123',
        'current_period_start': now,
        'current_period_end': now + timedelta(days=30),
        'cancel_at_period_end': False,
        'created_at': now,
        'updated_at': now
    }


# ==========================================
# MOCK STRIPE OBJECTS
# ==========================================

def create_mock_stripe_customer(
    customer_id: str = "cus_test123",
    email: str = "test@kamiyo.io",
    name: str = "Test User"
) -> Mock:
    """
    Create a mock Stripe Customer object

    Args:
        customer_id: Stripe customer ID
        email: Customer email
        name: Customer name

    Returns:
        Mock Stripe Customer object
    """
    customer = Mock(spec=stripe.Customer)
    customer.id = customer_id
    customer.email = email
    customer.name = name
    customer.metadata = {'platform': 'kamiyo', 'user_id': '1'}
    customer.created = int(time.time())
    customer.invoice_settings = Mock()
    customer.invoice_settings.default_payment_method = None
    return customer


def create_mock_stripe_subscription(
    subscription_id: str = "sub_test123",
    customer_id: str = "cus_test123",
    status: str = "active",
    tier: str = "basic"
) -> Mock:
    """
    Create a mock Stripe Subscription object

    Args:
        subscription_id: Stripe subscription ID
        customer_id: Stripe customer ID
        status: Subscription status
        tier: Subscription tier

    Returns:
        Mock Stripe Subscription object
    """
    subscription = Mock(spec=stripe.Subscription)
    subscription.id = subscription_id
    subscription.customer = customer_id
    subscription.status = status
    subscription.metadata = {'tier': tier}

    current_time = int(time.time())
    subscription.current_period_start = current_time
    subscription.current_period_end = current_time + (30 * 24 * 60 * 60)
    subscription.cancel_at_period_end = False
    subscription.canceled_at = None
    subscription.created = current_time

    # Mock subscription items
    item = Mock()
    item.id = "si_test123"
    item.price = Mock()
    item.price.id = "price_test123"
    subscription.items = Mock()
    subscription.items.data = [item]

    return subscription


def create_mock_stripe_invoice(
    invoice_id: str = "in_test123",
    customer_id: str = "cus_test123",
    amount: int = 1900,
    status: str = "paid"
) -> Mock:
    """
    Create a mock Stripe Invoice object

    Args:
        invoice_id: Stripe invoice ID
        customer_id: Stripe customer ID
        amount: Amount in cents
        status: Invoice status

    Returns:
        Mock Stripe Invoice object
    """
    invoice = Mock(spec=stripe.Invoice)
    invoice.id = invoice_id
    invoice.customer = customer_id
    invoice.number = f"INV-{int(time.time())}"
    invoice.amount_due = amount
    invoice.amount_paid = amount if status == "paid" else 0
    invoice.currency = "usd"
    invoice.status = status

    current_time = int(time.time())
    invoice.created = current_time
    invoice.due_date = current_time + (7 * 24 * 60 * 60)
    invoice.period_start = current_time
    invoice.period_end = current_time + (30 * 24 * 60 * 60)
    invoice.next_payment_attempt = None if status == "paid" else current_time + (24 * 60 * 60)

    invoice.hosted_invoice_url = f"https://invoice.stripe.com/i/{invoice_id}"
    invoice.invoice_pdf = f"https://invoice.stripe.com/i/{invoice_id}/pdf"

    # Mock line items
    line = Mock()
    line.description = "Kamiyo Basic Plan"
    line.amount = amount
    line.currency = "usd"
    line.period = Mock()
    line.period.start = invoice.period_start
    line.period.end = invoice.period_end

    invoice.lines = Mock()
    invoice.lines.data = [line]

    return invoice


def create_mock_stripe_payment_method(
    pm_id: str = "pm_test123",
    type: str = "card",
    brand: str = "visa",
    last4: str = "4242"
) -> Mock:
    """
    Create a mock Stripe PaymentMethod object

    Args:
        pm_id: Payment method ID
        type: Payment method type
        brand: Card brand
        last4: Last 4 digits

    Returns:
        Mock Stripe PaymentMethod object
    """
    pm = Mock(spec=stripe.PaymentMethod)
    pm.id = pm_id
    pm.type = type
    pm.created = int(time.time())

    if type == "card":
        pm.card = Mock()
        pm.card.brand = brand
        pm.card.last4 = last4
        pm.card.exp_month = 12
        pm.card.exp_year = 2025
        pm.card.fingerprint = "fp_test123"

    return pm


def create_mock_stripe_payment_intent(
    pi_id: str = "pi_test123",
    amount: int = 1900,
    status: str = "succeeded"
) -> Mock:
    """
    Create a mock Stripe PaymentIntent object

    Args:
        pi_id: Payment intent ID
        amount: Amount in cents
        status: Payment intent status

    Returns:
        Mock Stripe PaymentIntent object
    """
    pi = Mock(spec=stripe.PaymentIntent)
    pi.id = pi_id
    pi.amount = amount
    pi.currency = "usd"
    pi.status = status
    pi.created = int(time.time())
    pi.payment_method = "pm_test123"
    return pi


# ==========================================
# WEBHOOK EVENT FIXTURES
# ==========================================

def create_webhook_event(
    event_type: str,
    data_object: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Create a mock Stripe webhook event

    Args:
        event_type: Event type (e.g., "customer.created")
        data_object: Event data object

    Returns:
        Mock webhook event dict
    """
    return {
        'id': f"evt_{int(time.time())}",
        'type': event_type,
        'created': int(time.time()),
        'data': {
            'object': data_object
        },
        'livemode': False,
        'pending_webhooks': 0,
        'request': {
            'id': f"req_{int(time.time())}",
            'idempotency_key': None
        }
    }


@pytest.fixture
def webhook_customer_created():
    """Mock customer.created webhook event"""
    customer = create_mock_stripe_customer()
    return create_webhook_event('customer.created', customer.__dict__)


@pytest.fixture
def webhook_subscription_created():
    """Mock customer.subscription.created webhook event"""
    subscription = create_mock_stripe_subscription()
    return create_webhook_event('customer.subscription.created', subscription.__dict__)


@pytest.fixture
def webhook_subscription_updated():
    """Mock customer.subscription.updated webhook event"""
    subscription = create_mock_stripe_subscription(status="active")
    return create_webhook_event('customer.subscription.updated', subscription.__dict__)


@pytest.fixture
def webhook_subscription_deleted():
    """Mock customer.subscription.deleted webhook event"""
    subscription = create_mock_stripe_subscription(status="canceled")
    return create_webhook_event('customer.subscription.deleted', subscription.__dict__)


@pytest.fixture
def webhook_payment_succeeded():
    """Mock invoice.payment_succeeded webhook event"""
    invoice = create_mock_stripe_invoice(status="paid")
    return create_webhook_event('invoice.payment_succeeded', invoice.__dict__)


@pytest.fixture
def webhook_payment_failed():
    """Mock invoice.payment_failed webhook event"""
    invoice = create_mock_stripe_invoice(status="open", amount=1900)
    invoice.amount_paid = 0
    invoice.next_payment_attempt = int(time.time()) + (24 * 60 * 60)
    return create_webhook_event('invoice.payment_failed', invoice.__dict__)


@pytest.fixture
def webhook_payment_method_attached():
    """Mock payment_method.attached webhook event"""
    pm = create_mock_stripe_payment_method()
    return create_webhook_event('payment_method.attached', pm.__dict__)


# ==========================================
# DATABASE MOCK HELPERS
# ==========================================

def mock_db_execute_success(return_value):
    """Create a mock database that returns success"""
    db = Mock()
    db.execute_with_retry = Mock(return_value=[return_value] if return_value else [])
    return db


def mock_db_execute_failure(exception):
    """Create a mock database that raises an exception"""
    db = Mock()
    db.execute_with_retry = Mock(side_effect=exception)
    return db


def mock_db_execute_empty():
    """Create a mock database that returns no results"""
    db = Mock()
    db.execute_with_retry = Mock(return_value=[])
    return db


# ==========================================
# STRIPE API MOCK HELPERS
# ==========================================

def mock_stripe_api_success(return_value):
    """Mock successful Stripe API call"""
    return Mock(return_value=return_value)


def mock_stripe_api_failure(error_type, message):
    """Mock failed Stripe API call"""
    def raise_error(*args, **kwargs):
        raise error_type(message)
    return Mock(side_effect=raise_error)


# ==========================================
# ASSERTION HELPERS
# ==========================================

def assert_customer_fields(customer: Dict[str, Any]):
    """Assert customer has all required fields"""
    required_fields = ['id', 'stripe_customer_id', 'user_id', 'email']
    for field in required_fields:
        assert field in customer, f"Customer missing field: {field}"


def assert_subscription_fields(subscription: Dict[str, Any]):
    """Assert subscription has all required fields"""
    required_fields = [
        'id', 'stripe_subscription_id', 'customer_id',
        'status', 'tier', 'current_period_start', 'current_period_end'
    ]
    for field in required_fields:
        assert field in subscription, f"Subscription missing field: {field}"


def assert_invoice_fields(invoice: Dict[str, Any]):
    """Assert invoice has all required fields"""
    required_fields = [
        'id', 'amount_due', 'amount_paid', 'currency', 'status'
    ]
    for field in required_fields:
        assert field in invoice, f"Invoice missing field: {field}"
