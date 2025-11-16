# -*- coding: utf-8 -*-
"""
Subscription API Routes for Kamiyo
FastAPI endpoints for subscription management
"""

import logging
from typing import List
from fastapi import APIRouter, HTTPException, Request, status, Depends
from pydantic import BaseModel

from .manager import get_subscription_manager, Subscription, UsageStats
from .tiers import TierName, SubscriptionTier, get_all_tiers, get_tier
from monitoring.prometheus_metrics import subscriptions_total

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v1/subscriptions", tags=["Subscriptions"])


# Response Models
class TierResponse(BaseModel):
    """Tier information response"""
    name: str
    display_name: str
    price_monthly_usd: str
    features: dict


class CurrentSubscriptionResponse(BaseModel):
    """Current subscription response"""
    user_id: str
    tier: str
    tier_display_name: str
    status: str
    current_period_start: str
    current_period_end: str
    cancel_at_period_end: bool
    features: dict


class UpgradeRequest(BaseModel):
    """Upgrade request"""
    new_tier: str


class UpgradeResponse(BaseModel):
    """Upgrade response"""
    success: bool
    message: str
    subscription: dict


class UsageResponse(BaseModel):
    """Usage statistics response"""
    user_id: str
    tier: str
    current_usage: dict
    limits: dict
    remaining: dict


# Helper function to extract user ID
async def get_current_user_id(request: Request) -> str:
    """
    Extract user ID from request state

    Args:
        request: FastAPI request

    Returns:
        User ID

    Raises:
        HTTPException: If user not authenticated
    """
    if not hasattr(request.state, 'user_id'):
        # For testing, allow IP-based identification
        if request.client:
            return request.client.host
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )

    return request.state.user_id


# Routes

@router.get("/tiers", response_model=List[TierResponse])
async def list_tiers():
    """
    List all available subscription tiers

    Returns pricing and features for each tier.
    No authentication required.
    """
    try:
        tiers = get_all_tiers()

        response = []
        for tier in tiers:
            response.append(TierResponse(
                name=tier.name.value,
                display_name=tier.display_name,
                price_monthly_usd=str(tier.price_monthly_usd),
                features={
                    'api_requests_per_day': tier.api_requests_per_day,
                    'api_requests_per_hour': tier.api_requests_per_hour,
                    'historical_data_days': tier.historical_data_days,
                    'real_time_alerts': tier.real_time_alerts,
                    'alert_channels': {
                        'email': tier.email_alerts,
                        'discord': tier.discord_alerts,
                        'telegram': tier.telegram_alerts,
                        'webhook': tier.webhook_alerts
                    },
                    'support_level': tier.support_level,
                    'custom_integrations': tier.custom_integrations,
                    'dedicated_account_manager': tier.dedicated_account_manager,
                    'sla_guarantee': tier.sla_guarantee,
                    'white_label': tier.white_label,
                    'exports': {
                        'csv': tier.csv_export,
                        'json': tier.json_export,
                        'api': tier.api_access
                    }
                }
            ))

        return response

    except Exception as e:
        logger.error(f"Failed to list tiers: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve tier information"
        )


@router.get("/current", response_model=CurrentSubscriptionResponse)
async def get_current_subscription(request: Request):
    """
    Get current user's subscription details

    Returns:
    - Current tier
    - Billing period
    - Available features
    - Cancellation status
    """
    try:
        user_id = await get_current_user_id(request)
        manager = get_subscription_manager()

        # Get subscription
        subscription = await manager.get_subscription(user_id)

        if not subscription:
            # User has no subscription, return free tier
            tier = TierName.FREE
            tier_config = get_tier(tier)

            return CurrentSubscriptionResponse(
                user_id=user_id,
                tier=tier.value,
                tier_display_name=tier_config.display_name,
                status="active",
                current_period_start="N/A",
                current_period_end="N/A",
                cancel_at_period_end=False,
                features={
                    'api_requests_per_day': tier_config.api_requests_per_day,
                    'historical_data_days': tier_config.historical_data_days,
                    'real_time_alerts': tier_config.real_time_alerts,
                    'support_level': tier_config.support_level
                }
            )

        # Get tier config
        tier_config = get_tier(subscription.tier)

        return CurrentSubscriptionResponse(
            user_id=user_id,
            tier=subscription.tier.value,
            tier_display_name=tier_config.display_name,
            status=subscription.status,
            current_period_start=subscription.current_period_start.isoformat(),
            current_period_end=subscription.current_period_end.isoformat(),
            cancel_at_period_end=subscription.cancel_at_period_end,
            features={
                'api_requests_per_day': tier_config.api_requests_per_day,
                'historical_data_days': tier_config.historical_data_days,
                'real_time_alerts': tier_config.real_time_alerts,
                'support_level': tier_config.support_level,
                'alert_channels': {
                    'email': tier_config.email_alerts,
                    'discord': tier_config.discord_alerts,
                    'telegram': tier_config.telegram_alerts,
                    'webhook': tier_config.webhook_alerts
                }
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get current subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve subscription"
        )


@router.post("/upgrade", response_model=UpgradeResponse)
async def upgrade_subscription(request: Request, upgrade_req: UpgradeRequest):
    """
    Upgrade subscription to a higher tier

    Requires:
    - Valid authentication
    - Valid payment method (Stripe integration)
    - Higher tier than current

    Returns updated subscription details.
    """
    try:
        user_id = await get_current_user_id(request)
        manager = get_subscription_manager()

        # Validate tier
        try:
            new_tier = TierName(upgrade_req.new_tier)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid tier: {upgrade_req.new_tier}"
            )

        # Perform upgrade
        try:
            subscription = await manager.upgrade_subscription(user_id, new_tier)

            # Track metrics
            subscriptions_total.labels(tier=new_tier.value, event='upgraded').inc()

            # Get tier config
            tier_config = get_tier(new_tier)

            return UpgradeResponse(
                success=True,
                message=f"Successfully upgraded to {tier_config.display_name}",
                subscription={
                    'tier': subscription.tier.value,
                    'status': subscription.status,
                    'current_period_start': subscription.current_period_start.isoformat(),
                    'current_period_end': subscription.current_period_end.isoformat()
                }
            )

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upgrade subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upgrade subscription"
        )


