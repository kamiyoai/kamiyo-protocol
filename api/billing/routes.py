# -*- coding: utf-8 -*-
"""
Billing API Routes for Kamiyo
FastAPI endpoints for billing dashboard, invoices, and payment methods
"""

import os
import sys
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
import stripe

from .portal import get_portal_manager
from api.payments.stripe_client import get_stripe_client
from api.subscriptions.manager import get_subscription_manager
from database.postgres_manager import get_db
from monitoring.prometheus_metrics import api_requests_total
from api.auth_helpers import get_current_user, User

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/api/v1/billing",
    tags=["billing"]
)


# ==========================================
# REQUEST/RESPONSE MODELS
# ==========================================

class PortalSessionRequest(BaseModel):
    """Request to create a Customer Portal session"""
    return_url: str = Field(..., description="URL to return to after portal session")


class PortalSessionResponse(BaseModel):
    """Customer Portal session response"""
    url: str = Field(..., description="Portal session URL")
    expires_at: int = Field(..., description="Session expiration timestamp")


class Invoice(BaseModel):
    """Invoice model"""
    id: str = Field(..., description="Invoice ID")
    number: Optional[str] = Field(None, description="Invoice number")
    amount_due: int = Field(..., description="Amount due in cents")
    amount_paid: int = Field(..., description="Amount paid in cents")
    currency: str = Field(..., description="Currency code")
    status: str = Field(..., description="Invoice status")
    created: int = Field(..., description="Creation timestamp")
    due_date: Optional[int] = Field(None, description="Due date timestamp")
    period_start: int = Field(..., description="Billing period start")
    period_end: int = Field(..., description="Billing period end")
    hosted_invoice_url: Optional[str] = Field(None, description="Hosted invoice URL")
    invoice_pdf: Optional[str] = Field(None, description="PDF download URL")


class InvoiceListResponse(BaseModel):
    """Invoice list response"""
    invoices: List[Invoice] = Field(..., description="List of invoices")
    has_more: bool = Field(..., description="Whether there are more invoices")
    total_count: int = Field(..., description="Total invoice count")


class PaymentMethod(BaseModel):
    """Payment method model"""
    id: str = Field(..., description="Payment method ID")
    type: str = Field(..., description="Payment method type")
    card: Optional[Dict[str, Any]] = Field(None, description="Card details")
    is_default: bool = Field(..., description="Whether this is the default payment method")


class PaymentMethodListResponse(BaseModel):
    """Payment method list response"""
    payment_methods: List[PaymentMethod] = Field(..., description="List of payment methods")


class UpcomingInvoiceResponse(BaseModel):
    """Upcoming invoice response"""
    amount_due: int = Field(..., description="Amount due in cents")
    currency: str = Field(..., description="Currency code")
    period_start: int = Field(..., description="Billing period start")
    period_end: int = Field(..., description="Billing period end")
    next_payment_attempt: Optional[int] = Field(None, description="Next payment attempt timestamp")
    lines: List[Dict[str, Any]] = Field(..., description="Invoice line items")


# ==========================================
# ROUTES
# ==========================================

