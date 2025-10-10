# -*- coding: utf-8 -*-
"""
Authentication helpers for API
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import Header, HTTPException
from typing import Optional, Dict, Any
import logging

from database import get_db
from api.subscriptions.tiers import TierName, get_tier

logger = logging.getLogger(__name__)


async def get_current_user(authorization: Optional[str] = Header(None)):
    """
    Get current user from API key in Authorization header

    Expects: Authorization: Bearer {api_key}
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    # Extract API key from Bearer token
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    api_key = parts[1]

    # Look up user by API key
    db = get_db()
    user = db.conn.execute(
        "SELECT id, email, tier FROM users WHERE api_key = ?",
        (api_key,)
    ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return {
        "id": user[0],
        "email": user[1],
        "tier": user[2]
    }


async def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """
    Get current user from API key if provided, otherwise return None (free tier)

    This allows endpoints to be accessed without authentication (free tier)
    or with authentication (paid tiers)

    Expects: Authorization: Bearer {api_key}
    """
    if not authorization:
        # No auth provided, treat as free tier
        return None

    try:
        # Extract API key from Bearer token
        parts = authorization.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            logger.warning("Invalid authorization header format")
            return None

        api_key = parts[1]

        # Look up user by API key
        db = get_db()
        user = db.conn.execute(
            "SELECT id, email, tier FROM users WHERE api_key = ?",
            (api_key,)
        ).fetchone()

        if not user:
            logger.warning(f"Invalid API key provided")
            return None

        return {
            "id": user[0],
            "email": user[1],
            "tier": user[2]
        }
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
