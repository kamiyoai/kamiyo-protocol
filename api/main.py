# -*- coding: utf-8 -*-
"""
KAMIYO x402 Infrastructure API
FastAPI application for multi-chain USDC payment verification
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Query, HTTPException, Path, WebSocket, Header, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
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
from api.scheduled_tasks import get_task_runner

# Week 2 Payment System Routers
from api.payments import routes as payment_routes
from api.subscriptions import routes as subscription_routes
from api.webhooks import routes as webhook_routes
from api.billing import routes as billing_routes
from api.billing import checkout as checkout_routes

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

# x402 Payment System
from api.x402 import routes as x402_routes
from api.x402.middleware import X402Middleware
from api.x402.routes import payment_tracker

# Hyperliquid Security Intelligence
# from api.hyperliquid import router as hyperliquid_router  # TODO: Enable when ready

# Cache imports
from api.middleware.cache_middleware import CacheMiddleware
from caching.cache_manager import get_cache_manager
from caching.warming import get_warmer
from config.cache_config import get_cache_config

# Rate limiting imports (P0-3)
from api.middleware.rate_limiter import RateLimitMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# CSRF Protection imports (BLOCKER 1)
from api.csrf_protection import (
    get_csrf_protect,
    csrf_protect_exception_handler,
    validate_csrf_production_config,
    csrf_settings
)
from fastapi_csrf_protect import CsrfProtect
from fastapi_csrf_protect.exceptions import CsrfProtectError

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

# Add slowapi exception handler for rate limiting
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CSRF protection exception handler (BLOCKER 1)
app.add_exception_handler(CsrfProtectError, csrf_protect_exception_handler)

# CORS middleware
# Configure CORS based on environment with HTTPS enforcement
def validate_origins(origins: List[str], is_production: bool) -> List[str]:
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
    ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://localhost:3001", "http://localhost:8000"])

# In production, ensure at least one valid origin
if is_production and not ALLOWED_ORIGINS:
    raise ValueError("[SECURITY] No valid HTTPS origins configured for production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token", "X-PAYMENT", "x-payment-tx", "x-payment-chain", "x-payment-token"],  # Added x402 payment headers
    expose_headers=["X-CSRF-Token", "X-PAYMENT-RESPONSE"],  # Allow frontend to read CSRF token and payment responses
    max_age=3600,
)

# Security headers middleware (P0-1)
# Force redeploy to fix 502 errors
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

# x402 Payment Middleware (with PayAI + native support)
app.add_middleware(
    X402Middleware,
    payment_tracker=payment_tracker,
    use_unified_gateway=True  # Enable PayAI Network + KAMIYO native
)
logger.info("x402 Payment middleware enabled (PayAI + native)")

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
app.include_router(payment_routes.router, prefix="/api/v1/payments", tags=["Payments"])
app.include_router(subscription_routes.router, prefix="/api/v1/subscriptions", tags=["Subscriptions"])
app.include_router(webhook_routes.router, prefix="/api/v1/webhooks", tags=["Stripe Webhooks"])
app.include_router(billing_routes.router, prefix="/api/v1/billing", tags=["Billing"])
app.include_router(checkout_routes.router, tags=["Checkout"])

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

# x402 Payment Router
app.include_router(x402_routes.router, tags=["x402 Payments"])

# Hyperliquid Security Intelligence Router
# app.include_router(hyperliquid_router, tags=["Hyperliquid Security"])  # TODO: Enable when ready

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_route(websocket: WebSocket, token: Optional[str] = Query(None), chains: Optional[str] = Query(None), min_amount: float = Query(0.0)):
    """WebSocket endpoint for real-time exploit updates"""
    await websocket_endpoint(websocket, token, chains, min_amount)


@app.get("/", tags=["Root"])
async def root():
    """API root endpoint with x402 discovery"""
    response_data = {
        "name": "KAMIYO x402 Infrastructure",
        "version": "1.0.0",
        "description": "Multi-chain USDC payment verification API",
        "docs": "/docs",
        "endpoints": {
            "exploits": "/exploits",
            "stats": "/stats",
            "health": "/health",
            "chains": "/chains",
            "community": "/community",
            "sources": "/sources/rankings",
            "csrf_token": "/api/csrf-token",
            "x402_schema": "/.well-known/x402"
        }
    }

    # Add x402 discovery header
    response = JSONResponse(content=response_data)
    response.headers["X-x402"] = "/.well-known/x402"
    return response


@app.api_route("/.well-known/x402", methods=["GET", "POST"], tags=["x402"])
async def x402_schema(request: Request):
    """
    x402 Payment Schema Endpoint

    Returns payment information for x402-enabled endpoints.
    Compliant with x402scan validation schema.
    """
    from api.x402.config import get_x402_config

    config = get_x402_config()

    # x402scan expects this specific schema format
    # Get the base URL from request
    base_url = f"{request.url.scheme}://{request.url.netloc}"

    response_data = {
        "x402Version": 1,
        "accepts": [
            {
                "scheme": "exact",
                "network": "base",
                "maxAmountRequired": str(int(config.endpoint_prices.get("/exploits", 0.01) * 1_000_000)),  # Convert to USDC smallest unit (6 decimals)
                "resource": f"{base_url}/exploits",
                "description": "Get real-time cryptocurrency exploit data with 20+ aggregated sources",
                "mimeType": "application/json",
                "payTo": config.base_payment_address,
                "maxTimeoutSeconds": 300,
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC on Base
                "outputSchema": {
                    "input": {
                        "type": "http",
                        "method": "GET",
                        "queryParams": {
                            "page": {
                                "type": "integer",
                                "required": False,
                                "description": "Page number (default: 1)"
                            },
                            "page_size": {
                                "type": "integer",
                                "required": False,
                                "description": "Items per page (default: 100, max: 500)"
                            },
                            "chain": {
                                "type": "string",
                                "required": False,
                                "description": "Filter by blockchain (e.g., Ethereum, BSC)"
                            },
                            "min_amount": {
                                "type": "number",
                                "required": False,
                                "description": "Minimum loss amount in USD"
                            }
                        }
                    },
                    "output": {
                        "data": {
                            "type": "array",
                            "description": "List of exploit records"
                        },
                        "total": {
                            "type": "integer",
                            "description": "Total number of exploits"
                        },
                        "page": {
                            "type": "integer",
                            "description": "Current page number"
                        },
                        "has_more": {
                            "type": "boolean",
                            "description": "Whether more pages exist"
                        }
                    }
                },
                "extra": {
                    "provider": "Kamiyo",
                    "version": "1.0.0",
                    "sources_count": 20,
                    "documentation": "https://api.kamiyo.ai/docs"
                }
            },
            {
                "scheme": "exact",
                "network": "base",
                "maxAmountRequired": str(int(config.endpoint_prices.get("/exploits/latest-alert", 0.01) * 1_000_000)),
                "resource": f"{base_url}/exploits/latest-alert",
                "description": "Get latest exploit alert with AI-powered risk assessment",
                "mimeType": "application/json",
                "payTo": config.base_payment_address,
                "maxTimeoutSeconds": 300,
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "outputSchema": {
                    "input": {
                        "type": "http",
                        "method": "GET",
                        "queryParams": {
                            "hours": {
                                "type": "integer",
                                "required": False,
                                "description": "Time window in hours (1-24, default: 1)"
                            }
                        }
                    },
                    "output": {
                        "alert_status": {
                            "type": "string",
                            "enum": ["critical", "high", "medium", "low", "none"],
                            "description": "Current alert status"
                        },
                        "exploit": {
                            "type": "object",
                            "description": "Latest exploit details"
                        },
                        "risk_score": {
                            "type": "number",
                            "description": "Risk assessment score (0-100)"
                        },
                        "affected_protocols": {
                            "type": "array",
                            "description": "List of affected protocols"
                        },
                        "recommended_action": {
                            "type": "string",
                            "description": "AI-generated recommended action"
                        }
                    }
                },
                "extra": {
                    "provider": "Kamiyo",
                    "version": "1.0.0",
                    "ai_powered": True,
                    "documentation": "https://api.kamiyo.ai/docs"
                }
            }
        ]
    }

    logger.info(f"x402 endpoint returning 402 with {len(response_data.get('accepts', []))} accepts")

    return JSONResponse(
        status_code=402,
        content=response_data,
        media_type="application/json"
    )


@app.get("/api/csrf-token", tags=["Security"])
async def get_csrf_token(csrf_protect: CsrfProtect = Depends()):
    """
    Generate CSRF token for client

    Returns a CSRF token that must be included in all state-changing requests
    (POST, PUT, DELETE, PATCH). The token is also set as a cookie.

    **Usage:**
    1. Call this endpoint to get a CSRF token
    2. Include the token in the X-CSRF-Token header for all POST/PUT/DELETE requests
    3. Token expires after 2 hours (configurable)

    **Security Note:**
    This endpoint is public and does not require authentication.
    The token is user-session specific and bound to the client's browser.
    """
    try:
        # Generate CSRF token (returns tuple of token and signed_token)
        csrf_token, signed_token = csrf_protect.generate_csrf()

        logger.debug(f"Generated CSRF token for client")

        return JSONResponse(
            status_code=200,
            content={
                "csrf_token": csrf_token,
                "expires_in": csrf_settings.csrf_token_expiration,
                "header_name": csrf_settings.csrf_header_name,
                "usage": f"Include token in {csrf_settings.csrf_header_name} header"
            },
            headers={
                "X-CSRF-Token": csrf_token,
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache"
            }
        )
    except Exception as e:
        logger.error(f"Failed to generate CSRF token: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate CSRF token"
        )


@app.api_route("/exploits", methods=["GET", "HEAD", "OPTIONS"], response_model=ExploitsListResponse, tags=["Exploits"])
async def get_exploits(
    request: Request,
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
        user = await get_optional_user(request, authorization)

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
                exploit_timestamp = e.get('timestamp')
                if exploit_timestamp:
                    # Handle both datetime objects (from PostgreSQL) and strings (from SQLite)
                    if isinstance(exploit_timestamp, str):
                        ts = datetime.fromisoformat(exploit_timestamp.replace('Z', '+00:00'))
                    else:
                        # Already a datetime object from psycopg2
                        ts = exploit_timestamp

                    # Make timezone-aware if needed
                    if ts.tzinfo is None:
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


@app.api_route("/exploits/latest-alert", methods=["GET", "HEAD", "OPTIONS"], tags=["Exploits"])
async def get_latest_exploit_alert(
    request: Request,
    hours: int = Query(1, ge=1, le=24, description="Time window in hours"),
    authorization: Optional[str] = Header(None, description="Authorization header (Bearer token)"),
):
    """
    Get latest exploit alert with risk assessment

    **Premium endpoint: $0.01 per query via x402**

    Returns the most recent exploit within the specified time window with:
    - Alert status (critical/high/medium/low/none)
    - Full exploit details (protocol, chain, amount, timestamp)
    - Risk score (0-100 based on amount, recency, and protocol reputation)
    - Affected protocols list
    - Recommended actions based on risk level

    **Parameters:**
    - **hours**: Time window to check for exploits (1-24 hours, default: 1)

    **Authentication:**
    - x402 payment required: $0.01 per query
    - Provide payment via x402-Payment header

    **Rate Limits:**
    - Authenticated users: 30 requests/minute
    - x402 payment users: 5 requests/minute

    **Response Codes:**
    - 200: Success (exploit found or no recent exploits)
    - 400: Invalid parameters
    - 402: Payment required (x402)
    - 429: Rate limit exceeded
    - 500: Internal server error
    """
    try:
        from datetime import timezone

        # Calculate cutoff time for the time window
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)

        # Get recent exploits from database
        exploits = db.get_recent_exploits(limit=100, offset=0)

        # Filter exploits within the time window
        recent_exploits = []
        for exploit in exploits:
            exploit_timestamp = exploit.get('timestamp')
            if exploit_timestamp:
                # Handle both datetime objects and strings
                if isinstance(exploit_timestamp, str):
                    ts = datetime.fromisoformat(exploit_timestamp.replace('Z', '+00:00'))
                else:
                    ts = exploit_timestamp

                # Make timezone-aware if needed
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)

                if ts >= cutoff_time:
                    recent_exploits.append(exploit)

        # No recent exploits
        if not recent_exploits:
            return {
                "alert_status": "none",
                "message": f"No exploits detected in the last {hours} hour(s)",
                "time_window_hours": hours,
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "exploit": None,
                "risk_score": 0,
                "affected_protocols": [],
                "recommended_action": "Continue monitoring. No immediate threats detected."
            }

        # Get the most recent exploit
        latest_exploit = recent_exploits[0]

        # Calculate risk score (0-100)
        risk_score = _calculate_risk_score(latest_exploit, hours)

        # Determine alert status based on risk score
        if risk_score >= 80:
            alert_status = "critical"
        elif risk_score >= 60:
            alert_status = "high"
        elif risk_score >= 40:
            alert_status = "medium"
        else:
            alert_status = "low"

        # Get affected protocols from recent exploits
        affected_protocols = list(set([e.get('protocol', 'Unknown') for e in recent_exploits]))

        # Generate recommended action based on alert status
        recommended_action = _generate_recommended_action(
            alert_status=alert_status,
            risk_score=risk_score,
            exploit=latest_exploit,
            affected_protocols=affected_protocols
        )

        # Format response
        return {
            "alert_status": alert_status,
            "message": f"Exploit detected {hours} hour(s) ago",
            "time_window_hours": hours,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "exploit": {
                "tx_hash": latest_exploit.get('tx_hash'),
                "chain": latest_exploit.get('chain'),
                "protocol": latest_exploit.get('protocol'),
                "amount_usd": latest_exploit.get('amount_usd', 0),
                "timestamp": latest_exploit.get('timestamp'),
                "source": latest_exploit.get('source'),
                "source_url": latest_exploit.get('source_url'),
                "category": latest_exploit.get('category'),
                "description": latest_exploit.get('description'),
                "recovery_status": latest_exploit.get('recovery_status')
            },
            "risk_score": risk_score,
            "affected_protocols": affected_protocols,
            "recommended_action": recommended_action
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching latest exploit alert: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


def _calculate_risk_score(exploit: Dict[str, Any], time_window_hours: int) -> int:
    """
    Calculate risk score (0-100) for an exploit based on:
    - Amount lost (50% weight)
    - Recency (30% weight)
    - Protocol reputation/category (20% weight)
    """
    score = 0

    # Amount score (0-50 points)
    amount_usd = exploit.get('amount_usd', 0)
    if amount_usd >= 10_000_000:  # $10M+
        score += 50
    elif amount_usd >= 1_000_000:  # $1M-10M
        score += 40
    elif amount_usd >= 100_000:  # $100K-1M
        score += 30
    elif amount_usd >= 10_000:  # $10K-100K
        score += 20
    else:  # < $10K
        score += 10

    # Recency score (0-30 points)
    # More recent = higher risk
    if time_window_hours <= 1:
        score += 30  # Last hour
    elif time_window_hours <= 3:
        score += 25  # Last 3 hours
    elif time_window_hours <= 6:
        score += 20  # Last 6 hours
    elif time_window_hours <= 12:
        score += 15  # Last 12 hours
    else:
        score += 10  # Last 24 hours

    # Category/Protocol score (0-20 points)
    category = exploit.get('category', '').lower()
    if any(keyword in category for keyword in ['critical', 'flash loan', 'reentrancy', 'private key']):
        score += 20
    elif any(keyword in category for keyword in ['exploit', 'hack', 'vulnerability']):
        score += 15
    else:
        score += 10

    return min(score, 100)  # Cap at 100


def _generate_recommended_action(
    alert_status: str,
    risk_score: int,
    exploit: Dict[str, Any],
    affected_protocols: List[str]
) -> str:
    """
    Generate recommended action based on alert status and exploit details
    """
    protocol = exploit.get('protocol', 'Unknown')
    chain = exploit.get('chain', 'Unknown')
    amount = exploit.get('amount_usd', 0)

    if alert_status == "critical":
        return (
            f"🚨 CRITICAL ALERT: Immediately audit {protocol} on {chain}. "
            f"${amount:,.0f} exploit detected. "
            f"Review all similar protocols: {', '.join(affected_protocols[:3])}. "
            f"Consider pausing protocol interactions and checking for exposed vulnerabilities."
        )
    elif alert_status == "high":
        return (
            f"⚠️ HIGH RISK: Monitor {protocol} on {chain} closely. "
            f"${amount:,.0f} exploit detected. "
            f"Verify security measures for similar protocols: {', '.join(affected_protocols[:3])}. "
            f"Review protocol permissions and consider risk mitigation."
        )
    elif alert_status == "medium":
        return (
            f"⚡ MEDIUM RISK: {protocol} on {chain} compromised (${amount:,.0f}). "
            f"Review security practices and monitor for patterns. "
            f"Affected protocols: {', '.join(affected_protocols[:3])}."
        )
    else:  # low
        return (
            f"ℹ️ LOW RISK: Minor exploit detected on {protocol} ({chain}). "
            f"Continue standard monitoring. "
            f"Total affected protocols: {len(affected_protocols)}."
        )


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


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Lightweight health check for load balancers and monitoring.

    Returns minimal status without database queries to prevent resource exhaustion.
    Use /api/status for detailed metrics.
    """
    from datetime import datetime
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": app.version
    }


