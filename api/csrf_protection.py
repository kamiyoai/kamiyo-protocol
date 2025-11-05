# -*- coding: utf-8 -*-
"""
CSRF Protection Configuration for Kamiyo API
Implements Cross-Site Request Forgery protection using Double Submit Cookie pattern

BLOCKER 1 RESOLUTION: Production-grade CSRF protection
"""

import os
import logging
from typing import Optional
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi_csrf_protect import CsrfProtect
from fastapi_csrf_protect.exceptions import CsrfProtectError
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class CsrfSettings(BaseSettings):
    """
    CSRF Protection Settings

    Configuration for CSRF token generation and validation.
    Uses environment variables with secure defaults.
    """

    # Secret key for signing CSRF tokens (MUST be changed in production)
    csrf_secret_key: str = os.getenv(
        "CSRF_SECRET_KEY",
        "CHANGE_THIS_IN_PRODUCTION_USE_32_CHARS_MINIMUM"
    )

    # Token expiration time in seconds (2 hours default)
    csrf_token_expiration: int = int(os.getenv("CSRF_TOKEN_EXPIRATION", "7200"))

    # Cookie settings
    csrf_cookie_name: str = "csrftoken"
    csrf_cookie_samesite: str = "strict"  # Strict for production security
    csrf_cookie_secure: bool = os.getenv("ENVIRONMENT", "development") == "production"
    csrf_cookie_httponly: bool = True  # Prevent JavaScript access
    csrf_cookie_path: str = "/"
    csrf_cookie_domain: Optional[str] = None

    # Header name for CSRF token
    csrf_header_name: str = "X-CSRF-Token"

    # Cookie key for token (used in Double Submit Cookie pattern)
    cookie_key: str = "csrftoken"

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # Ignore extra environment variables not in model


# Global CSRF settings instance
csrf_settings = CsrfSettings()


def get_csrf_config():
    """
    Load CSRF configuration for fastapi-csrf-protect

    Returns configuration as list of tuples for the library.
    """
    return [
        ("secret_key", csrf_settings.csrf_secret_key),
        ("token_location", "header"),  # Accept token from header
        ("cookie_key", csrf_settings.cookie_key),
        ("cookie_path", csrf_settings.csrf_cookie_path),
        ("cookie_domain", csrf_settings.csrf_cookie_domain),
        ("cookie_secure", csrf_settings.csrf_cookie_secure),
        ("cookie_httponly", csrf_settings.csrf_cookie_httponly),
        ("cookie_samesite", csrf_settings.csrf_cookie_samesite),
        ("header_name", csrf_settings.csrf_header_name),
        ("header_type", None),  # No prefix required
        ("max_age", csrf_settings.csrf_token_expiration),
    ]


# Apply configuration using the decorator at module level
@CsrfProtect.load_config
def _load_csrf_config():
    """Configuration loader for CsrfProtect class"""
    return get_csrf_config()


def validate_csrf_production_config():
    """
    Validate CSRF configuration for production deployment

    Ensures secure configuration values are set.

    Raises:
        RuntimeError: If production config is insecure
    """
    is_production = os.getenv("ENVIRONMENT", "development") == "production"

    if not is_production:
        return  # Skip validation in development

    errors = []

    # Check secret key is not default
    if csrf_settings.csrf_secret_key == "CHANGE_THIS_IN_PRODUCTION_USE_32_CHARS_MINIMUM":
        errors.append("CSRF_SECRET_KEY is using insecure default value")

    # Check secret key length
    if len(csrf_settings.csrf_secret_key) < 32:
        errors.append("CSRF_SECRET_KEY must be at least 32 characters")

    # Ensure secure cookies in production
    if not csrf_settings.csrf_cookie_secure:
        errors.append("CSRF cookies must use Secure flag in production (HTTPS only)")

    # Ensure httponly
    if not csrf_settings.csrf_cookie_httponly:
        errors.append("CSRF cookies must use HttpOnly flag")

    # Check SameSite is strict or lax
    if csrf_settings.csrf_cookie_samesite not in ["strict", "lax"]:
        errors.append("CSRF cookie SameSite must be 'strict' or 'lax'")

    if errors:
        error_message = (
            "[SECURITY] CSRF protection configuration is insecure for production:\n"
            + "\n".join(f"  - {error}" for error in errors)
        )
        logger.critical(error_message)
        raise RuntimeError(error_message)

    logger.info("[SECURITY] CSRF protection configuration validated for production")


