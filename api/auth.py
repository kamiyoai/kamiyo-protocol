# -*- coding: utf-8 -*-
"""
Authentication helpers for API

Version 2.0 - Enhanced with P0 Security Fixes:
- P0-1: Redis-backed distributed token revocation
- P0-2: Timing-safe token validation with rate limiting
- P0-3: Deterministic idempotency key generation

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

# Import JWT manager with P0 fixes
try:
    from api.auth.jwt_manager import get_jwt_manager
    JWT_ENABLED = True
except ImportError as e:
    logger.warning(f"JWT authentication not available: {e}")
    JWT_ENABLED = False


async def get_current_user(
    authorization: Optional[str] = Header(None),
    request: Optional[Request] = None
):
    """
    Get current user from Authorization header.

    Supports both:
    1. JWT tokens: Authorization: Bearer {jwt_token}
    2. API keys (legacy): Authorization: Bearer {api_key}

    JWT tokens include P0 security fixes:
    - Redis-backed distributed revocation
    - Timing-safe validation with rate limiting
    - Deterministic idempotency

    Args:
        authorization: Authorization header
        request: FastAPI request (for IP extraction)

    Returns:
        User dictionary with id, email, tier

    Raises:
        HTTPException: If authentication fails
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

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

            # JWT token verified successfully with P0 security checks
            logger.debug(f"JWT authentication successful: user={payload.get('sub')}")

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

            # Try API key fallback for backward compatibility
            logger.debug("JWT verification failed, trying API key authentication")

        except Exception as e:
            # Unexpected error in JWT validation
            logger.error(f"JWT validation error: {e}")
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
    authorization: Optional[str] = Header(None),
    request: Optional[Request] = None
) -> Optional[Dict[str, Any]]:
    """
    Get current user if authentication provided, otherwise return None (free tier).

    This allows endpoints to be accessed without authentication (free tier)
    or with authentication (paid tiers).

    Supports both JWT tokens and API keys with P0 security fixes.

    Args:
        authorization: Optional Authorization header
        request: Optional FastAPI request

    Returns:
        User dictionary if authenticated, None otherwise
    """
    if not authorization:
        # No auth provided, treat as free tier
        return None

    try:
        # Reuse get_current_user logic for consistency
        user = await get_current_user(authorization, request)
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
    request: Optional[Request] = None
) -> Dict[str, Any]:
    """
    Login user and return JWT tokens with P0 security fixes.

    Args:
        email: User email
        password: User password
        request: FastAPI request

    Returns:
        Dictionary with access_token, refresh_token, and user info

    Raises:
        HTTPException: If login fails
    """
    if not JWT_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="JWT authentication not enabled"
        )

    # Verify user credentials
    # TODO: Implement proper password hashing verification
    db = get_db()
    user = db.conn.execute(
        "SELECT id, email, tier FROM users WHERE email = ?",
        (email,)
    ).fetchone()

    if not user:
        logger.warning(f"Login attempt for non-existent user: {email}")
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

    logger.info(f"User logged in: email={user_email}, user_id={user_id}")

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
    request: Optional[Request] = None
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
    request: Optional[Request] = None
) -> Dict[str, Any]:
    """
    Refresh access token using refresh token.

    Args:
        refresh_token: Refresh token
        request: FastAPI request

    Returns:
        New access token data

    Raises:
        HTTPException: If refresh fails
    """
    if not JWT_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="JWT authentication not enabled"
        )

    jwt_manager = get_jwt_manager()

    # Verify refresh token
    payload = jwt_manager.verify_token(refresh_token, request=request)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=401,
            detail="Invalid token type"
        )

    # Get user info
    user_id = payload.get("sub")
    user_email = payload.get("email")

    db = get_db()
    user = db.conn.execute(
        "SELECT tier FROM users WHERE id = ? AND email = ?",
        (user_id, user_email)
    ).fetchone()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    user_tier = user[0]

    # Generate new access token
    access_token_data = jwt_manager.create_access_token(
        user_id=user_id,
        user_email=user_email,
        tier=user_tier
    )

    logger.info(f"Access token refreshed: user={user_id}")

    return access_token_data


def get_auth_security_stats() -> Dict[str, Any]:
    """
    Get comprehensive security statistics from all auth components.

    Returns:
        Dictionary with security statistics
    """
    if not JWT_ENABLED:
        return {
            "jwt_enabled": False,
            "message": "JWT authentication not enabled"
        }

    jwt_manager = get_jwt_manager()
    return {
        "jwt_enabled": True,
        "security_stats": jwt_manager.get_security_stats(),
        "health": jwt_manager.health_check()
    }