@router.post("/portal", response_model=PortalSessionResponse)
async def create_portal_session(
    request: PortalSessionRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create a Stripe Customer Portal session

    Allows users to:
    - Update payment methods
    - View invoice history
    - Manage subscriptions
    - Update billing information

    The portal session expires after 1 hour.
    """

    try:
        # Get user's Stripe customer ID
        db = get_db()
        query = """
            SELECT stripe_customer_id FROM customers
            WHERE user_id = %s
            LIMIT 1
        """
        result = db.execute_with_retry(query, (current_user.id,), readonly=True)

        if not result or not result[0]['stripe_customer_id']:
            raise HTTPException(
                status_code=404,
                detail="No Stripe customer found for user"
            )

        stripe_customer_id = result[0]['stripe_customer_id']

        # Create portal session
        portal_manager = get_portal_manager()
        session = portal_manager.create_portal_session(
            customer_id=stripe_customer_id,
            return_url=request.return_url
        )

        logger.info(f"Portal session created for user {current_user.id}")

        # Track metrics
        api_requests_total.labels(
            method='POST',
            endpoint='/billing/portal',
            status=200
        ).inc()

        return PortalSessionResponse(
            url=session['url'],
            expires_at=session['expires_at']
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error creating portal session: {e}")
        api_requests_total.labels(
            method='POST',
            endpoint='/billing/portal',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create portal session: {str(e)}"
        )


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    limit: int = Query(10, ge=1, le=100, description="Number of invoices to return"),
    starting_after: Optional[str] = Query(None, description="Pagination cursor"),
    current_user: User = Depends(get_current_user)
):
    """
    List user's invoices

    Returns paginated list of invoices with:
    - Invoice number and amount
    - Payment status
    - Billing period
    - PDF download link
    """

    try:
        # Get user's Stripe customer ID
        db = get_db()
        query = """
            SELECT stripe_customer_id FROM customers
            WHERE user_id = %s
            LIMIT 1
        """
        result = db.execute_with_retry(query, (current_user.id,), readonly=True)

        if not result or not result[0]['stripe_customer_id']:
            # No customer yet - return empty list
            return InvoiceListResponse(
                invoices=[],
                has_more=False,
                total_count=0
            )

        stripe_customer_id = result[0]['stripe_customer_id']

        # Fetch invoices from Stripe
        params = {
            'customer': stripe_customer_id,
            'limit': limit
        }

        if starting_after:
            params['starting_after'] = starting_after

        invoices_list = stripe.Invoice.list(**params)

        # Convert to response model
        invoices = []
        for inv in invoices_list.data:
            invoices.append(Invoice(
                id=inv.id,
                number=inv.number,
                amount_due=inv.amount_due,
                amount_paid=inv.amount_paid,
                currency=inv.currency,
                status=inv.status,
                created=inv.created,
                due_date=inv.due_date,
                period_start=inv.period_start,
                period_end=inv.period_end,
                hosted_invoice_url=inv.hosted_invoice_url,
                invoice_pdf=inv.invoice_pdf
            ))

        logger.info(f"Retrieved {len(invoices)} invoices for user {current_user.id}")

        # Track metrics
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/invoices',
            status=200
        ).inc()

        return InvoiceListResponse(
            invoices=invoices,
            has_more=invoices_list.has_more,
            total_count=len(invoices)
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error listing invoices: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/invoices',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve invoices: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error listing invoices: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/invoices',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve invoices: {str(e)}"
        )


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get invoice details

    Returns detailed information about a specific invoice
    """

    try:
        # Get user's Stripe customer ID
        db = get_db()
        query = """
            SELECT stripe_customer_id FROM customers
            WHERE user_id = %s
            LIMIT 1
        """
        result = db.execute_with_retry(query, (current_user.id,), readonly=True)

        if not result or not result[0]['stripe_customer_id']:
            raise HTTPException(
                status_code=404,
                detail="No Stripe customer found for user"
            )

        stripe_customer_id = result[0]['stripe_customer_id']

        # Fetch invoice from Stripe
        invoice = stripe.Invoice.retrieve(invoice_id)

        # Verify invoice belongs to user
        if invoice.customer != stripe_customer_id:
            raise HTTPException(
                status_code=403,
                detail="Invoice does not belong to user"
            )

        logger.info(f"Retrieved invoice {invoice_id} for user {current_user.id}")

        # Track metrics
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/invoices/:id',
            status=200
        ).inc()

        return Invoice(
            id=invoice.id,
            number=invoice.number,
            amount_due=invoice.amount_due,
            amount_paid=invoice.amount_paid,
            currency=invoice.currency,
            status=invoice.status,
            created=invoice.created,
            due_date=invoice.due_date,
            period_start=invoice.period_start,
            period_end=invoice.period_end,
            hosted_invoice_url=invoice.hosted_invoice_url,
            invoice_pdf=invoice.invoice_pdf
        )

    except HTTPException:
        raise

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error retrieving invoice: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/invoices/:id',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve invoice: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error retrieving invoice: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/invoices/:id',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve invoice: {str(e)}"
        )