def csrf_protect_exception_handler(request: Request, exc: CsrfProtectError):
    """
    Custom exception handler for CSRF protection errors

    Returns user-friendly error messages for CSRF violations.

    Args:
        request: FastAPI request object
        exc: CSRF protection exception

    Returns:
        JSONResponse with error details
    """
    logger.warning(
        f"CSRF protection triggered: {exc.message} for {request.method} {request.url.path} "
        f"from {request.client.host if request.client else 'unknown'}"
    )

    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={
            "error": "csrf_token_invalid",
            "message": "CSRF token validation failed. Please refresh the page and try again.",
            "detail": str(exc.message) if not os.getenv("ENVIRONMENT") == "production" else None
        }
    )


def is_endpoint_exempt(path: str, method: str) -> bool:
    """
    Check if endpoint is exempt from CSRF protection

    Some endpoints should not require CSRF tokens:
    - Public GET/HEAD/OPTIONS requests (safe methods)
    - Stripe webhook (has its own signature verification)
    - Health checks
    - CSRF token generation endpoint itself

    Args:
        path: Request path
        method: HTTP method

    Returns:
        True if endpoint is exempt from CSRF protection
    """
    # Safe HTTP methods don't need CSRF protection
    if method in ["GET", "HEAD", "OPTIONS"]:
        return True

    # Exempt paths (these have their own security mechanisms)
    # x402 endpoint must be exempt for POST requests to pass x402scan validation
    exempt_paths = [
        "/api/v1/webhooks/stripe",  # Stripe webhook (signature verified)
        "/api/csrf-token",  # CSRF token generation endpoint
        "/health",  # Health check
        "/ready",  # Readiness probe
        "/",  # Root endpoint
        "/docs",  # API docs
        "/redoc",  # API docs
        "/openapi.json",  # OpenAPI schema
        "/.well-known/x402-schema.json",  # x402 payment schema (public endpoint)
    ]

    # Check exact matches
    if path in exempt_paths:
        logger.debug(f"CSRF exempt endpoint: {path} ({method})")
        return True

    # Check prefix matches
    exempt_prefixes = [
        "/docs",
        "/redoc",
    ]

    for prefix in exempt_prefixes:
        if path.startswith(prefix):
            logger.debug(f"CSRF exempt endpoint (prefix match): {path} ({method})")
            return True

    logger.debug(f"CSRF protected endpoint: {path} ({method})")
    return False


async def get_csrf_token_from_request(request: Request) -> Optional[str]:
    """
    Extract CSRF token from request headers

    Args:
        request: FastAPI request object

    Returns:
        CSRF token string or None if not present
    """
    return request.headers.get(csrf_settings.csrf_header_name)


# Singleton CSRF protect instance
_csrf_protect_instance: Optional[CsrfProtect] = None


def get_csrf_protect() -> CsrfProtect:
    """
    Get or create CSRF protect singleton instance

    Returns:
        CsrfProtect instance
    """
    global _csrf_protect_instance

    if _csrf_protect_instance is None:
        _csrf_protect_instance = CsrfProtect()

    return _csrf_protect_instance


# Export public API
__all__ = [
    "CsrfSettings",
    "csrf_settings",
    "get_csrf_config",
    "validate_csrf_production_config",
    "csrf_protect_exception_handler",
    "is_endpoint_exempt",
    "get_csrf_token_from_request",
    "get_csrf_protect",
]
