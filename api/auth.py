# -*- coding: utf-8 -*-
"""
Authentication helpers for API
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import Header, HTTPException
from typing import Optional
import logging

from database import get_db

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
