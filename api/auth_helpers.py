# -*- coding: utf-8 -*-
"""
Authentication helpers for API

Version 3.0 - Enhanced with P0 + P1 Security Fixes:
- P0-1: Redis-backed distributed token revocation
- P0-2: Timing-safe token validation with rate limiting
- P0-3: Deterministic idempotency key generation
- P1-1: JWT secret rotation with zero downtime
- P1-2: Refresh token rotation (one-time use)
- P1-3: Brute force protection with progressive lockout
- P1-4: Explicit algorithm enforcement
- P1-5: Cryptographically random JTI

Supports both:
1. JWT token authentication (new, secure)
2. API key authentication (legacy, backward compatible)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import Header, HTTPException, Request, Depends
from typing import Optional, Dict, Any
import logging

from database import get_db
from api.subscriptions.tiers import TierName, get_tier

logger = logging.getLogger(__name__)

# Import JWT manager with P0 + P1 fixes
try:
    from api.auth.jwt_manager import get_jwt_manager
    from api.auth.rate_limiter import get_rate_limiter
    JWT_ENABLED = True
except ImportError as e:
    logger.warning(f"JWT authentication not available: {e}")
    JWT_ENABLED = False


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    """
    Get current user from Authorization header.

    Supports both:
    1. JWT tokens: Authorization: Bearer {jwt_token}
    2. API keys (legacy): Authorization: Bearer {api_key}

    JWT tokens include P0 + P1 security fixes:
    - Redis-backed distributed revocation
    - Timing-safe validation with rate limiting
    - Deterministic idempotency
    - Secret rotation support
    - Brute force protection

    Args:
        request: FastAPI request (for IP extraction and rate limiting)
        authorization: Authorization header

    Returns:
        User dictionary with id, email, tier

    Raises:
        HTTPException: If authentication fails or rate limited
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    # P1-3 FIX: Get client IP for rate limiting
    client_ip = request.client.host if request.client else "unknown"

    # Extract token from Bearer format
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    token = parts[1]

    # Try JWT authentication first (if enabled)
    if JWT_ENABLED:
        try:
            jwt_manager = get_jwt_manager()
            payload = jwt_manager.verify_token(token, request=request)

            # JWT token verified successfully with P0 + P1 security checks
            logger.debug(f"JWT authentication successful: user={payload.get('sub')}")

            # P1-3 FIX: Clear rate limit on successful authentication
            rate_limiter = get_rate_limiter()
            rate_limiter.check_auth_attempt(client_ip, is_success=True)

            return {
                "id": payload.get("sub"),
                "email": payload.get("email"),
                "tier": payload.get("tier", "free"),
                "auth_method": "jwt"
            }

        except HTTPException as e:
            # JWT verification failed - could be invalid JWT or rate limit exceeded
            # Don't fall back to API key if it's a rate limit issue
            if e.status_code == 429:
                raise

            # P1-3 FIX: Track failed JWT authentication attempt
            try:
                rate_limiter = get_rate_limiter()
                rate_limiter.check_auth_attempt(client_ip, is_success=False)
            except Exception as rl_error:
                logger.error(f"Rate limiter error: {rl_error}")

            # Try API key fallback for backward compatibility
            logger.debug("JWT verification failed, trying API key authentication")

        except Exception as e:
            # Unexpected error in JWT validation
            logger.error(f"JWT validation error: {e}")

            # P1-3 FIX: Track failed attempt
            try:
                rate_limiter = get_rate_limiter()
                rate_limiter.check_auth_attempt(client_ip, is_success=False)
            except Exception as rl_error:
                logger.error(f"Rate limiter error: {rl_error}")

            # Fall through to API key authentication

    # Fallback to API key authentication (legacy)
    api_key = token

    db = get_db()
    user = db.conn.execute(
        "SELECT id, email, tier FROM users WHERE api_key = ?",
        (api_key,)
    ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    logger.debug(f"API key authentication successful: user={user[0]}")

    return {
        "id": user[0],
        "email": user[1],
        "tier": user[2],
        "auth_method": "api_key"
    }


async def get_optional_user(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> Optional[Dict[str, Any]]:
    """
    Get current user if authentication provided, otherwise return None (free tier).

    This allows endpoints to be accessed without authentication (free tier)
    or with authentication (paid tiers).

    Supports both JWT tokens and API keys with P0 security fixes.

    Args:
        request: FastAPI request
        authorization: Optional Authorization header

    Returns:
        User dictionary if authenticated, None otherwise
    """
    if not authorization:
        # No auth provided, treat as free tier
        return None

    try:
        # Reuse get_current_user logic for consistency
        user = await get_current_user(request, authorization)
        return user

    except HTTPException as e:
        # Authentication failed, but this is optional auth
        logger.debug(f"Optional authentication failed: {e.detail}")
        return None

    except Exception as e:
        logger.error(f"Error getting optional user: {e}")
        return None


def get_user_tier_name(user: Optional[Dict[str, Any]]) -> TierName:
    """
    Get TierName enum for user

    Args:
        user: User dict from get_optional_user or get_current_user, or None for free tier

    Returns:
        TierName enum
    """
    if not user or not user.get('tier'):
        return TierName.FREE

    tier_str = user['tier'].lower()
    tier_map = {
        'free': TierName.FREE,
        'basic': TierName.BASIC,
        'pro': TierName.PRO,
        'team': TierName.TEAM,
        'enterprise': TierName.ENTERPRISE
    }

    return tier_map.get(tier_str, TierName.FREE)


def has_real_time_access(user: Optional[Dict[str, Any]]) -> bool:
    """
    Check if user has real-time data access

    Free tier users have delayed data (24h delay)
    Paid tier users have real-time data

    Args:
        user: User dict from get_optional_user or get_current_user, or None for free tier

    Returns:
        True if user has real-time access, False if data should be delayed
    """
    tier_name = get_user_tier_name(user)
    tier_config = get_tier(tier_name)
    return tier_config.real_time_alerts


# ============================================================================
# JWT Authentication Endpoints (New in v2.0)
# ============================================================================

async def login_with_jwt(
    email: str,
    password: str,
    request: Request
) -> Dict[str, Any]:
    """
    Login user and return JWT tokens with P0 + P1 security fixes.

    P1-3 FIX: Includes brute force protection with progressive lockout.

    Args:
        email: User email
        password: User password
        request: FastAPI request (for IP extraction and rate limiting)

    Returns:
        Dictionary with access_token, refresh_token, and user info

    Raises:
        HTTPException: If login fails or rate limited
    """
    if not JWT_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="JWT authentication not enabled"
        )

    # P1-3 FIX: Get client IP for rate limiting
    client_ip = request.client.host if request.client else "unknown"

    # P1-3 FIX: Check rate limit BEFORE attempting authentication
    rate_limiter = get_rate_limiter()
    rate_limit_result = rate_limiter.check_auth_attempt(f"ip:{client_ip}", is_success=False)

    if not rate_limit_result.allowed:
        logger.warning(
            f"Rate limit exceeded for login attempt from {client_ip}: "
            f"{rate_limit_result.attempts} attempts, retry after {rate_limit_result.retry_after}s"
        )
        raise HTTPException(
            status_code=429,
            detail=rate_limit_result.message,
            headers={"Retry-After": str(rate_limit_result.retry_after)}
        )

    # Verify user credentials
    # TODO: Implement proper password hashing verification
    db = get_db()
    user = db.conn.execute(
        "SELECT id, email, tier FROM users WHERE email = ?",
        (email,)
    ).fetchone()

    if not user:
        logger.warning(f"Login attempt for non-existent user: {email} from IP: {client_ip}")
        # P1-3 FIX: Track failed attempt by email too
        rate_limiter.check_auth_attempt(f"email:{email}", is_success=False)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = str(user[0])
    user_email = user[1]
    user_tier = user[2]

    # Generate JWT tokens with P0 fixes
    jwt_manager = get_jwt_manager()

    access_token_data = jwt_manager.create_access_token(
        user_id=user_id,
        user_email=user_email,
        tier=user_tier
    )

    refresh_token_data = jwt_manager.create_refresh_token(
        user_id=user_id,
        user_email=user_email
    )

    logger.info(f"User logged in: email={user_email}, user_id={user_id}, ip={client_ip}")

    # P1-3 FIX: Clear rate limits on successful authentication
    rate_limiter.check_auth_attempt(f"ip:{client_ip}", is_success=True)
    rate_limiter.check_auth_attempt(f"email:{user_email}", is_success=True)

    return {
        "access_token": access_token_data["access_token"],
        "refresh_token": refresh_token_data["refresh_token"],
        "token_type": "bearer",
        "expires_in": access_token_data["expires_in"],
        "user": {
            "id": user_id,
            "email": user_email,
            "tier": user_tier
        }
    }


async def logout_with_jwt(
    authorization: str,
    request: Request
) -> Dict[str, str]:
    """
    Logout user by revoking JWT token (P0-1 fix).

    This uses Redis-backed distributed revocation to ensure
    the token is revoked across all API instances.

    Args:
        authorization: Authorization header with JWT token
        request: FastAPI request

    Returns:
        Success message

    Raises:
        HTTPException: If logout fails
    """
    if not JWT_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="JWT authentication not enabled"
        )

    # Extract token
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format"
        )

    token = parts[1]

    # Revoke token using Redis-backed store (P0-1 FIX)
    jwt_manager = get_jwt_manager()
    jwt_manager.revoke_token(token, reason="user_logout")

    logger.info("User logged out successfully")

    return {
        "message": "Logged out successfully",
        "status": "success"
    }


