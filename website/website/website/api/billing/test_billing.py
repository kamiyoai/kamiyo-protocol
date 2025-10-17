# -*- coding: utf-8 -*-
"""
Billing API Integration Tests
Tests for billing dashboard endpoints
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime
import json

# Test fixtures
@pytest.fixture
def test_user():
    """Create a test user"""
    return {
        'id': 'test_user_123',
        'email': 'test@kamiyo.io',
        'stripe_customer_id': 'cus_test123'
    }


@pytest.fixture
def mock_stripe_session():
    """Mock Stripe portal session"""
    return {
        'id': 'bps_test123',
        'url': 'https://billing.stripe.com/session/test123',
        'customer': 'cus_test123',
        'expires_at': int(datetime.now().timestamp()) + 3600,
        'return_url': 'http://localhost:3000/billing'
    }


@pytest.fixture
def mock_invoices():
    """Mock invoice list"""
    return {
        'invoices': [
            {
                'id': 'in_test1',
                'number': 'INV-001',
                'amount_due': 9900,
                'amount_paid': 9900,
                'currency': 'usd',
                'status': 'paid',
                'created': int(datetime.now().timestamp()),
                'due_date': None,
                'period_start': int(datetime.now().timestamp()),
                'period_end': int(datetime.now().timestamp()) + 2592000,
                'hosted_invoice_url': 'https://invoice.stripe.com/i/test1',
                'invoice_pdf': 'https://invoice.stripe.com/i/test1/pdf'
            }
        ],
        'has_more': False,
        'total_count': 1
    }


# Tests
class TestBillingPortal:
    """Test Customer Portal endpoints"""

    def test_create_portal_session_success(self, client, test_user, mock_stripe_session, monkeypatch):
        """Test successful portal session creation"""

        # Mock Stripe API call
        def mock_create(*args, **kwargs):
            class MockSession:
                id = mock_stripe_session['id']
                url = mock_stripe_session['url']
                customer = mock_stripe_session['customer']
                expires_at = mock_stripe_session['expires_at']
                return_url = kwargs['return_url']

            return MockSession()

        monkeypatch.setattr('stripe.billing_portal.Session.create', mock_create)

        # Make request
        response = client.post(
            '/api/v1/billing/portal',
            json={'return_url': 'http://localhost:3000/billing'},
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert 'url' in data
        assert 'expires_at' in data
        assert data['url'].startswith('https://billing.stripe.com')

    def test_create_portal_session_missing_return_url(self, client, test_user):
        """Test portal session with missing return URL"""

        response = client.post(
            '/api/v1/billing/portal',
            json={},
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        assert response.status_code == 422  # Validation error

    def test_create_portal_session_no_auth(self, client):
        """Test portal session without authentication"""

        response = client.post(
            '/api/v1/billing/portal',
            json={'return_url': 'http://localhost:3000/billing'}
        )

        assert response.status_code == 401  # Unauthorized


class TestInvoices:
    """Test invoice endpoints"""

    def test_list_invoices_success(self, client, test_user, mock_invoices, monkeypatch):
        """Test successful invoice listing"""

        # Mock Stripe API call
        def mock_list(*args, **kwargs):
            class MockInvoiceList:
                data = [
                    type('obj', (object,), {
                        'id': inv['id'],
                        'number': inv['number'],
                        'amount_due': inv['amount_due'],
                        'amount_paid': inv['amount_paid'],
                        'currency': inv['currency'],
                        'status': inv['status'],
                        'created': inv['created'],
                        'due_date': inv['due_date'],
                        'period_start': inv['period_start'],
                        'period_end': inv['period_end'],
                        'hosted_invoice_url': inv['hosted_invoice_url'],
                        'invoice_pdf': inv['invoice_pdf']
                    })()
                    for inv in mock_invoices['invoices']
                ]
                has_more = mock_invoices['has_more']

            return MockInvoiceList()

        monkeypatch.setattr('stripe.Invoice.list', mock_list)

        # Make request
        response = client.get(
            '/api/v1/billing/invoices',
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert 'invoices' in data
        assert 'has_more' in data
        assert len(data['invoices']) > 0
        assert data['invoices'][0]['status'] == 'paid'

    def test_list_invoices_pagination(self, client, test_user, monkeypatch):
        """Test invoice pagination"""

        def mock_list(*args, **kwargs):
            class MockInvoiceList:
                data = []
                has_more = False

            return MockInvoiceList()

        monkeypatch.setattr('stripe.Invoice.list', mock_list)

        # Make request with pagination params
        response = client.get(
            '/api/v1/billing/invoices?limit=5&starting_after=in_test1',
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        assert response.status_code == 200

    def test_get_invoice_success(self, client, test_user, monkeypatch):
        """Test getting specific invoice"""

        def mock_retrieve(invoice_id):
            return type('obj', (object,), {
                'id': invoice_id,
                'number': 'INV-001',
                'amount_due': 9900,
                'amount_paid': 9900,
                'currency': 'usd',
                'status': 'paid',
                'created': int(datetime.now().timestamp()),
                'due_date': None,
                'period_start': int(datetime.now().timestamp()),
                'period_end': int(datetime.now().timestamp()) + 2592000,
                'hosted_invoice_url': 'https://invoice.stripe.com/i/test1',
                'invoice_pdf': 'https://invoice.stripe.com/i/test1/pdf',
                'customer': 'cus_test123'
            })()

        monkeypatch.setattr('stripe.Invoice.retrieve', mock_retrieve)

        # Make request
        response = client.get(
            '/api/v1/billing/invoices/in_test1',
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data['id'] == 'in_test1'
        assert data['status'] == 'paid'


class TestPaymentMethods:
    """Test payment method endpoints"""

    def test_list_payment_methods_success(self, client, test_user, monkeypatch):
        """Test successful payment method listing"""

        def mock_list(*args, **kwargs):
            class MockPMList:
                data = [
                    type('obj', (object,), {
                        'id': 'pm_test1',
                        'type': 'card',
                        'card': type('obj', (object,), {
                            'brand': 'visa',
                            'last4': '4242',
                            'exp_month': 12,
                            'exp_year': 2025
                        })()
                    })()
                ]

            return MockPMList()

        def mock_retrieve(customer_id):
            return type('obj', (object,), {
                'invoice_settings': type('obj', (object,), {
                    'default_payment_method': 'pm_test1'
                })()
            })()

        monkeypatch.setattr('stripe.PaymentMethod.list', mock_list)
        monkeypatch.setattr('stripe.Customer.retrieve', mock_retrieve)

        # Make request
        response = client.get(
            '/api/v1/billing/payment-methods',
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert 'payment_methods' in data
        assert len(data['payment_methods']) > 0
        assert data['payment_methods'][0]['type'] == 'card'
        assert data['payment_methods'][0]['is_default'] == True

    def test_list_payment_methods_empty(self, client, test_user, monkeypatch):
        """Test listing with no payment methods"""

        def mock_list(*args, **kwargs):
            class MockPMList:
                data = []

            return MockPMList()

        def mock_retrieve(customer_id):
            return type('obj', (object,), {
                'invoice_settings': None
            })()

        monkeypatch.setattr('stripe.PaymentMethod.list', mock_list)
        monkeypatch.setattr('stripe.Customer.retrieve', mock_retrieve)

        response = client.get(
            '/api/v1/billing/payment-methods',
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data['payment_methods']) == 0


class TestUpcomingInvoice:
    """Test upcoming invoice endpoint"""

    def test_get_upcoming_invoice_success(self, client, test_user, monkeypatch):
        """Test successful upcoming invoice retrieval"""

        def mock_upcoming(*args, **kwargs):
            return type('obj', (object,), {
                'amount_due': 9900,
                'currency': 'usd',
                'period_start': int(datetime.now().timestamp()),
                'period_end': int(datetime.now().timestamp()) + 2592000,
                'next_payment_attempt': int(datetime.now().timestamp()) + 86400,
                'lines': type('obj', (object,), {
                    'data': [
                        type('obj', (object,), {
                            'description': 'Pro Plan',
                            'amount': 9900,
                            'currency': 'usd',
                            'period': type('obj', (object,), {
                                'start': int(datetime.now().timestamp()),
                                'end': int(datetime.now().timestamp()) + 2592000
                            })()
                        })()
                    ]
                })()
            })()

        monkeypatch.setattr('stripe.Invoice.upcoming', mock_upcoming)

        # Make request
        response = client.get(
            '/api/v1/billing/upcoming-invoice',
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert 'amount_due' in data
        assert 'lines' in data
        assert data['amount_due'] == 9900
        assert len(data['lines']) > 0

    def test_get_upcoming_invoice_free_tier(self, client, test_user, monkeypatch):
        """Test upcoming invoice for free tier (should return 404)"""

        def mock_upcoming(*args, **kwargs):
            from stripe.error import InvalidRequestError
            raise InvalidRequestError('No upcoming invoice', param=None)

        monkeypatch.setattr('stripe.Invoice.upcoming', mock_upcoming)

        response = client.get(
            '/api/v1/billing/upcoming-invoice',
            headers={'Authorization': f'Bearer {test_user["id"]}'}
        )

        assert response.status_code == 404


# Run tests
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
