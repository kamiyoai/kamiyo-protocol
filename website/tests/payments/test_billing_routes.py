# -*- coding: utf-8 -*-
"""
Billing Routes Tests
Tests for billing API endpoints
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from fastapi import HTTPException
import stripe

from api.billing.routes import (
    create_portal_session,
    list_invoices,
    get_invoice,
    list_payment_methods,
    get_upcoming_invoice
)


class TestPortalSession:
    """Test Customer Portal session creation"""

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    @patch('api.billing.routes.get_portal_manager')
    async def test_create_portal_session_success(self, mock_portal, mock_db):
        """Test successful portal session creation"""
        # Mock database response
        db = Mock()
        db.execute_with_retry = Mock(return_value=[{'stripe_customer_id': 'cus_123'}])
        mock_db.return_value = db

        # Mock portal manager
        portal_mgr = Mock()
        portal_mgr.create_portal_session = Mock(return_value={
            'url': 'https://portal.stripe.com/session',
            'expires_at': 1234567890
        })
        mock_portal.return_value = portal_mgr

        # Mock user
        user = Mock()
        user.id = 1

        # Mock request
        request = Mock()
        request.return_url = 'https://kamiyo.io/billing'

        # Act
        result = await create_portal_session(request, user)

        # Assert
        assert result.url == 'https://portal.stripe.com/session'
        assert result.expires_at == 1234567890

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    async def test_create_portal_session_no_customer(self, mock_db):
        """Test portal session with no customer"""
        db = Mock()
        db.execute_with_retry = Mock(return_value=[])
        mock_db.return_value = db

        user = Mock()
        user.id = 1
        request = Mock()
        request.return_url = 'https://kamiyo.io/billing'

        with pytest.raises(HTTPException) as exc_info:
            await create_portal_session(request, user)
        assert exc_info.value.status_code == 404


class TestInvoices:
    """Test invoice endpoints"""

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    @patch('stripe.Invoice.list')
    async def test_list_invoices_success(self, mock_stripe_list, mock_db):
        """Test successful invoice listing"""
        db = Mock()
        db.execute_with_retry = Mock(return_value=[{'stripe_customer_id': 'cus_123'}])
        mock_db.return_value = db

        # Mock Stripe response
        mock_invoice = Mock()
        mock_invoice.id = 'in_123'
        mock_invoice.number = 'INV-001'
        mock_invoice.amount_due = 1900
        mock_invoice.amount_paid = 1900
        mock_invoice.currency = 'usd'
        mock_invoice.status = 'paid'
        mock_invoice.created = 1234567890
        mock_invoice.due_date = 1234567890
        mock_invoice.period_start = 1234567890
        mock_invoice.period_end = 1234567890
        mock_invoice.hosted_invoice_url = 'https://invoice.stripe.com'
        mock_invoice.invoice_pdf = 'https://invoice.stripe.com/pdf'

        stripe_response = Mock()
        stripe_response.data = [mock_invoice]
        stripe_response.has_more = False
        mock_stripe_list.return_value = stripe_response

        user = Mock()
        user.id = 1

        result = await list_invoices(limit=10, starting_after=None, current_user=user)
        assert len(result.invoices) == 1
        assert result.invoices[0].id == 'in_123'

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    async def test_list_invoices_no_customer(self, mock_db):
        """Test invoice listing with no customer"""
        db = Mock()
        db.execute_with_retry = Mock(return_value=[])
        mock_db.return_value = db

        user = Mock()
        user.id = 1

        result = await list_invoices(limit=10, starting_after=None, current_user=user)
        assert len(result.invoices) == 0
        assert result.total_count == 0

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    @patch('stripe.Invoice.retrieve')
    async def test_get_invoice_success(self, mock_retrieve, mock_db):
        """Test successful invoice retrieval"""
        db = Mock()
        db.execute_with_retry = Mock(return_value=[{'stripe_customer_id': 'cus_123'}])
        mock_db.return_value = db

        mock_invoice = Mock()
        mock_invoice.id = 'in_123'
        mock_invoice.customer = 'cus_123'
        mock_invoice.number = 'INV-001'
        mock_invoice.amount_due = 1900
        mock_invoice.amount_paid = 1900
        mock_invoice.currency = 'usd'
        mock_invoice.status = 'paid'
        mock_invoice.created = 1234567890
        mock_invoice.due_date = 1234567890
        mock_invoice.period_start = 1234567890
        mock_invoice.period_end = 1234567890
        mock_invoice.hosted_invoice_url = 'https://invoice.stripe.com'
        mock_invoice.invoice_pdf = 'https://invoice.stripe.com/pdf'
        mock_retrieve.return_value = mock_invoice

        user = Mock()
        user.id = 1

        result = await get_invoice('in_123', user)
        assert result.id == 'in_123'

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    @patch('stripe.Invoice.retrieve')
    async def test_get_invoice_unauthorized(self, mock_retrieve, mock_db):
        """Test invoice access by wrong user"""
        db = Mock()
        db.execute_with_retry = Mock(return_value=[{'stripe_customer_id': 'cus_123'}])
        mock_db.return_value = db

        mock_invoice = Mock()
        mock_invoice.customer = 'cus_different'
        mock_retrieve.return_value = mock_invoice

        user = Mock()
        user.id = 1

        with pytest.raises(HTTPException) as exc_info:
            await get_invoice('in_123', user)
        assert exc_info.value.status_code == 403


class TestPaymentMethods:
    """Test payment method endpoints"""

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    @patch('stripe.Customer.retrieve')
    @patch('stripe.PaymentMethod.list')
    async def test_list_payment_methods_success(self, mock_pm_list, mock_cust_retrieve, mock_db):
        """Test successful payment method listing"""
        db = Mock()
        db.execute_with_retry = Mock(return_value=[{'stripe_customer_id': 'cus_123'}])
        mock_db.return_value = db

        mock_customer = Mock()
        mock_customer.invoice_settings = Mock()
        mock_customer.invoice_settings.default_payment_method = 'pm_123'
        mock_cust_retrieve.return_value = mock_customer

        mock_pm = Mock()
        mock_pm.id = 'pm_123'
        mock_pm.type = 'card'
        mock_pm.card = Mock()
        mock_pm.card.brand = 'visa'
        mock_pm.card.last4 = '4242'
        mock_pm.card.exp_month = 12
        mock_pm.card.exp_year = 2025

        pm_response = Mock()
        pm_response.data = [mock_pm]
        mock_pm_list.return_value = pm_response

        user = Mock()
        user.id = 1

        result = await list_payment_methods(user)
        assert len(result.payment_methods) == 1
        assert result.payment_methods[0].id == 'pm_123'
        assert result.payment_methods[0].is_default is True


class TestUpcomingInvoice:
    """Test upcoming invoice endpoint"""

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    @patch('stripe.Invoice.upcoming')
    async def test_get_upcoming_invoice_success(self, mock_upcoming, mock_db):
        """Test successful upcoming invoice retrieval"""
        db = Mock()
        db.execute_with_retry = Mock(return_value=[{'stripe_customer_id': 'cus_123'}])
        mock_db.return_value = db

        mock_line = Mock()
        mock_line.description = 'Kamiyo Pro Plan'
        mock_line.amount = 4900
        mock_line.currency = 'usd'
        mock_line.period = Mock()
        mock_line.period.start = 1234567890
        mock_line.period.end = 1234567890

        mock_invoice = Mock()
        mock_invoice.amount_due = 4900
        mock_invoice.currency = 'usd'
        mock_invoice.period_start = 1234567890
        mock_invoice.period_end = 1234567890
        mock_invoice.next_payment_attempt = 1234567890
        mock_invoice.lines = Mock()
        mock_invoice.lines.data = [mock_line]
        mock_upcoming.return_value = mock_invoice

        user = Mock()
        user.id = 1

        result = await get_upcoming_invoice(user)
        assert result.amount_due == 4900
        assert len(result.lines) == 1

    @pytest.mark.asyncio
    @patch('api.billing.routes.get_db')
    @patch('stripe.Invoice.upcoming')
    async def test_get_upcoming_invoice_none(self, mock_upcoming, mock_db):
        """Test upcoming invoice when none exists"""
        db = Mock()
        db.execute_with_retry = Mock(return_value=[{'stripe_customer_id': 'cus_123'}])
        mock_db.return_value = db

        mock_upcoming.side_effect = stripe.error.InvalidRequestError('No upcoming invoice', 'param')

        user = Mock()
        user.id = 1

        with pytest.raises(HTTPException) as exc_info:
            await get_upcoming_invoice(user)
        assert exc_info.value.status_code == 404
