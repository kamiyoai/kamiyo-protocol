# -*- coding: utf-8 -*-
"""
Stripe Checkout API for KAMIYO MCP Subscriptions
FastAPI endpoints for creating and managing checkout sessions
"""

import os
import sys
import logging
from typing import Optional, Dict, Any
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field, validator
import stripe

from api.payments.stripe_client import get_stripe_client
from monitoring.prometheus_metrics import api_requests_total

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/api/billing",
    tags=["checkout"]
)


# ==========================================
# REQUEST/RESPONSE MODELS
# ==========================================

class CheckoutRequest(BaseModel):
    """Request to create a checkout session"""
    tier: str = Field(..., description="Subscription tier: personal, team, or enterprise")
    user_email: Optional[EmailStr] = Field(None, description="Pre-fill customer email")
    success_url: str = Field(..., description="URL to redirect after successful payment")
    cancel_url: str = Field(..., description="URL to redirect if user cancels")

    @validator('tier')
    def validate_tier(cls, v):
        """Validate tier is one of the allowed values"""
        allowed_tiers = ['personal', 'team', 'enterprise']
        if v.lower() not in allowed_tiers:
            raise ValueError(f"Tier must be one of: {', '.join(allowed_tiers)}")
        return v.lower()

    @validator('success_url', 'cancel_url')
    def validate_urls(cls, v):
        """Validate URLs are properly formatted"""
        if not v.startswith(('http://', 'https://')):
            raise ValueError("URL must start with http:// or https://")
        return v


class CheckoutResponse(BaseModel):
    """Checkout session response"""
    checkout_url: str = Field(..., description="Stripe Checkout session URL")
    session_id: str = Field(..., description="Checkout session ID")
    expires_at: int = Field(..., description="Session expiration timestamp")


class CheckoutSessionDetails(BaseModel):
    """Checkout session details response"""
    session_id: str = Field(..., description="Checkout session ID")
    status: str = Field(..., description="Payment status: open, complete, or expired")
    customer_email: Optional[str] = Field(None, description="Customer email")
    tier: Optional[str] = Field(None, description="Subscription tier")
    amount_total: Optional[int] = Field(None, description="Total amount in cents")
    currency: Optional[str] = Field(None, description="Currency code")
    subscription_id: Optional[str] = Field(None, description="Stripe subscription ID")
    customer_id: Optional[str] = Field(None, description="Stripe customer ID")
    payment_status: Optional[str] = Field(None, description="Payment status")


class PortalSessionRequest(BaseModel):
    """Request to create a customer portal session"""
    return_url: str = Field(..., description="URL to return to after portal session")

    @validator('return_url')
    def validate_url(cls, v):
        """Validate URL is properly formatted"""
        if not v.startswith(('http://', 'https://')):
            raise ValueError("URL must start with http:// or https://")
        return v


class PortalSessionResponse(BaseModel):
    """Customer portal session response"""
    portal_url: str = Field(..., description="Customer portal URL")
    session_id: str = Field(..., description="Portal session ID")


# ==========================================
# ROUTES
# ==========================================

