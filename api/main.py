# -*- coding: utf-8 -*-
"""
Kamiyo REST API
FastAPI application for exploit intelligence aggregation
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Query, HTTPException, Path, WebSocket, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import logging
import asyncio

from api.models import (
    ExploitResponse,
    ExploitsListResponse,
    StatsResponse,
    HealthResponse,
    SourceHealth,
    ErrorResponse
)
from database import get_db
from api.community import router as community_router
from intelligence.source_scorer import SourceScorer
from api.websocket_server import websocket_endpoint, get_websocket_manager

# Week 2 Payment System Routers
# Temporarily disabled due to missing dependencies (prometheus_client, psycopg2)
# from api.payments import routes as payment_routes
# from api.subscriptions import routes as subscription_routes
# from api.webhooks import routes as webhook_routes
# from api.billing import routes as billing_routes

# User Webhooks Router
from api.user_webhooks import routes as user_webhook_routes

# Discord Integration Router
from api.discord_routes import router as discord_router

# Telegram Integration Router
from api.telegram import router as telegram_router

# Alert Status Router
from api.alert_status import router as alert_status_router

# Protocol Watchlists Router
from api.watchlists import router as watchlists_router

# Slack Integration Router
from api.slack import router as slack_router

# API v2 - Deep Analysis Router
from api.v2 import analysis_router

# Cache imports
from api.middleware.cache_middleware import CacheMiddleware
from caching.cache_manager import get_cache_manager
from caching.warming import get_warmer
from config.cache_config import get_cache_config

# Rate limiting imports (P0-3)
from api.middleware.rate_limiter import RateLimitMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database optimization constants
MAX_PAGE_SIZE = 500

# Import PCI logging filter (must be imported after logging.basicConfig)
from api.payments.pci_logging_filter import setup_pci_compliant_logging

# Get cache configuration
cache_config = get_cache_config()

# Create FastAPI app
app = FastAPI(
    title="Kamiyo Exploit Intelligence API",
    description="Real-time aggregation of cryptocurrency exploits from multiple sources",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
# Configure CORS based on environment with HTTPS enforcement
def validate_origins(origins: list, is_production: bool) -> list:
    """Validate that production origins use HTTPS"""
    validated = []
    for origin in origins:
        origin = origin.strip()
        if is_production and not origin.startswith('https://'):
            logger.error(f"[SECURITY] Production origin must use HTTPS: {origin}")
            continue
        validated.append(origin)
    return validated

is_production = os.getenv("ENVIRONMENT", "development") == "production"
raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai"
).split(",")

# Validate origins
ALLOWED_ORIGINS = validate_origins(raw_origins, is_production)

# In development, allow localhost
if not is_production:
    ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://localhost:8000"])

# In production, ensure at least one valid origin
if is_production and not ALLOWED_ORIGINS:
    raise ValueError("[SECURITY] No valid HTTPS origins configured for production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
    max_age=3600,
)

# Security headers middleware (P0-1)
@app.middleware("http")
async def add_security_headers(request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)

    # Defense-in-depth security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    # Content-Security-Policy (CSP) - Additional XSS protection layer
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://api.kamiyo.ai; "
        "frame-ancestors 'none';"
    )

    # HSTS only in production (prevents MITM attacks)
    if is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response

# Rate limiting middleware (P0-3)
# Use Redis in production for distributed rate limiting
use_redis_rate_limit = is_production and os.getenv("REDIS_URL")
app.add_middleware(
    RateLimitMiddleware,
    use_redis=use_redis_rate_limit,
    redis_url=os.getenv("REDIS_URL")
)
logger.info(f"Rate limiting middleware enabled (Redis: {use_redis_rate_limit})")

# Cache middleware
if cache_config.middleware_enabled:
    app.add_middleware(
        CacheMiddleware,
        default_ttl=cache_config.ttl_api_response_default,
        skip_authenticated=cache_config.middleware_skip_authenticated,
        enable_etags=cache_config.middleware_etags_enabled,
        add_cache_headers=cache_config.middleware_cache_headers,
    )
    logger.info("Cache middleware enabled")

# Database instance
db = get_db()

# Source scorer instance
source_scorer = SourceScorer()

# Include routers
app.include_router(community_router)

# Week 2 Payment System Routers
# Temporarily disabled due to missing dependencies (prometheus_client, psycopg2)
# app.include_router(payment_routes.router, prefix="/api/v1/payments", tags=["Payments"])
# app.include_router(subscription_routes.router, prefix="/api/v1/subscriptions", tags=["Subscriptions"])
# app.include_router(webhook_routes.router, prefix="/api/v1/webhooks", tags=["Stripe Webhooks"])
# app.include_router(billing_routes.router, prefix="/api/v1/billing", tags=["Billing"])

# User Webhooks Router
app.include_router(user_webhook_routes.router, tags=["User Webhooks"])

# Discord Integration Router
app.include_router(discord_router, prefix="/api/v1/discord", tags=["Discord"])

# Telegram Integration Router
app.include_router(telegram_router, prefix="/api/v1/telegram", tags=["Telegram"])

# Alert Status Router
app.include_router(alert_status_router, tags=["Alerts"])

# Protocol Watchlists Router
app.include_router(watchlists_router, tags=["Protocol Watchlists"])

# Slack Integration Router
app.include_router(slack_router, tags=["Slack"])

# API v2 - Deep Analysis Router
app.include_router(analysis_router, tags=["Deep Analysis"])

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_route(websocket: WebSocket, token: Optional[str] = Query(None), chains: Optional[str] = Query(None), min_amount: float = Query(0.0)):
    """WebSocket endpoint for real-time exploit updates"""
    await websocket_endpoint(websocket, token, chains, min_amount)


@app.get("/", tags=["Root"])
async def root():
    """API root endpoint"""
    return {
        "name": "Kamiyo Exploit Intelligence API",
        "version": "1.0.0",
        "description": "Aggregating crypto exploits from 20+ sources",
        "docs": "/docs",
        "endpoints": {
            "exploits": "/exploits",
            "stats": "/stats",
            "health": "/health",
            "chains": "/chains",
            "community": "/community",
            "sources": "/sources/rankings"
        }
    }


@app.get("/exploits", response_model=ExploitsListResponse, tags=["Exploits"])
async def get_exploits(
    page: int = Query(1, ge=1, le=10000, description="Page number (max 10,000)"),
    page_size: int = Query(100, ge=1, le=500, description="Items per page (max 500 for performance)"),
    chain: Optional[str] = Query(None, max_length=100, description="Filter by blockchain"),
    min_amount: Optional[float] = Query(None, ge=0, description="Minimum loss amount (USD)"),
    protocol: Optional[str] = Query(None, max_length=100, description="Filter by protocol name"),
    authorization: Optional[str] = Header(None, description="Authorization header (Bearer token)"),
):
    """
    Get list of exploits with optional filtering and pagination

    - **page**: Page number (default: 1)
    - **page_size**: Items per page (default: 100, max: 1000)
    - **chain**: Filter by blockchain (e.g., "Ethereum", "BSC")
    - **min_amount**: Minimum loss amount in USD
    - **protocol**: Filter by protocol name (partial match)

    **Authentication:**
    - Optional: Authorization header with Bearer token (API key)
    - Free tier (no auth): Gets delayed data (24h delay)
    - Paid tiers (with auth): Gets real-time data
    """
    try:
        # Explicit page_size validation (MASTER-003)
        if page_size > MAX_PAGE_SIZE:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "page_size_too_large",
                    "max_allowed": MAX_PAGE_SIZE,
                    "requested": page_size
                }
            )

        # Import auth helpers
        from api.auth_helpers import get_optional_user, has_real_time_access
        from datetime import datetime, timedelta

        # Get user from optional auth
        user = await get_optional_user(authorization)

        # Check if user has real-time access
        is_real_time = has_real_time_access(user)

        # Calculate offset
        offset = (page - 1) * page_size

        # Fetch exploits
        exploits = db.get_recent_exploits(
            limit=page_size,
            offset=offset,
            chain=chain,
            min_amount=min_amount
        )

        # Apply delayed data filter for free tier users
        if not is_real_time:
            # Free tier gets data delayed by 24 hours
            from datetime import timezone
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
            filtered_exploits = []
            for e in exploits:
                timestamp_str = e.get('timestamp', '')
                if timestamp_str:
                    # Parse timestamp and make timezone-aware if needed
                    ts = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                    if ts.tzinfo is None:
                        # Make naive datetime UTC-aware
                        ts = ts.replace(tzinfo=timezone.utc)
                    if ts < cutoff_time:
                        filtered_exploits.append(e)
                else:
                    # Keep exploits without timestamp
                    filtered_exploits.append(e)
            exploits = filtered_exploits
            logger.info(f"Applied 24h delay filter for free tier user")

        # Filter by protocol if specified (case-insensitive partial match)
        if protocol:
            protocol_lower = protocol.lower()
            exploits = [
                e for e in exploits
                if protocol_lower in e['protocol'].lower()
            ]

        # Get total count (approximate for performance)
        total = db.get_total_exploits()

        # Convert to response models
        exploit_responses = [ExploitResponse(**exploit) for exploit in exploits]

        return ExploitsListResponse(
            data=exploit_responses,
            total=total,
            page=page,
            page_size=page_size,
            has_more=offset + len(exploits) < total
        )

    except Exception as e:
        logger.error(f"Error fetching exploits: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/exploits/{tx_hash}", response_model=ExploitResponse, tags=["Exploits"])
async def get_exploit(
    tx_hash: str = Path(..., description="Transaction hash")
):
    """
    Get single exploit by transaction hash

    - **tx_hash**: Transaction hash (or generated hash for sources without real tx hash)
    """
    try:
        exploit = db.get_exploit_by_tx_hash(tx_hash)

        if not exploit:
            raise HTTPException(status_code=404, detail="Exploit not found")

        return ExploitResponse(**exploit)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching exploit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats", response_model=StatsResponse, tags=["Statistics"])
async def get_stats(
    days: int = Query(1, ge=1, le=365, description="Time period in days")
):
    """
    Get statistics for specified time period

    - **days**: Number of days to include (default: 1, max: 365)

    Returns total exploits, total loss, affected chains/protocols, and more.
    """
    try:
        if days == 1:
            stats = db.get_stats_24h()
        else:
            stats = db.get_stats_custom(days=days)

        # Add period_days to response
        stats['period_days'] = days

        return StatsResponse(**stats)

    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chains", tags=["Chains"])
async def get_chains():
    """
    Get list of all blockchains in database

    Returns list of chain names with exploit counts (optimized single-query).
    """
    try:
        # Use optimized single-query method (fixes N+1 query problem)
        chain_counts = db.get_chains_with_counts()

        return {
            "total_chains": len(chain_counts),
            "chains": chain_counts
        }

    except Exception as e:
        logger.error(f"Error fetching chains: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch chains")


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Get health status of aggregation sources and database

    Returns source health, database statistics, and system status with detailed monitoring metrics.
    """
    try:
        from datetime import datetime

        sources = db.get_source_health()
        total_exploits = db.get_total_exploits()
        chains = db.get_chains()

        # Convert sources to models
        source_models = [SourceHealth(**source) for source in sources]

        return HealthResponse(
            status="healthy",
            database_exploits=total_exploits,
            tracked_chains=len(chains),
            active_sources=len([s for s in sources if s.get('is_active')]),
            total_sources=len(sources),
            sources=source_models,
            timestamp=datetime.now().isoformat()
        )

    except Exception as e:
        logger.error(f"Error fetching health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ready", tags=["Health"])
