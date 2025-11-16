# -*- coding: utf-8 -*-
"""
KAMIYO x402 Payment Facilitator API
FastAPI application for HTTP 402 Payment Required standard
"""

import sys
import os

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, Header, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import logging

# x402 Payment System
from api.x402 import routes as x402_routes
from api.x402.middleware import X402Middleware
from api.x402.routes import payment_tracker

# Stripe Payment System
from api.payments import routes as payment_routes
from api.subscriptions import routes as subscription_routes
from api.webhooks import routes as webhook_routes
from api.billing import routes as billing_routes

# Cache imports
from api.middleware.cache_middleware import CacheMiddleware
from caching.cache_manager import get_cache_manager
from config.cache_config import get_cache_config

# Rate limiting
from api.middleware.rate_limiter import RateLimitMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# CSRF Protection
from api.csrf_protection import (
    get_csrf_protect,
    csrf_protect_exception_handler,
    validate_csrf_production_config,
    csrf_settings
)
from fastapi_csrf_protect import CsrfProtect
from fastapi_csrf_protect.exceptions import CsrfProtectError

# PCI logging filter
from api.payments.pci_logging_filter import setup_pci_compliant_logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get cache configuration
cache_config = get_cache_config()

# Create FastAPI app
app = FastAPI(
    title="KAMIYO x402 Payment Facilitator",
    description="HTTP 402 Payment Required - Monetize your API with crypto payments",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add exception handlers
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(CsrfProtectError, csrf_protect_exception_handler)

# CORS middleware
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

ALLOWED_ORIGINS = validate_origins(raw_origins, is_production)

if not is_production:
    ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://localhost:8000"])

if is_production and not ALLOWED_ORIGINS:
    raise ValueError("[SECURITY] No valid HTTPS origins configured for production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token", "X-Payment-Token", "X-Payment-Tx", "X-Payment-Chain"],
    expose_headers=["X-CSRF-Token", "X-Payment-Required"],
    max_age=3600,
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://api.kamiyo.ai; "
        "frame-ancestors 'none';"
    )

    if is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response

# Rate limiting middleware
use_redis_rate_limit = is_production and os.getenv("REDIS_URL")
app.add_middleware(
    RateLimitMiddleware,
    use_redis=use_redis_rate_limit,
    redis_url=os.getenv("REDIS_URL")
)
logger.info(f"Rate limiting middleware enabled (Redis: {use_redis_rate_limit})")

# x402 Payment Middleware
app.add_middleware(
    X402Middleware,
    payment_tracker=payment_tracker
)
logger.info("x402 Payment middleware enabled")

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

# Include routers
app.include_router(x402_routes.router, tags=["x402 Payments"])
app.include_router(payment_routes.router, prefix="/api/v1/payments", tags=["Stripe Payments"])
app.include_router(subscription_routes.router, prefix="/api/v1/subscriptions", tags=["Subscriptions"])
app.include_router(webhook_routes.router, prefix="/api/v1/webhooks", tags=["Webhooks"])
app.include_router(billing_routes.router, prefix="/api/v1/billing", tags=["Billing"])

# Root endpoint
@app.get("/", tags=["Info"])
async def root():
    """API root - x402 Payment Facilitator information"""
    return {
        "name": "KAMIYO x402 Payment Facilitator",
        "version": "2.0.0",
        "description": "HTTP 402 Payment Required - Monetize your API with cryptocurrency payments",
        "features": [
            "Multi-chain support (Base, Ethereum, Solana)",
            "Direct wallet-to-wallet payments",
            "No KYC required",
            "Pay-per-use pricing",
            "Instant settlement"
        ],
        "documentation": "/docs",
        "endpoints": {
            "pricing": "/x402/pricing",
            "verify_payment": "/x402/verify",
            "token_status": "/x402/token/status",
            "supported_chains": "/x402/chains",
            "csrf_token": "/api/csrf-token"
        },
        "payment_methods": [
            "USDC on Base Network",
            "USDC on Ethereum",
            "USDC on Solana"
        ],
        "website": "https://kamiyo.ai",
        "docs": "https://docs.kamiyo.ai/x402"
    }

# CSRF token endpoint
@app.get("/api/csrf-token", tags=["Security"])
async def get_csrf_token(csrf_protect: CsrfProtect = Depends()):
    """
    Generate CSRF token for client

    Returns a CSRF token that must be included in all state-changing requests.
    Required for POST, PUT, DELETE, PATCH requests.
    """
    try:
        csrf_token = csrf_protect.generate_csrf()

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
        raise HTTPException(
            status_code=500,
            detail="Failed to generate CSRF token"
        )