@router.get("/payment-methods", response_model=PaymentMethodListResponse)
async def list_payment_methods(
    current_user: User = Depends(get_current_user)
):
    """
    List user's payment methods

    Returns all payment methods attached to the user's account
    """

    try:
        # Get user's Stripe customer ID
        db = get_db()
        query = """
            SELECT stripe_customer_id FROM customers
            WHERE user_id = %s
            LIMIT 1
        """
        result = db.execute_with_retry(query, (current_user.id,), readonly=True)

        if not result or not result[0]['stripe_customer_id']:
            # No customer yet - return empty list
            return PaymentMethodListResponse(payment_methods=[])

        stripe_customer_id = result[0]['stripe_customer_id']

        # Get default payment method
        customer = stripe.Customer.retrieve(stripe_customer_id)
        default_pm = customer.invoice_settings.default_payment_method if customer.invoice_settings else None

        # Fetch payment methods from Stripe
        payment_methods_list = stripe.PaymentMethod.list(
            customer=stripe_customer_id,
            type='card'
        )

        # Convert to response model
        payment_methods = []
        for pm in payment_methods_list.data:
            payment_methods.append(PaymentMethod(
                id=pm.id,
                type=pm.type,
                card={
                    'brand': pm.card.brand,
                    'last4': pm.card.last4,
                    'exp_month': pm.card.exp_month,
                    'exp_year': pm.card.exp_year
                } if pm.type == 'card' else None,
                is_default=(pm.id == default_pm)
            ))

        logger.info(f"Retrieved {len(payment_methods)} payment methods for user {current_user.id}")

        # Track metrics
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/payment-methods',
            status=200
        ).inc()

        return PaymentMethodListResponse(payment_methods=payment_methods)

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error listing payment methods: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/payment-methods',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve payment methods: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error listing payment methods: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/payment-methods',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve payment methods: {str(e)}"
        )


@router.get("/upcoming-invoice", response_model=UpcomingInvoiceResponse)
async def get_upcoming_invoice(
    current_user: User = Depends(get_current_user)
):
    """
    Get upcoming invoice preview

    Shows what the user will be charged on the next billing cycle
    """

    try:
        # Get user's Stripe customer ID
        db = get_db()
        query = """
            SELECT stripe_customer_id FROM customers
            WHERE user_id = %s
            LIMIT 1
        """
        result = db.execute_with_retry(query, (current_user.id,), readonly=True)

        if not result or not result[0]['stripe_customer_id']:
            raise HTTPException(
                status_code=404,
                detail="No Stripe customer found for user"
            )

        stripe_customer_id = result[0]['stripe_customer_id']

        # Fetch upcoming invoice from Stripe
        try:
            invoice = stripe.Invoice.upcoming(customer=stripe_customer_id)
        except stripe.error.InvalidRequestError:
            # No upcoming invoice (e.g., free tier)
            raise HTTPException(
                status_code=404,
                detail="No upcoming invoice found"
            )

        # Convert line items
        lines = []
        for line in invoice.lines.data:
            lines.append({
                'description': line.description,
                'amount': line.amount,
                'currency': line.currency,
                'period': {
                    'start': line.period.start,
                    'end': line.period.end
                }
            })

        logger.info(f"Retrieved upcoming invoice for user {current_user.id}")

        # Track metrics
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/upcoming-invoice',
            status=200
        ).inc()

        return UpcomingInvoiceResponse(
            amount_due=invoice.amount_due,
            currency=invoice.currency,
            period_start=invoice.period_start,
            period_end=invoice.period_end,
            next_payment_attempt=invoice.next_payment_attempt,
            lines=lines
        )

    except HTTPException:
        raise

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error retrieving upcoming invoice: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/upcoming-invoice',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve upcoming invoice: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error retrieving upcoming invoice: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/upcoming-invoice',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve upcoming invoice: {str(e)}"
        )


# Health check
@router.get("/health")
async def billing_health():
    """Billing API health check"""
    return {
        "status": "healthy",
        "service": "billing",
        "timestamp": datetime.utcnow().isoformat()
    }


# Test endpoint (development only)
if os.getenv('ENVIRONMENT') == 'development':
    @router.get("/test")
    async def billing_test():
        """Test billing API configuration"""
        portal_manager = get_portal_manager()
        config = portal_manager.get_portal_configuration()

        return {
            "status": "ok",
            "portal_features": list(config['features'].keys()),
            "stripe_configured": bool(os.getenv('STRIPE_SECRET_KEY'))
        }