async def readiness_check():
    """
    Readiness probe for deployment health checks

    Returns 200 when app is ready to serve traffic, 503 otherwise.
    Checks critical dependencies: database, cache (if enabled).
    """
    try:
        # Check database connectivity
        total_exploits = db.get_total_exploits()

        # Check cache connectivity (if enabled)
        cache_healthy = True
        if cache_config.l2_enabled:
            try:
                cache_manager = get_cache_manager()
                cache_healthy = await cache_manager.ping()
            except Exception as e:
                logger.warning(f"Cache health check failed: {e}")
                cache_healthy = False

        # Return ready if database is accessible
        # Cache is optional - degrade gracefully
        if total_exploits >= 0:  # Database accessible
            return {
                "status": "ready",
                "database": "healthy",
                "cache": "healthy" if cache_healthy else "degraded",
                "exploits": total_exploits
            }
        else:
            raise HTTPException(status_code=503, detail="Database not accessible")

    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail="Not ready")


@app.get("/sources/rankings", tags=["Sources"])
async def get_source_rankings(
    days: int = Query(30, ge=1, le=365, description="Time period for evaluation")
):
    """
    Get quality rankings for all aggregation sources

    Scores sources based on:
    - **Speed**: Time from incident to report (30%)
    - **Exclusivity**: Percentage of first-reports (25%)
    - **Reliability**: Uptime and fetch success rate (20%)
    - **Coverage**: Chains/protocols covered (15%)
    - **Accuracy**: Verification rate (10%)

    Returns comprehensive comparison with rankings and metrics.
    """
    try:
        comparison = source_scorer.get_source_comparison(days=days)
        return comparison

    except Exception as e:
        logger.error(f"Error fetching source rankings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sources/{source_name}/score", tags=["Sources"])