# Health check
@app.get("/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint

    Returns system health status for monitoring.
    """
    from datetime import datetime

    return {
        "status": "healthy",
        "service": "kamiyo-x402",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat(),
        "components": {
            "api": "operational",
            "x402": "operational",
            "payments": "operational"
        }
    }

# Readiness check
@app.get("/ready", tags=["Health"])
async def readiness_check():
    """
    Readiness probe for Kubernetes

    Checks if service can handle traffic.
    """
    try:
        # Check Redis if enabled
        redis_healthy = True
        if cache_config.l2_enabled:
            try:
                cache_manager = get_cache_manager()
                if cache_manager._redis is None:
                    await cache_manager.connect()
                await cache_manager._redis.ping()
            except Exception as e:
                logger.warning(f"Redis health check failed: {e}")
                redis_healthy = False

        return {
            "status": "ready",
            "redis": "healthy" if redis_healthy else "degraded"
        }

    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Not ready: {str(e)}"
        )

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not found",
            "detail": str(exc.detail) if hasattr(exc, 'detail') else "Resource not found",
            "documentation": "/docs"
        }
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )

# CSRF Protection Middleware
@app.middleware("http")
async def csrf_protection_middleware(request: Request, call_next):
    """CSRF protection for state-changing requests"""
    from api.csrf_protection import is_endpoint_exempt

    if is_endpoint_exempt(request.url.path, request.method):
        return await call_next(request)

    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        csrf_protect = get_csrf_protect()
        try:
            await csrf_protect.validate_csrf(request)
        except CsrfProtectError:
            raise
        except Exception as e:
            logger.error(f"CSRF validation error: {e}")
            raise HTTPException(status_code=403, detail="CSRF token validation failed")

    return await call_next(request)

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("KAMIYO x402 Payment Facilitator starting up...")

    # Validate CSRF configuration
    try:
        validate_csrf_production_config()
        logger.info("[SECURITY] CSRF protection initialized")
    except RuntimeError as e:
        logger.critical(f"[SECURITY] CSRF validation failed: {e}")
        if is_production:
            raise

    # Initialize PCI-compliant logging
    try:
        setup_pci_compliant_logging(
            apply_to_root=True,
            apply_to_loggers=['api.payments', 'api.subscriptions', 'stripe'],
            log_level=os.getenv('LOG_LEVEL', 'INFO')
        )
        logger.info("[PCI COMPLIANCE] Logging filter initialized")
    except Exception as e:
        logger.critical(f"[PCI COMPLIANCE] Failed to initialize logging: {e}")

    # Validate production secrets
    if is_production:
        logger.info("[SECURITY] Validating production configuration...")

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
                logger.critical(f"[SECURITY] {key} using insecure default!")
            elif not current_value:
                failed_checks.append(key)
                logger.critical(f"[SECURITY] {key} not set!")

        # Check Stripe key
        stripe_key = os.getenv("STRIPE_SECRET_KEY")
        if stripe_key and stripe_key.startswith("sk_test_"):
            failed_checks.append("STRIPE_SECRET_KEY")
            logger.critical("[SECURITY] Using test Stripe key in production!")

        if failed_checks:
            error_msg = f"[SECURITY] Production blocked due to insecure config: {', '.join(failed_checks)}"
            logger.critical(error_msg)
            raise RuntimeError(error_msg)

        logger.info("[SECURITY] Production configuration validated")

    # Check Stripe version
    try:
        from api.payments.stripe_version_monitor import get_version_monitor
        version_monitor = get_version_monitor()
        version_health = version_monitor.check_version_health()

        if version_health['status'] == 'critical':
            logger.critical(f"[STRIPE] API version {version_health['version']} is {version_health['age_days']} days old")
        elif version_health['status'] == 'warning':
            logger.warning(f"[STRIPE] API version {version_health['version']} is {version_health['age_days']} days old")
        else:
            logger.info(f"[STRIPE] API version {version_health['version']} healthy")
    except Exception as e:
        logger.error(f"[STRIPE] Version check failed: {e}")

    # Initialize cache
    if cache_config.l2_enabled:
        try:
            cache_manager = get_cache_manager()
            await cache_manager.connect()
            logger.info("Cache manager connected")
        except Exception as e:
            logger.error(f"Failed to connect cache: {e}")

    logger.info("✅ x402 Payment Facilitator ready")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("KAMIYO x402 shutting down...")

    # Disconnect cache
    if cache_config.l2_enabled:
        try:
            cache_manager = get_cache_manager()
            await cache_manager.disconnect()
            logger.info("Cache disconnected")
        except Exception as e:
            logger.error(f"Failed to disconnect cache: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main_x402:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