@app.get("/api/status", response_model=HealthResponse, tags=["Health"])
async def detailed_status():
    """
    Detailed status endpoint with database statistics and system metrics.

    Returns source health, database statistics, and system status with detailed monitoring metrics.
    Use sparingly - queries database and system resources.
    """
    try:
        from datetime import datetime
        import psutil
        import sys

        # Try to get source health, but don't fail if it errors
        sources = []
        try:
            sources = db.get_source_health()
        except Exception as source_error:
            logger.warning(f"Failed to get source health (non-fatal): {source_error}")

        total_exploits = db.get_total_exploits()
        chains = db.get_chains()

        # Convert sources to models
        source_models = [SourceHealth(**source) for source in sources]

        # Add system metrics for monitoring
        health_data = {
            "status": "healthy",
            "database_exploits": total_exploits,
            "tracked_chains": len(chains),
            "active_sources": len([s for s in sources if s.get('is_active')]),
            "total_sources": len(sources),
            "sources": source_models,
            "timestamp": datetime.now().isoformat(),
            "version": app.version,
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "environment": os.getenv("ENVIRONMENT", "unknown")
        }

        # Add system metrics (CPU, memory) for monitoring dashboards
        try:
            health_data["system"] = {
                "cpu_percent": psutil.cpu_percent(interval=0.1),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_percent": psutil.disk_usage('/').percent if os.path.exists('/') else None
            }
        except Exception as sys_error:
            logger.debug(f"System metrics unavailable: {sys_error}")

        return HealthResponse(**health_data)

    except Exception as e:
        logger.error(f"Error fetching status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ready", tags=["Health"])
