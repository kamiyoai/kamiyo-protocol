"""
FastAPI REST API for Varden Exploit Intelligence Platform.

This is the main API server that provides access to exploit data,
alerts, statistics, and webhook management.
"""

import logging
import time
import json
from datetime import datetime
from typing import Optional, List
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from .models import (
    ExploitResponse,
    ExploitsListResponse,
    AlertResponse,
    RecentAlertsResponse,
    StatsOverviewResponse,
    HealthResponse,
    WebhookConfigRequest,
    WebhookConfigResponse,
    WebhookListResponse,
    ErrorResponse,
    SearchResponse,
    SubscriptionInfo,
)
from .database import db
from .auth import (
    get_api_key,
    check_rate_limit,
    get_optional_api_key,
    get_tier_from_auth,
    get_data_delay,
    get_webhook_limit,
    get_requests_remaining,
)
from .subscriptions import (
    SubscriptionTier,
    get_tier_limits,
    get_tier_comparison,
)

# ========== Logging Configuration ==========

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========== FastAPI App ==========

app = FastAPI(
    title="Varden Exploit Intelligence API",
    description="""
    # Varden Exploit Intelligence Platform API

    Real-time blockchain exploit detection and monitoring API.

    ## Features
    - Real-time exploit detection across multiple chains
    - Advanced filtering and search capabilities
    - Webhook notifications for critical events
    - Tiered subscription plans with rate limiting
    - Comprehensive exploit analytics

    ## Authentication
    Most endpoints require an API key. Include your API key in the `X-API-Key` header:

    ```
    X-API-Key: your_api_key_here
    ```

    ## Rate Limits
    - **FREE**: 10 requests/hour (public endpoints only)
    - **BASIC**: 100 requests/hour
    - **PRO**: 1000 requests/hour

    ## Data Access
    - **FREE**: 24-hour delayed data
    - **BASIC**: 1-hour delayed data
    - **PRO**: Real-time data

    ## Support
    - Documentation: https://docs.varden.io
    - Email: support@varden.io
    - Discord: https://discord.gg/varden
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "exploits", "description": "Exploit data endpoints"},
        {"name": "alerts", "description": "Real-time alert endpoints"},
        {"name": "search", "description": "Search and filtering"},
        {"name": "stats", "description": "Statistics and analytics"},
        {"name": "webhooks", "description": "Webhook management"},
        {"name": "subscriptions", "description": "Subscription tier information"},
        {"name": "health", "description": "Health checks and system status"},
    ]
)

# ========== CORS Middleware ==========

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== Startup/Shutdown Events ==========

start_time = time.time()


@app.on_event("startup")
async def startup_event():
    """Initialize on startup."""
    logger.info("Starting Varden API server...")
    logger.info(f"Database path: {db.db_path}")

    # Test database connection
    try:
        total = db.get_total_exploits()
        logger.info(f"Database connected successfully. Total exploits: {total}")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down Varden API server...")


# ========== Health Check ==========

@app.get(
    "/health",
    tags=["health"],
    response_model=HealthResponse,
    summary="Health check",
    description="Check API health and database connectivity"
)
async def health_check():
    """Health check endpoint."""
    try:
        # Test database connection
        db.get_total_exploits()
        db_status = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = "disconnected"

    uptime = time.time() - start_time

    return HealthResponse(
        status="healthy" if db_status == "connected" else "degraded",
        version="1.0.0",
        database=db_status,
        timestamp=datetime.utcnow().isoformat(),
        uptime_seconds=uptime
    )


# ========== Exploit Endpoints ==========

@app.get(
    "/exploits",
    tags=["exploits"],
    response_model=ExploitsListResponse,
    summary="List exploits",
    description="Get paginated list of exploits with optional filtering"
)
async def list_exploits(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    chain: Optional[str] = Query(None, description="Filter by blockchain"),
    protocol: Optional[str] = Query(None, description="Filter by protocol"),
    severity: Optional[str] = Query(None, description="Filter by severity (critical/high/medium/low)"),
    min_amount: Optional[float] = Query(None, ge=0, description="Minimum amount stolen (USD)"),
    auth: Optional[tuple] = Depends(get_optional_api_key)
):
    """
    Get a paginated list of exploits with optional filtering.

    Data delay is applied based on subscription tier:
    - FREE: 24-hour delay
    - BASIC: 1-hour delay
    - PRO: Real-time
    """
    try:
        # Determine subscription tier and data delay
        tier = get_tier_from_auth(auth)
        delay_hours = get_data_delay(tier)

        # Calculate offset
        offset = (page - 1) * page_size

        # Fetch exploits
        exploits = db.get_exploits(
            limit=page_size,
            offset=offset,
            chain=chain,
            protocol=protocol,
            severity=severity,
            min_amount=min_amount,
            delay_hours=delay_hours
        )

        # Get total count
        total = db.get_total_exploits(
            chain=chain,
            protocol=protocol,
            severity=severity,
            min_amount=min_amount,
            delay_hours=delay_hours
        )

        # Calculate pagination metadata
        total_pages = (total + page_size - 1) // page_size

        return ExploitsListResponse(
            exploits=[ExploitResponse(**exploit) for exploit in exploits],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1
        )

    except Exception as e:
        logger.error(f"Error fetching exploits: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch exploits: {str(e)}"
        )


@app.get(
    "/exploits/{tx_hash}",
    tags=["exploits"],
    response_model=ExploitResponse,
    summary="Get exploit by transaction hash",
    description="Retrieve detailed information about a specific exploit"
)
async def get_exploit(
    tx_hash: str,
    auth: Optional[tuple] = Depends(get_optional_api_key)
):
    """Get a single exploit by transaction hash."""
    try:
        exploit = db.get_exploit_by_hash(tx_hash)

        if not exploit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Exploit with hash {tx_hash} not found"
            )

        return ExploitResponse(**exploit)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching exploit {tx_hash}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch exploit: {str(e)}"
        )


# ========== Alert Endpoints ==========

@app.get(
    "/alerts/recent",
    tags=["alerts"],
    response_model=RecentAlertsResponse,
    summary="Get recent alerts",
    description="Get recent high-severity exploits as alerts"
)
async def get_recent_alerts(
    hours: int = Query(24, ge=1, le=168, description="Time window in hours"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of alerts"),
    auth_info: tuple = Depends(check_rate_limit)
):
    """
    Get recent high-severity exploits (critical and high).

    Requires authentication. Data delay is applied based on subscription tier.
    """
    try:
        api_key, key_info = auth_info
        tier = key_info["tier"]
        delay_hours = get_data_delay(tier)

        alerts = db.get_recent_alerts(
            hours=hours,
            limit=limit,
            delay_hours=delay_hours
        )

        return RecentAlertsResponse(
            alerts=[AlertResponse(**alert) for alert in alerts],
            count=len(alerts),
            time_window_hours=hours
        )

    except Exception as e:
        logger.error(f"Error fetching alerts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch alerts: {str(e)}"
        )


# ========== Search Endpoints ==========

@app.get(
    "/search",
    tags=["search"],
    response_model=SearchResponse,
    summary="Search exploits",
    description="Search exploits by term (protocol, chain, address, tx hash)"
)
async def search_exploits(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results"),
    auth: Optional[tuple] = Depends(get_optional_api_key)
):
    """
    Search exploits across multiple fields.

    Searches in: protocol, chain, transaction hash, attacker address, victim address
    """
    try:
        # Determine subscription tier and data delay
        tier = get_tier_from_auth(auth)
        delay_hours = get_data_delay(tier)

        results = db.search_exploits(
            search_term=q,
            limit=limit,
            delay_hours=delay_hours
        )

        return SearchResponse(
            results=[ExploitResponse(**exploit) for exploit in results],
            query=q,
            count=len(results)
        )

    except Exception as e:
        logger.error(f"Error searching exploits: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


# ========== Statistics Endpoints ==========

@app.get(
    "/stats/overview",
    tags=["stats"],
    response_model=StatsOverviewResponse,
    summary="Get statistics overview",
    description="Get comprehensive statistics and analytics"
)
async def get_stats_overview(
    auth: Optional[tuple] = Depends(get_optional_api_key)
):
    """
    Get overview statistics including:
    - Total exploits
    - Total amount stolen
    - Recent activity
    - Breakdown by severity
    - Breakdown by chain
    """
    try:
        # Determine subscription tier and data delay
        tier = get_tier_from_auth(auth)
        delay_hours = get_data_delay(tier)

        stats = db.get_stats_overview(delay_hours=delay_hours)
        return StatsOverviewResponse(**stats)

    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch statistics: {str(e)}"
        )


# ========== Webhook Endpoints ==========

@app.post(
    "/webhooks/configure",
    tags=["webhooks"],
    response_model=WebhookConfigResponse,
    summary="Configure webhook",
    description="Add or update a webhook configuration"
)
async def configure_webhook(
    webhook: WebhookConfigRequest,
    auth_info: tuple = Depends(check_rate_limit)
):
    """
    Configure a webhook to receive real-time notifications.

    Webhook limits by tier:
    - FREE: 0 webhooks
    - BASIC: 1 webhook
    - PRO: 10 webhooks
    """
    try:
        api_key, key_info = auth_info
        tier = key_info["tier"]

        # Check if tier allows webhooks
        max_webhooks = get_webhook_limit(tier)
        if max_webhooks == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Webhook access not available on {tier.value} tier. Upgrade to BASIC or PRO."
            )

        # Check webhook count limit
        existing_webhooks = db.get_webhooks_by_api_key(api_key)
        if len(existing_webhooks) >= max_webhooks:
            # Check if this is an update to existing webhook
            is_update = any(wh['webhook_url'] == webhook.webhook_url for wh in existing_webhooks)
            if not is_update:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Webhook limit reached. Maximum {max_webhooks} webhooks allowed on {tier.value} tier."
                )

        # Save webhook configuration
        webhook_id = db.save_webhook_config(
            api_key=api_key,
            webhook_url=webhook.webhook_url,
            event_types=json.dumps([et.value for et in webhook.event_types]),
            filters=json.dumps(webhook.filters) if webhook.filters else None
        )

        # Fetch the saved webhook
        saved_webhooks = db.get_webhooks_by_api_key(api_key)
        saved_webhook = next((wh for wh in saved_webhooks if wh['id'] == webhook_id), None)

        if not saved_webhook:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save webhook configuration"
            )

        return WebhookConfigResponse(
            id=saved_webhook['id'],
            webhook_url=saved_webhook['webhook_url'],
            event_types=json.loads(saved_webhook['event_types']),
            filters=json.loads(saved_webhook['filters']) if saved_webhook['filters'] else None,
            created_at=saved_webhook['created_at'],
            updated_at=saved_webhook['updated_at']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configuring webhook: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to configure webhook: {str(e)}"
        )


@app.get(
    "/webhooks",
    tags=["webhooks"],
    response_model=WebhookListResponse,
    summary="List webhooks",
    description="Get all configured webhooks for your API key"
)
async def list_webhooks(
    auth_info: tuple = Depends(check_rate_limit)
):
    """Get all webhooks configured for your API key."""
    try:
        api_key, key_info = auth_info
        tier = key_info["tier"]
        max_webhooks = get_webhook_limit(tier)

        webhooks = db.get_webhooks_by_api_key(api_key)

        webhook_responses = []
        for wh in webhooks:
            webhook_responses.append(WebhookConfigResponse(
                id=wh['id'],
                webhook_url=wh['webhook_url'],
                event_types=json.loads(wh['event_types']),
                filters=json.loads(wh['filters']) if wh['filters'] else None,
                created_at=wh['created_at'],
                updated_at=wh['updated_at']
            ))

        return WebhookListResponse(
            webhooks=webhook_responses,
            count=len(webhook_responses),
            max_allowed=max_webhooks
        )

    except Exception as e:
        logger.error(f"Error listing webhooks: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list webhooks: {str(e)}"
        )


@app.delete(
    "/webhooks/{webhook_id}",
    tags=["webhooks"],
    summary="Delete webhook",
    description="Remove a webhook configuration"
)
async def delete_webhook(
    webhook_id: int,
    auth_info: tuple = Depends(check_rate_limit)
):
    """Delete a webhook configuration."""
    try:
        api_key, key_info = auth_info

        success = db.delete_webhook(api_key, webhook_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Webhook {webhook_id} not found"
            )

        return {"message": "Webhook deleted successfully", "webhook_id": webhook_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting webhook: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete webhook: {str(e)}"
        )


# ========== Subscription Info Endpoints ==========

@app.get(
    "/subscriptions/tiers",
    tags=["subscriptions"],
    summary="Get subscription tiers",
    description="Get information about all subscription tiers and pricing"
)
async def get_subscription_tiers():
    """Get all subscription tier information for pricing page."""
    return {"tiers": get_tier_comparison()}


@app.get(
    "/subscriptions/me",
    tags=["subscriptions"],
    response_model=SubscriptionInfo,
    summary="Get my subscription",
    description="Get information about your current subscription"
)
async def get_my_subscription(
    auth_info: tuple = Depends(check_rate_limit)
):
    """Get current subscription information."""
    try:
        api_key, key_info = auth_info
        tier = key_info["tier"]
        limits = get_tier_limits(tier)

        return SubscriptionInfo(
            tier=tier,
            data_delay_hours=limits["data_delay_hours"],
            rate_limit_per_hour=limits["rate_limit_per_hour"],
            webhook_limit=limits["webhook_limit"],
            api_access=limits["api_access"],
            features=limits["features"]
        )

    except Exception as e:
        logger.error(f"Error fetching subscription info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch subscription: {str(e)}"
        )


# ========== Root Endpoint ==========

@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint - redirect to docs."""
    return {
        "message": "Welcome to Varden Exploit Intelligence API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


# ========== Error Handlers ==========

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail if isinstance(exc.detail, str) else exc.detail.get("error", "Error"),
            "detail": exc.detail if isinstance(exc.detail, str) else exc.detail.get("detail"),
            "status_code": exc.status_code
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "detail": str(exc),
            "status_code": 500
        }
    )


# ========== Run Server ==========

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