async def get_source_score(
    source_name: str = Path(..., description="Source name"),
    days: int = Query(30, ge=1, le=365, description="Time period for evaluation")
):
    """
    Get detailed quality score for specific source

    Returns total score, individual metric scores, and exploit count.
    """
    try:
        score_data = source_scorer.score_source(source_name, days=days)

        if score_data.get('total_score') == 0:
            raise HTTPException(status_code=404, detail="Source not found or no data available")

        return score_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching source score: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "Not found", "detail": str(exc.detail)}
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )


# Startup/shutdown events
@app.on_event("startup")
async def startup_event():
    logger.info("Kamiyo API starting up...")

    # Initialize PCI-compliant logging FIRST (before any payment processing)
    # CRITICAL: This must run before any logs that might contain payment data
    # PCI DSS Requirement 3.4: Render PAN unreadable anywhere it is stored (including logs)
    try:
        pci_filter = setup_pci_compliant_logging(
            apply_to_root=True,  # Protect ALL loggers
            apply_to_loggers=['api.payments', 'api.subscriptions', 'stripe'],  # Extra protection for payment loggers
            log_level=os.getenv('LOG_LEVEL', 'INFO')
        )
        logger.info("[PCI COMPLIANCE] Logging filter initialized - all sensitive data will be redacted")
    except Exception as e:
        logger.critical(f"[PCI COMPLIANCE] Failed to initialize logging filter: {e}")
        logger.critical("PAYMENT PROCESSING SHOULD BE DISABLED - LOGS MAY CONTAIN SENSITIVE DATA")
        # In production, you might want to prevent startup here

    # Check Stripe API version health (P1-1)
    # PCI DSS Requirement 12.10.1: Incident response planning
    try:
        from api.payments.stripe_version_monitor import get_version_monitor

        version_monitor = get_version_monitor()
        version_health = version_monitor.check_version_health()

        if version_health['status'] == 'critical':
            logger.critical(
                f"[STRIPE VERSION] CRITICAL: API version {version_health['version']} "
                f"is {version_health['age_days']} days old. Upgrade required immediately."
            )
        elif version_health['status'] == 'warning':
            logger.warning(
                f"[STRIPE VERSION] WARNING: API version {version_health['version']} "
                f"is {version_health['age_days']} days old. Plan upgrade soon."
            )
        else:
            logger.info(
                f"[STRIPE VERSION] Healthy: API version {version_health['version']} "
                f"is {version_health['age_days']} days old."
            )
    except Exception as e:
        logger.error(f"[STRIPE VERSION] Failed to check version health: {e}")

    logger.info(f"Database exploits: {db.get_total_exploits()}")
    logger.info(f"Tracked chains: {len(db.get_chains())}")

    # Start WebSocket heartbeat
    ws_manager = get_websocket_manager()
    await ws_manager.start_heartbeat_task()
    logger.info("WebSocket manager started")

    # Initialize cache
    if cache_config.l2_enabled:
        try:
            cache_manager = get_cache_manager()
            await cache_manager.connect()
            logger.info("Cache manager connected")
        except Exception as e:
            logger.error(f"Failed to connect cache manager: {e}")

    # Start cache warming
    if cache_config.warming_enabled and cache_config.warming_on_startup:
        try:
            warmer = get_warmer()

            # Warm critical data
            await warmer.warm_statistics(db)
            await warmer.warm_chains(db)
            await warmer.warm_health(db)
            await warmer.warm_exploits_list(
                db,
                page_sizes=[100, 50],
                chains=db.get_chains()[:5]  # Top 5 chains
            )

            # Start scheduled warming
            if cache_config.warming_scheduled:
                await warmer.start_scheduled_warming()

            logger.info("Cache warming completed")
            logger.info(f"Warming stats: {warmer.get_stats()}")
        except Exception as e:
            logger.error(f"Cache warming failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Kamiyo API shutting down...")

    # Stop WebSocket heartbeat
    ws_manager = get_websocket_manager()
    ws_manager.stop_heartbeat_task()
    logger.info("WebSocket manager stopped")

    # Stop cache warming
    if cache_config.warming_enabled:
        try:
            warmer = get_warmer()
            warmer.stop_scheduled_warming()
            logger.info("Cache warming stopped")
        except Exception as e:
            logger.error(f"Failed to stop cache warming: {e}")

    # Disconnect cache
    if cache_config.l2_enabled:
        try:
            cache_manager = get_cache_manager()
            await cache_manager.disconnect()
            logger.info("Cache manager disconnected")
        except Exception as e:
            logger.error(f"Failed to disconnect cache manager: {e}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