async def refresh_jwt_token(
    refresh_token: str,
    request: Request
) -> Dict[str, Any]:
    """
    Refresh access token using refresh token with rotation (P1-2 fix).

    OWASP Best Practice: Refresh tokens are one-time use.
    - Old refresh token is revoked
    - NEW access token AND NEW refresh token are returned

    Args:
        refresh_token: Current refresh token
        request: FastAPI request

    Returns:
        Dictionary with NEW access_token AND NEW refresh_token

    Raises:
        HTTPException: If refresh fails
    """
    if not JWT_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="JWT authentication not enabled"
        )

    jwt_manager = get_jwt_manager()

    # P1-2 FIX: Use refresh_access_token which implements token rotation
    # This returns BOTH new access token and new refresh token
    try:
        new_access_token_data, new_refresh_token_data = jwt_manager.refresh_access_token(
            refresh_token=refresh_token,
            request=request
        )

        logger.info(f"Token refresh successful: user={new_access_token_data.get('jti')}")

        # Return BOTH new tokens
        return {
            "access_token": new_access_token_data["access_token"],
            "refresh_token": new_refresh_token_data["refresh_token"],  # P1-2 FIX: Return new refresh token
            "token_type": "bearer",
            "expires_in": new_access_token_data["expires_in"],
            "access_token_expires_at": new_access_token_data["expires_at"],
            "refresh_token_expires_at": new_refresh_token_data["expires_at"]
        }

    except Exception as e:
        logger.error(f"Token refresh failed: {e}")
        raise


def get_auth_security_stats() -> Dict[str, Any]:
    """
    Get comprehensive security statistics from all auth components.

    Returns:
        Dictionary with security statistics including P1 fixes
    """
    if not JWT_ENABLED:
        return {
            "jwt_enabled": False,
            "message": "JWT authentication not enabled"
        }

    jwt_manager = get_jwt_manager()
    rate_limiter = get_rate_limiter()

    return {
        "jwt_enabled": True,
        "security_stats": jwt_manager.get_security_stats(),
        "rate_limiter": rate_limiter.get_stats(),
        "health": {
            "jwt_manager": jwt_manager.health_check(),
            "rate_limiter": rate_limiter.health_check()
        },
        "p1_fixes": {
            "P1-1": "JWT secret rotation with zero downtime",
            "P1-2": "Refresh token rotation (one-time use)",
            "P1-3": "Brute force protection with progressive lockout",
            "P1-4": "Explicit algorithm enforcement",
            "P1-5": "Cryptographically random JTI (UUID4)"
        }
    }
