# -*- coding: utf-8 -*-
"""
Payment API Routes for Kamiyo
FastAPI endpoints for Stripe payment processing
"""

import os
import sys
import logging
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import JSONResponse

from api.payments.models import (
    CreateCustomerRequest,
    CustomerResponse,
    CreateSubscriptionRequest,
    SubscriptionResponse,
    UpdateSubscriptionRequest,
    CancelSubscriptionRequest,
    PaymentResponse,
    PaymentMethodResponse
)
from api.payments.stripe_client import get_stripe_client, StripeClient
from api.security import require_api_key
from monitoring.prometheus_metrics import (
    api_requests_total,
    api_request_duration_seconds,
    payments_total
)
import stripe
import time

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/api/v1/payments",
    tags=["Payments"]
)


# ==========================================
# DEPENDENCY INJECTION
# ==========================================

def get_stripe() -> StripeClient:
    """Dependency to get Stripe client"""
    return get_stripe_client()


# ==========================================
# CUSTOMER ENDPOINTS
# ==========================================

@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    request: CreateCustomerRequest,
    stripe_client: StripeClient = Depends(get_stripe)
):
    """
    Create a new Stripe customer

    Creates a customer in both Stripe and the local database.

    **Request Body:**
    - **email**: Customer email address (required)
    - **name**: Customer name (optional)
    - **metadata**: Additional metadata (optional)

    **Returns:**
    - Customer data with database ID and Stripe customer ID

    **Errors:**
    - 400: Invalid request data
    - 500: Stripe API error or database error
    """

    start_time = time.time()

    try:
        # TODO: Get user_id from authenticated session
        # For now, using a placeholder
        user_id = 1

        customer_data = await stripe_client.create_customer(
            user_id=user_id,
            email=request.email,
            name=request.name,
            metadata=request.metadata
        )

        # Track metrics
        api_requests_total.labels(
            method='POST',
            endpoint='/payments/customers',
            status=201
        ).inc()

        duration = time.time() - start_time
        api_request_duration_seconds.labels(
            method='POST',
            endpoint='/payments/customers'
        ).observe(duration)

        return CustomerResponse(**customer_data)

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error creating customer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    stripe_client: StripeClient = Depends(get_stripe)
):
    """
    Get customer by ID

    **Path Parameters:**
    - **customer_id**: Database customer ID

    **Returns:**
    - Customer data

    **Errors:**
    - 404: Customer not found
    - 500: Database error
    """

    start_time = time.time()

    try:
        customer_data = await stripe_client.get_customer(customer_id)

        if not customer_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found"
            )

        # Track metrics
        api_requests_total.labels(
            method='GET',
            endpoint='/payments/customers',
            status=200
        ).inc()

        duration = time.time() - start_time
        api_request_duration_seconds.labels(
            method='GET',
            endpoint='/payments/customers'
        ).observe(duration)

        return CustomerResponse(**customer_data)

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error fetching customer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: int,
    stripe_client: StripeClient = Depends(get_stripe)
):
    """
    Delete a customer

    Deletes customer from both Stripe and local database.
    This will also cancel any active subscriptions.

    **Path Parameters:**
    - **customer_id**: Database customer ID

    **Returns:**
    - 204 No Content on success

    **Errors:**
    - 404: Customer not found
    - 500: Stripe API error or database error
    """

    try:
        await stripe_client.delete_customer(customer_id)

        # Track metrics
        api_requests_total.labels(
            method='DELETE',
            endpoint='/payments/customers',
            status=204
        ).inc()

        return JSONResponse(status_code=status.HTTP_204_NO_CONTENT, content={})

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error deleting customer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ==========================================
# SUBSCRIPTION ENDPOINTS
# ==========================================

@router.post("/subscriptions", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    request: CreateSubscriptionRequest,
    stripe_client: StripeClient = Depends(get_stripe)
):
    """
    Create a new subscription

    Creates a subscription for a customer.

    **Request Body:**
    - **customer_id**: Database customer ID (required)
    - **price_id**: Stripe price ID (required)
    - **tier**: Subscription tier - basic, pro, or enterprise (required)
    - **metadata**: Additional metadata (optional)

    **Returns:**
    - Subscription data

    **Errors:**
    - 400: Invalid request data
    - 404: Customer not found
    - 500: Stripe API error or database error
    """

    start_time = time.time()

    try:
        subscription_data = await stripe_client.create_subscription(
            customer_id=request.customer_id,
            price_id=request.price_id,
            tier=request.tier,
            metadata=request.metadata
        )

        # Track metrics
        api_requests_total.labels(
            method='POST',
            endpoint='/payments/subscriptions',
            status=201
        ).inc()

        duration = time.time() - start_time
        api_request_duration_seconds.labels(
            method='POST',
            endpoint='/payments/subscriptions'
        ).observe(duration)

        return SubscriptionResponse(**subscription_data)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        payments_total.labels(status='failed').inc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error creating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/subscriptions/{subscription_id}", response_model=SubscriptionResponse)