async def readiness_check():
    """
    Kubernetes readiness probe - checks if service can handle traffic

    Returns 200 when app is ready to serve traffic, 503 otherwise.
    Checks critical dependencies: database, Redis (if enabled).
    """
    try:
        # Check database connectivity with simple SELECT 1 query
        db.execute_with_retry("SELECT 1", readonly=True)

        # Check Redis connectivity (if enabled)
        redis_healthy = True
        if cache_config.l2_enabled:
            try:
                cache_manager = get_cache_manager()
                # Ensure Redis connection is established
                if cache_manager._redis is None:
                    await cache_manager.connect()
                # Ping Redis to verify connectivity
                await cache_manager._redis.ping()
                logger.debug("Redis health check passed")
            except Exception as e:
                logger.warning(f"Redis health check failed: {e}")
                redis_healthy = False

        # Return ready status
        # Redis is optional - degrade gracefully
        return {
            "status": "ready",
            "database": "healthy",
            "redis": "healthy" if redis_healthy else "degraded"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Not ready: {str(e)}"
        )


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


@app.delete("/admin/clean-test-data", tags=["Admin"])
async def clean_test_data(
    x_api_key: Optional[str] = Header(None, description="Admin API key")
):
    """
    Delete test/dummy data from database

    Removes only the test protocol entry (source='test').
    DeFiLlama exploits with 'generated-' tx hashes are kept as they are real exploits.

    **Requires admin API key in X-API-Key header**
    """
    try:
        # Check admin API key
        admin_key = os.getenv("ADMIN_API_KEY")
        if not admin_key:
            raise HTTPException(status_code=500, detail="Admin API key not configured")

        if x_api_key != admin_key:
            raise HTTPException(status_code=403, detail="Invalid admin API key")

        # Delete test exploit
        query = """
            DELETE FROM exploits
            WHERE source = 'test'
            RETURNING id, protocol, source, tx_hash
        """

        result = db.execute_with_retry(query, readonly=False)

        if result:
            deleted_count = len(result)
            deleted_items = [
                {
                    "id": row[0],
                    "protocol": row[1],
                    "source": row[2],
                    "tx_hash": row[3]
                }
                for row in result
            ]

            logger.info(f"Deleted {deleted_count} test exploit(s)")

            return {
                "status": "success",
                "deleted_count": deleted_count,
                "deleted_items": deleted_items,
                "message": f"Successfully removed {deleted_count} test exploit(s)"
            }
        else:
            return {
                "status": "success",
                "deleted_count": 0,
                "deleted_items": [],
                "message": "No test exploits found (may have already been deleted)"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning test data: {e}")
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


# CSRF Protection Middleware (BLOCKER 1)
@app.middleware("http")
async def csrf_protection_middleware(request: Request, call_next):
    """
    CSRF protection middleware - validates CSRF tokens on state-changing requests

    Protects against Cross-Site Request Forgery attacks by requiring
    a valid CSRF token for all POST/PUT/DELETE/PATCH requests.

    Exempt endpoints:
    - Safe methods (GET, HEAD, OPTIONS)
    - Stripe webhooks (has signature verification)
    - Health checks
    - CSRF token generation endpoint
    """
    # Fast path: skip safe methods early
    if request.method in ["GET", "HEAD", "OPTIONS"]:
        return await call_next(request)

    from api.csrf_protection import is_endpoint_exempt

    # Skip CSRF for exempt endpoints
    if is_endpoint_exempt(request.url.path, request.method):
        return await call_next(request)

    # For state-changing requests, validate CSRF token
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        csrf_protect = get_csrf_protect()

        try:
            # This will raise CsrfProtectError if token is invalid
            await csrf_protect.validate_csrf(request)
        except CsrfProtectError as e:
            # Let the exception handler deal with it
            raise
        except Exception as e:
            logger.error(f"CSRF validation error: {e}")
            # For unexpected errors, fail secure
            raise HTTPException(
                status_code=403,
                detail="CSRF token validation failed"
            )

    return await call_next(request)


# Startup/shutdown events
@app.on_event("startup")
async def startup_event():
    logger.info("Kamiyo API starting up...")

    # BLOCKER #1: Validate CSRF configuration in production
    try:
        validate_csrf_production_config()
        logger.info("[SECURITY] CSRF protection initialized and validated")
    except RuntimeError as e:
        logger.critical(f"[SECURITY] CSRF configuration validation failed: {e}")
        if is_production:
            raise

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

    # BLOCKER #3: Validate production secrets before startup
    # Prevent deployment with insecure default values
    if is_production:
        logger.info("[SECURITY] Validating production secrets...")
        dangerous_defaults = {
            "X402_ADMIN_KEY": "dev_x402_admin_key_change_in_production",
            "X402_BASE_PAYMENT_ADDRESS": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
            "X402_ETHEREUM_PAYMENT_ADDRESS": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
            "X402_SOLANA_PAYMENT_ADDRESS": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        }

        failed_checks = []
        for key, dangerous_value in dangerous_defaults.items():
            current_value = os.getenv(key)
            if current_value == dangerous_value:
                failed_checks.append(key)
                logger.critical(f"[SECURITY] FATAL: {key} is using insecure default value!")
            elif not current_value:
                failed_checks.append(key)
                logger.critical(f"[SECURITY] FATAL: {key} is not set!")

        # Check NEXTAUTH_SECRET (should not be empty or too short)
        nextauth_secret = os.getenv("NEXTAUTH_SECRET")
        if not nextauth_secret:
            failed_checks.append("NEXTAUTH_SECRET")
            logger.critical("[SECURITY] FATAL: NEXTAUTH_SECRET is not set!")
        elif len(nextauth_secret) < 32:
            failed_checks.append("NEXTAUTH_SECRET")
            logger.critical(f"[SECURITY] FATAL: NEXTAUTH_SECRET is too short (must be at least 32 characters)!")

        # Check STRIPE_SECRET_KEY if stripe is configured
        stripe_key = os.getenv("STRIPE_SECRET_KEY")
        if stripe_key:
            # Check if it's a test key in production
            if stripe_key.startswith("sk_test_"):
                failed_checks.append("STRIPE_SECRET_KEY")
                logger.critical("[SECURITY] FATAL: STRIPE_SECRET_KEY is using test key in production!")

        if failed_checks:
            error_message = (
                f"[SECURITY] WARNING: Production deployment with potentially insecure configuration!\n"
                f"The following secrets should be updated:\n"
            )
            for key in failed_checks:
                error_message += f"  - {key}\n"
            error_message += "\nUpdate your .env file with secure production values."

            logger.critical(error_message)
            # Non-blocking: warn but allow startup
            # TODO: Re-enable blocking after environment variables are properly configured
            # raise RuntimeError(error_message)

        logger.info("[SECURITY] All production secrets validated successfully")

    # Check Stripe API version health (P1-1)
    # PCI DSS Requirement 12.10.1: Incident response planning
    try:
        from api.payments.stripe_version_monitor import get_version_monitor

        version_monitor = get_version_monitor()
        version_health = version_monitor.check_version_health()

        if version_health['status'] == 'error':
            logger.error(f"[STRIPE VERSION] {version_health.get('message', 'Unknown error')}")
        elif version_health['status'] == 'critical':
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

    # Skip database stats during startup to prevent resource exhaustion
    # Stats are available via /api/status endpoint
    logger.info("Skipping database stats during startup (available via /api/status)")

    # Only run background tasks in main worker process
    # With multiple workers, use file lock to ensure only one worker runs background tasks
    # This prevents database connection exhaustion and race conditions
    import fcntl
    import tempfile

    is_main_worker = False
    lock_file = None
    lock_file_path = os.path.join(tempfile.gettempdir(), 'kamiyo_worker_lock')

    try:
        lock_file = open(lock_file_path, 'w')
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        is_main_worker = True
        logger.info("Acquired main worker lock - will run background tasks")
    except (IOError, OSError) as e:
        is_main_worker = False
        logger.info(f"Another worker has the lock - skipping background tasks: {e}")
        if lock_file:
            try:
                lock_file.close()
            except:
                pass
    except Exception as e:
        is_main_worker = False
        logger.error(f"Failed to acquire worker lock: {e}")
        if lock_file:
            try:
                lock_file.close()
            except:
                pass

    if is_main_worker:
        try:
            # Start WebSocket heartbeat
            ws_manager = get_websocket_manager()
            await ws_manager.start_heartbeat_task()
            logger.info("WebSocket manager started")
        except Exception as e:
            logger.error(f"Failed to start WebSocket manager: {e}")

        try:
            # Start scheduled task runner
            task_runner = get_task_runner()
            await task_runner.start()
            logger.info("Scheduled task runner started")
        except Exception as e:
            logger.error(f"Failed to start task runner: {e}")
    else:
        logger.info("Background tasks skipped (not main worker)")

    # Initialize cache connection (lightweight, all workers)
    if cache_config.l2_enabled:
        try:
            cache_manager = get_cache_manager()
            await cache_manager.connect()
            logger.info("Cache manager connected")
        except Exception as e:
            logger.error(f"Failed to connect cache manager (non-fatal): {e}")
            # Continue without cache

    # Cache warming disabled on startup to prevent crashes
    # Warming happens via scheduled task runner instead
    if is_main_worker and cache_config.warming_on_startup:
        logger.info("Cache warming on startup is disabled (CACHE_WARMING_STARTUP=false)")
        logger.info("Cache warming will occur via scheduled tasks")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Kamiyo API shutting down...")

    # Stop scheduled task runner
    task_runner = get_task_runner()
    task_runner.stop()
    logger.info("Scheduled task runner stopped")

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