@router.post("/downgrade", response_model=UpgradeResponse)
async def downgrade_subscription(request: Request, downgrade_req: UpgradeRequest):
    """
    Downgrade subscription to a lower tier

    Downgrade will take effect at the end of current billing period.

    Returns updated subscription details.
    """
    try:
        user_id = await get_current_user_id(request)
        manager = get_subscription_manager()

        # Validate tier
        try:
            new_tier = TierName(downgrade_req.new_tier)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid tier: {downgrade_req.new_tier}"
            )

        # Perform downgrade
        try:
            subscription = await manager.downgrade_subscription(user_id, new_tier)

            # Track metrics
            subscriptions_total.labels(tier=new_tier.value, event='downgraded').inc()

            tier_config = get_tier(new_tier)

            return UpgradeResponse(
                success=True,
                message=f"Scheduled downgrade to {tier_config.display_name} at end of billing period",
                subscription={
                    'tier': subscription.tier.value,
                    'status': subscription.status,
                    'cancel_at_period_end': subscription.cancel_at_period_end,
                    'current_period_end': subscription.current_period_end.isoformat()
                }
            )

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to downgrade subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to downgrade subscription"
        )


@router.post("/cancel")
async def cancel_subscription(request: Request):
    """
    Cancel subscription

    Cancellation will take effect at the end of current billing period.
    User retains access until period ends.

    Returns cancellation confirmation.
    """
    try:
        user_id = await get_current_user_id(request)
        manager = get_subscription_manager()

        # Cancel subscription
        try:
            success = await manager.cancel_subscription(user_id)

            if success:
                # Track metrics
                subscriptions_total.labels(tier='unknown', event='cancelled').inc()

                return {
                    'success': True,
                    'message': 'Subscription cancelled. Access continues until end of billing period.'
                }
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to cancel subscription"
                )

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel subscription"
        )


@router.get("/usage", response_model=UsageResponse)
async def get_usage_statistics(request: Request):
    """
    Get current usage statistics

    Returns:
    - Current usage across time windows
    - Rate limits for tier
    - Remaining requests
    - Endpoint breakdown
    """
    try:
        user_id = await get_current_user_id(request)
        manager = get_subscription_manager()

        # Get usage stats
        stats = await manager.get_usage_stats(user_id)

        return UsageResponse(
            user_id=stats.user_id,
            tier=stats.tier.value,
            current_usage={
                'minute': stats.usage_current_minute,
                'hour': stats.usage_current_hour,
                'day': stats.usage_current_day,
                'endpoints': stats.endpoint_breakdown
            },
            limits={
                'minute': stats.limit_minute,
                'hour': stats.limit_hour,
                'day': stats.limit_day
            },
            remaining={
                'minute': stats.remaining_minute,
                'hour': stats.remaining_hour,
                'day': stats.remaining_day
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get usage statistics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve usage statistics"
        )


# Test endpoint (should be removed in production)
@router.get("/test/reset-usage")
async def reset_usage_test(request: Request):
    """
    Reset usage counters for testing

    WARNING: This endpoint should be removed in production!
    """
    try:
        user_id = await get_current_user_id(request)

        from .usage_tracker import get_usage_tracker
        tracker = get_usage_tracker()
        tracker.reset_usage(user_id)

        return {
            'success': True,
            'message': f'Usage reset for user {user_id}'
        }

    except Exception as e:
        logger.error(f"Failed to reset usage: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset usage"
        )


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Subscription Routes Test ===\n")
    print("Available endpoints:")
    print("  GET  /api/v1/subscriptions/tiers")
    print("  GET  /api/v1/subscriptions/current")
    print("  POST /api/v1/subscriptions/upgrade")
    print("  POST /api/v1/subscriptions/downgrade")
    print("  POST /api/v1/subscriptions/cancel")
    print("  GET  /api/v1/subscriptions/usage")
    print("\n✅ Routes ready to be included in FastAPI app")