async def get_subscription(
    subscription_id: int,
    stripe_client: StripeClient = Depends(get_stripe)
):
    """
    Get subscription by ID

    **Path Parameters:**
    - **subscription_id**: Database subscription ID

    **Returns:**
    - Subscription data

    **Errors:**
    - 404: Subscription not found
    - 500: Database error
    """

    start_time = time.time()

    try:
        subscription_data = await stripe_client.get_subscription(subscription_id)

        if not subscription_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subscription {subscription_id} not found"
            )

        # Track metrics
        api_requests_total.labels(
            method='GET',
            endpoint='/payments/subscriptions',
            status=200
        ).inc()

        duration = time.time() - start_time
        api_request_duration_seconds.labels(
            method='GET',
            endpoint='/payments/subscriptions'
        ).observe(duration)

        return SubscriptionResponse(**subscription_data)

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error fetching subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.patch("/subscriptions/{subscription_id}", response_model=SubscriptionResponse)
async def update_subscription(
    subscription_id: int,
    request: UpdateSubscriptionRequest,
    stripe_client: StripeClient = Depends(get_stripe)
):
    """
    Update a subscription

    **Path Parameters:**
    - **subscription_id**: Database subscription ID

    **Request Body:**
    - **price_id**: New Stripe price ID (optional)
    - **tier**: New subscription tier (optional)
    - **cancel_at_period_end**: Cancel at period end (optional)
    - **metadata**: Additional metadata (optional)

    **Returns:**
    - Updated subscription data

    **Errors:**
    - 404: Subscription not found
    - 500: Stripe API error or database error
    """

    start_time = time.time()

    try:
        subscription_data = await stripe_client.update_subscription(
            subscription_id=subscription_id,
            price_id=request.price_id,
            tier=request.tier,
            cancel_at_period_end=request.cancel_at_period_end,
            metadata=request.metadata
        )

        # Track metrics
        api_requests_total.labels(
            method='PATCH',
            endpoint='/payments/subscriptions',
            status=200
        ).inc()

        duration = time.time() - start_time
        api_request_duration_seconds.labels(
            method='PATCH',
            endpoint='/payments/subscriptions'
        ).observe(duration)

        return SubscriptionResponse(**subscription_data)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error updating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/subscriptions/{subscription_id}", response_model=SubscriptionResponse)
async def cancel_subscription(
    subscription_id: int,
    request: CancelSubscriptionRequest = CancelSubscriptionRequest(),
    stripe_client: StripeClient = Depends(get_stripe)
):
    """
    Cancel a subscription

    **Path Parameters:**
    - **subscription_id**: Database subscription ID

    **Request Body:**
    - **cancel_immediately**: Cancel now (true) or at period end (false, default)
    - **cancellation_reason**: Reason for cancellation (optional)

    **Returns:**
    - Updated subscription data showing cancellation status

    **Errors:**
    - 404: Subscription not found
    - 500: Stripe API error or database error
    """

    start_time = time.time()

    try:
        subscription_data = await stripe_client.cancel_subscription(
            subscription_id=subscription_id,
            cancel_immediately=request.cancel_immediately
        )

        # Track metrics
        api_requests_total.labels(
            method='DELETE',
            endpoint='/payments/subscriptions',
            status=200
        ).inc()

        duration = time.time() - start_time
        api_request_duration_seconds.labels(
            method='DELETE',
            endpoint='/payments/subscriptions'
        ).observe(duration)

        return SubscriptionResponse(**subscription_data)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error canceling subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ==========================================
# PRICING INFORMATION ENDPOINTS
# ==========================================

@router.get("/plans")
async def get_pricing_plans():
    """
    Get all available pricing plans

    Returns pricing information for all subscription tiers.

    **Returns:**
    - Dict of pricing plans with features and pricing

    **No authentication required** - public endpoint
    """

    from config.stripe_config import get_stripe_config

    config = get_stripe_config()
    plans = config.get_all_plans()

    return {
        "plans": plans,
        "currency": "usd",
        "billing_interval": "month"
    }


@router.get("/plans/{tier}")
async def get_plan_details(tier: str):
    """
    Get details for a specific pricing tier

    **Path Parameters:**
    - **tier**: Subscription tier (free, basic, pro, enterprise)

    **Returns:**
    - Plan details with features and pricing

    **Errors:**
    - 404: Tier not found
    """

    from config.stripe_config import get_stripe_config

    config = get_stripe_config()
    plan = config.get_plan_config(tier)

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pricing tier '{tier}' not found"
        )

    return plan


# ==========================================
# HEALTH CHECK
# ==========================================

@router.get("/health")
async def payment_health_check():
    """
    Check payment system health

    Verifies Stripe configuration and connectivity.

    **Returns:**
    - Health status and configuration info
    """

    from config.stripe_config import get_stripe_config

    config = get_stripe_config()

    return {
        "status": "healthy" if config.is_enabled else "degraded",
        "stripe_configured": config.is_enabled,
        "test_mode": config.is_test_mode,
        "api_version": config.api_version,
        "webhook_configured": bool(config.webhook_secret)
    }


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Payment Routes Test ===\n")
    print(f"Router prefix: {router.prefix}")
    print(f"Router tags: {router.tags}")
    print(f"\nEndpoints:")
    for route in router.routes:
        print(f"  {route.methods} {route.path}")
    print("\n✅ Payment routes ready")