@router.post("/create-checkout-session", response_model=CheckoutResponse)
async def create_checkout_session(request: CheckoutRequest):
    """
    Create a Stripe Checkout session for MCP subscription

    This endpoint creates a hosted checkout page where customers can subscribe
    to KAMIYO MCP tiers. After successful payment, they'll be redirected to
    the success_url with the session_id for verification.

    **Supported Tiers:**
    - personal: $19/month - 1 AI agent, 30 requests/min
    - team: $99/month - 5 AI agents, 100 requests/min
    - enterprise: $299/month - Unlimited agents, 500 requests/min

    **Flow:**
    1. Frontend calls this endpoint with tier and URLs
    2. Backend creates Stripe checkout session
    3. Frontend redirects user to checkout_url
    4. User completes payment on Stripe
    5. Stripe redirects to success_url with session_id
    6. Frontend calls GET /checkout-session/{session_id} to verify
    7. Webhook generates and emails MCP token

    **Security:**
    - No authentication required (public endpoint)
    - Session expires after 24 hours
    - CSRF protection via Stripe session validation
    """
    try:
        # Get Stripe API key
        stripe_key = os.getenv("STRIPE_SECRET_KEY")
        if not stripe_key:
            logger.error("STRIPE_SECRET_KEY not configured")
            raise HTTPException(
                status_code=500,
                detail="Payment system not configured"
            )

        stripe.api_key = stripe_key

        # Get price ID for tier
        price_ids = {
            "personal": os.getenv("STRIPE_PRICE_MCP_PERSONAL"),
            "team": os.getenv("STRIPE_PRICE_MCP_TEAM"),
            "enterprise": os.getenv("STRIPE_PRICE_MCP_ENTERPRISE")
        }

        price_id = price_ids.get(request.tier)
        if not price_id:
            logger.error(f"Price ID not configured for tier: {request.tier}")
            raise HTTPException(
                status_code=500,
                detail=f"Price not configured for tier: {request.tier}"
            )

        logger.info(f"Creating checkout session for tier: {request.tier}")

        # Create checkout session
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[
                {
                    "price": price_id,
                    "quantity": 1
                }
            ],
            customer_email=request.user_email,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            metadata={
                "tier": request.tier,
                "product_type": "mcp"
            },
            subscription_data={
                "metadata": {
                    "tier": request.tier,
                    "product_type": "mcp"
                }
            },
            allow_promotion_codes=True,  # Allow promo codes
            billing_address_collection="auto",  # Collect billing address for tax
            automatic_tax={"enabled": True}  # Enable automatic tax calculation
        )

        logger.info(f"Checkout session created: {session.id} for tier: {request.tier}")

        # Track metrics
        api_requests_total.labels(
            method='POST',
            endpoint='/billing/create-checkout-session',
            status=200
        ).inc()

        return CheckoutResponse(
            checkout_url=session.url,
            session_id=session.id,
            expires_at=session.expires_at
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating checkout session: {e}")
        api_requests_total.labels(
            method='POST',
            endpoint='/billing/create-checkout-session',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Payment system error: {str(e)}"
        )

    except ValueError as e:
        # Validation error from Pydantic
        logger.warning(f"Validation error: {e}")
        api_requests_total.labels(
            method='POST',
            endpoint='/billing/create-checkout-session',
            status=400
        ).inc()
        raise HTTPException(status_code=400, detail=str(e))

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Unexpected error creating checkout session: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        api_requests_total.labels(
            method='POST',
            endpoint='/billing/create-checkout-session',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail="Failed to create checkout session"
        )


@router.get("/checkout-session/{session_id}", response_model=CheckoutSessionDetails)
async def get_checkout_session(session_id: str):
    """
    Retrieve checkout session details

    Used on the success page to verify payment and show order details.
    Returns session status, customer info, tier, and subscription details.

    **Usage:**
    After successful checkout, Stripe redirects to success_url with session_id.
    Call this endpoint to:
    1. Verify payment was completed
    2. Get customer email for confirmation
    3. Show subscription tier and pricing
    4. Provide next steps (MCP token will arrive via email)

    **Security:**
    - No authentication required (public endpoint)
    - Session IDs are cryptographically random
    - Only returns non-sensitive data
    """
    try:
        # Get Stripe API key
        stripe_key = os.getenv("STRIPE_SECRET_KEY")
        if not stripe_key:
            logger.error("STRIPE_SECRET_KEY not configured")
            raise HTTPException(
                status_code=500,
                detail="Payment system not configured"
            )

        stripe.api_key = stripe_key

        # Retrieve checkout session from Stripe
        session = stripe.checkout.Session.retrieve(session_id)

        # Extract tier from metadata
        tier = session.metadata.get('tier', 'unknown')

        logger.info(f"Retrieved checkout session: {session_id}, status: {session.status}")

        # Track metrics
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/checkout-session',
            status=200
        ).inc()

        return CheckoutSessionDetails(
            session_id=session.id,
            status=session.status,
            customer_email=session.customer_email,
            tier=tier,
            amount_total=session.amount_total,
            currency=session.currency,
            subscription_id=session.subscription,
            customer_id=session.customer,
            payment_status=session.payment_status
        )

    except stripe.error.InvalidRequestError as e:
        logger.warning(f"Invalid session ID: {session_id}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/checkout-session',
            status=404
        ).inc()
        raise HTTPException(
            status_code=404,
            detail="Checkout session not found"
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error retrieving session: {e}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/checkout-session',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail=f"Payment system error: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Unexpected error retrieving session: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        api_requests_total.labels(
            method='GET',
            endpoint='/billing/checkout-session',
            status=500
        ).inc()
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve checkout session"
        )


@router.post("/create-portal-session", response_model=PortalSessionResponse)
async def create_portal_session(request: PortalSessionRequest):
    """
    Create a Customer Portal session for subscription management

    **Future Implementation:**
    This endpoint allows authenticated users to manage their subscriptions:
    - Update payment methods
    - View invoice history
    - Cancel subscription
    - Upgrade/downgrade tiers

    **Current Status:** Not yet implemented
    Requires user authentication and Stripe customer ID mapping.

    **Implementation Notes:**
    1. Add authentication dependency: Depends(get_current_user)
    2. Fetch user's Stripe customer ID from database
    3. Create portal session with customer ID
    4. Return portal URL for frontend redirect
    """
    raise HTTPException(
        status_code=501,
        detail="Customer portal not yet implemented. Use Stripe Dashboard for now."
    )


# Health check
@router.get("/checkout-health")
async def checkout_health():
    """
    Checkout API health check

    Verifies:
    - Stripe configuration is present
    - Price IDs are configured
    - API is responsive
    """
    try:
        # Check Stripe configuration
        stripe_key = os.getenv("STRIPE_SECRET_KEY")
        if not stripe_key:
            return {
                "status": "unhealthy",
                "service": "checkout",
                "error": "STRIPE_SECRET_KEY not configured",
                "timestamp": datetime.utcnow().isoformat()
            }

        # Check price IDs
        price_ids = {
            "personal": os.getenv("STRIPE_PRICE_MCP_PERSONAL"),
            "team": os.getenv("STRIPE_PRICE_MCP_TEAM"),
            "enterprise": os.getenv("STRIPE_PRICE_MCP_ENTERPRISE")
        }

        missing_prices = [tier for tier, price_id in price_ids.items() if not price_id]

        if missing_prices:
            return {
                "status": "degraded",
                "service": "checkout",
                "warning": f"Missing price IDs for tiers: {', '.join(missing_prices)}",
                "configured_tiers": [tier for tier in price_ids.keys() if price_ids[tier]],
                "timestamp": datetime.utcnow().isoformat()
            }

        return {
            "status": "healthy",
            "service": "checkout",
            "configured_tiers": list(price_ids.keys()),
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "checkout",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
