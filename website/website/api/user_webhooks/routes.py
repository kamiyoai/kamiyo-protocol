# -*- coding: utf-8 -*-
"""
User Webhook API Routes for Kamiyo
CRUD endpoints for user-defined webhook endpoints
"""

import os
import sys
import json
import logging
import secrets
import hmac
import hashlib
import time
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from api.database import get_db
from api.user_webhooks.models import (
    WebhookCreate,
    WebhookUpdate,
    WebhookResponse,
    WebhookListResponse,
    WebhookDeliveryListResponse,
    WebhookTestResponse
)

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v1/user-webhooks", tags=["user-webhooks"])

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


# ==========================================
# AUTHENTICATION
# ==========================================

def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> dict:
    """
    Get current user from API key

    Args:
        authorization: Bearer token from header
        db: Database session

    Returns:
        User dict with id, email, tier

    Raises:
        HTTPException: If auth fails
    """
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid authorization header"
        )

    api_key = authorization.replace('Bearer ', '')

    # Query user by API key
    result = db.execute(
        "SELECT id, email, tier FROM users WHERE api_key = ?",
        (api_key,)
    ).fetchone()

    if not result:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )

    return {
        'id': result[0],
        'email': result[1],
        'tier': result[2]
    }


def check_webhook_permission(user: dict):
    """
    Check if user tier allows webhooks

    Args:
        user: User dict from get_current_user

    Raises:
        HTTPException: If user tier doesn't allow webhooks
    """
    # Only Team and Enterprise tiers get webhooks
    allowed_tiers = ['team', 'enterprise']

    if user['tier'] not in allowed_tiers:
        raise HTTPException(
            status_code=403,
            detail=f"Webhook endpoints require Team or Enterprise tier (current: {user['tier']})"
        )


def get_webhook_limit(tier: str) -> int:
    """Get max webhook endpoints for tier"""
    limits = {
        'free': 0,
        'pro': 0,
        'team': 5,
        'enterprise': 50
    }
    return limits.get(tier, 0)


# ==========================================
# CRUD ENDPOINTS
# ==========================================

@router.post("", response_model=WebhookResponse)
@limiter.limit("10/minute")
async def create_webhook(
    request: Request,
    webhook: WebhookCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Create a new webhook endpoint

    **Requires**: Team or Enterprise tier

    Returns webhook with secret (SAVE THIS - only shown once)
    """
    check_webhook_permission(user)

    # Check webhook limit for tier
    existing_count = db.execute(
        "SELECT COUNT(*) FROM user_webhooks WHERE user_id = ?",
        (user['id'],)
    ).fetchone()[0]

    webhook_limit = get_webhook_limit(user['tier'])

    if existing_count >= webhook_limit:
        raise HTTPException(
            status_code=403,
            detail=f"Webhook limit reached ({webhook_limit} for {user['tier']} tier)"
        )

    # Generate secret for HMAC signatures
    secret = secrets.token_urlsafe(32)

    # Convert lists to JSON
    chains_json = json.dumps(webhook.chains) if webhook.chains else None
    protocols_json = json.dumps(webhook.protocols) if webhook.protocols else None
    categories_json = json.dumps(webhook.categories) if webhook.categories else None

    # Insert webhook
    cursor = db.execute(
        """
        INSERT INTO user_webhooks (
            user_id, name, url, secret,
            min_amount_usd, chains, protocols, categories
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user['id'],
            webhook.name,
            str(webhook.url),
            secret,
            webhook.min_amount_usd,
            chains_json,
            protocols_json,
            categories_json
        )
    )
    db.commit()

    webhook_id = cursor.lastrowid

    # Fetch created webhook
    result = db.execute(
        "SELECT * FROM user_webhooks WHERE id = ?",
        (webhook_id,)
    ).fetchone()

    logger.info(f"Created webhook {webhook_id} for user {user['id']}")

    return _row_to_webhook(result)


@router.get("", response_model=WebhookListResponse)
async def list_webhooks(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    List all webhooks for current user

    **Note**: Secrets are masked (shown only on creation)
    """
    check_webhook_permission(user)

    results = db.execute(
        "SELECT * FROM user_webhooks WHERE user_id = ? ORDER BY created_at DESC",
        (user['id'],)
    ).fetchall()

    webhooks = []
    for row in results:
        wh = _row_to_webhook(row)
        # Mask secret (only show first 8 chars)
        wh.secret = wh.secret[:8] + "..." if wh.secret else "***"
        webhooks.append(wh)

    return WebhookListResponse(
        webhooks=webhooks,
        total=len(webhooks)
    )


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get single webhook details

    **Note**: Secret is masked
    """
    check_webhook_permission(user)

    result = db.execute(
        "SELECT * FROM user_webhooks WHERE id = ? AND user_id = ?",
        (webhook_id, user['id'])
    ).fetchone()

    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found"
        )

    wh = _row_to_webhook(result)
    # Mask secret
    wh.secret = wh.secret[:8] + "..." if wh.secret else "***"

    return wh


@router.patch("/{webhook_id}", response_model=WebhookResponse)
@limiter.limit("10/minute")
async def update_webhook(
    request: Request,
    webhook_id: int,
    webhook: WebhookUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Update webhook settings

    Only provided fields will be updated
    """
    check_webhook_permission(user)

    # Check webhook exists
    existing = db.execute(
        "SELECT id FROM user_webhooks WHERE id = ? AND user_id = ?",
        (webhook_id, user['id'])
    ).fetchone()

    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found"
        )

    # Build UPDATE query dynamically
    updates = []
    params = []

    if webhook.name is not None:
        updates.append("name = ?")
        params.append(webhook.name)

    if webhook.url is not None:
        updates.append("url = ?")
        params.append(str(webhook.url))

    if webhook.is_active is not None:
        updates.append("is_active = ?")
        params.append(webhook.is_active)

    if webhook.min_amount_usd is not None:
        updates.append("min_amount_usd = ?")
        params.append(webhook.min_amount_usd)

    if webhook.chains is not None:
        updates.append("chains = ?")
        params.append(json.dumps(webhook.chains))

    if webhook.protocols is not None:
        updates.append("protocols = ?")
        params.append(json.dumps(webhook.protocols))

    if webhook.categories is not None:
        updates.append("categories = ?")
        params.append(json.dumps(webhook.categories))

    if not updates:
        raise HTTPException(
            status_code=400,
            detail="No fields to update"
        )

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.extend([webhook_id, user['id']])

    db.execute(
        f"UPDATE user_webhooks SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
        params
    )
    db.commit()

    logger.info(f"Updated webhook {webhook_id} for user {user['id']}")

    # Return updated webhook
    result = db.execute(
        "SELECT * FROM user_webhooks WHERE id = ?",
        (webhook_id,)
    ).fetchone()

    wh = _row_to_webhook(result)
    wh.secret = wh.secret[:8] + "..." if wh.secret else "***"

    return wh


@router.delete("/{webhook_id}")
@limiter.limit("10/minute")
async def delete_webhook(
    request: Request,
    webhook_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Delete a webhook endpoint

    This will also delete all delivery logs
    """
    check_webhook_permission(user)

    # Check exists
    existing = db.execute(
        "SELECT id FROM user_webhooks WHERE id = ? AND user_id = ?",
        (webhook_id, user['id'])
    ).fetchone()

    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found"
        )

    db.execute(
        "DELETE FROM user_webhooks WHERE id = ? AND user_id = ?",
        (webhook_id, user['id'])
    )
    db.commit()

    logger.info(f"Deleted webhook {webhook_id} for user {user['id']}")

    return {
        'status': 'success',
        'message': f'Webhook {webhook_id} deleted'
    }


@router.post("/{webhook_id}/regenerate-secret", response_model=WebhookResponse)
@limiter.limit("5/hour")
async def regenerate_secret(
    request: Request,
    webhook_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Regenerate webhook secret

    **Warning**: Old secret will stop working immediately

    Returns: New secret (SAVE THIS)
    """
    check_webhook_permission(user)

    # Check exists
    existing = db.execute(
        "SELECT id FROM user_webhooks WHERE id = ? AND user_id = ?",
        (webhook_id, user['id'])
    ).fetchone()

    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found"
        )

    # Generate new secret
    new_secret = secrets.token_urlsafe(32)

    db.execute(
        "UPDATE user_webhooks SET secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (new_secret, webhook_id)
    )
    db.commit()

    logger.warning(f"Regenerated secret for webhook {webhook_id} (user {user['id']})")

    # Return with new secret
    result = db.execute(
        "SELECT * FROM user_webhooks WHERE id = ?",
        (webhook_id,)
    ).fetchone()

    return _row_to_webhook(result)


@router.get("/{webhook_id}/deliveries", response_model=WebhookDeliveryListResponse)
async def get_webhook_deliveries(
    webhook_id: int,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get delivery logs for webhook

    Shows recent attempts, successes, and failures
    """
    check_webhook_permission(user)

    # Verify webhook belongs to user
    webhook = db.execute(
        "SELECT id FROM user_webhooks WHERE id = ? AND user_id = ?",
        (webhook_id, user['id'])
    ).fetchone()

    if not webhook:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found"
        )

    # Get total count
    total = db.execute(
        "SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = ?",
        (webhook_id,)
    ).fetchone()[0]

    # Get paginated deliveries
    offset = (page - 1) * page_size

    results = db.execute(
        """
        SELECT * FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY sent_at DESC
        LIMIT ? OFFSET ?
        """,
        (webhook_id, page_size, offset)
    ).fetchall()

    from api.user_webhooks.models import WebhookDeliveryResponse

    deliveries = [
        WebhookDeliveryResponse(
            id=row[0],
            webhook_id=row[1],
            exploit_id=row[2],
            url=row[3],
            payload=row[4],
            signature=row[5],
            status_code=row[6],
            response_body=row[7],
            error=row[8],
            attempt_number=row[9],
            max_attempts=row[10],
            sent_at=row[12],
            delivered_at=row[13],
            failed_at=row[14]
        )
        for row in results
    ]

    return WebhookDeliveryListResponse(
        deliveries=deliveries,
        total=total,
        page=page,
        page_size=page_size
    )


@router.post("/{webhook_id}/test", response_model=WebhookTestResponse)
@limiter.limit("5/minute")
async def test_webhook(
    request: Request,
    webhook_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Send a test payload to webhook endpoint

    Verifies connectivity and returns response
    """
    check_webhook_permission(user)

    # Get webhook
    result = db.execute(
        "SELECT * FROM user_webhooks WHERE id = ? AND user_id = ?",
        (webhook_id, user['id'])
    ).fetchone()

    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found"
        )

    webhook = _row_to_webhook(result)

    # Build test payload
    test_payload = {
        "event": "webhook.test",
        "timestamp": int(time.time()),
        "webhook_id": webhook_id,
        "message": "This is a test from Kamiyo. If you receive this, your webhook is configured correctly!"
    }

    payload_json = json.dumps(test_payload)

    # Generate signature
    signature = hmac.new(
        webhook.secret.encode(),
        payload_json.encode(),
        hashlib.sha256
    ).hexdigest()

    # Send HTTP request
    import httpx

    start_time = time.time()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                webhook.url,
                json=test_payload,
                headers={
                    'Content-Type': 'application/json',
                    'X-Kamiyo-Signature': signature,
                    'X-Kamiyo-Event': 'webhook.test'
                }
            )

        latency_ms = int((time.time() - start_time) * 1000)

        return WebhookTestResponse(
            status='success',
            message='Webhook test sent successfully',
            status_code=response.status_code,
            response_body=response.text[:500],  # Limit response size
            error=None,
            latency_ms=latency_ms
        )

    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)

        return WebhookTestResponse(
            status='failed',
            message='Webhook test failed',
            status_code=None,
            response_body=None,
            error=str(e)[:500],
            latency_ms=latency_ms
        )


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def _row_to_webhook(row) -> WebhookResponse:
    """Convert database row to WebhookResponse"""
    return WebhookResponse(
        id=row[0],
        user_id=row[1],
        name=row[2],
        url=row[3],
        secret=row[4],
        is_active=bool(row[5]),
        min_amount_usd=row[6],
        chains=json.loads(row[7]) if row[7] else None,
        protocols=json.loads(row[8]) if row[8] else None,
        categories=json.loads(row[9]) if row[9] else None,
        total_sent=row[10],
        total_success=row[11],
        total_failed=row[12],
        last_sent_at=row[13],
        last_success_at=row[14],
        last_failure_at=row[15],
        last_error=row[16],
        created_at=row[17],
        updated_at=row[18]
    )


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== User Webhook Routes ===\n")
    print("Endpoints:")
    print("  POST   /api/v1/user-webhooks - Create webhook")
    print("  GET    /api/v1/user-webhooks - List webhooks")
    print("  GET    /api/v1/user-webhooks/{id} - Get webhook")
    print("  PATCH  /api/v1/user-webhooks/{id} - Update webhook")
    print("  DELETE /api/v1/user-webhooks/{id} - Delete webhook")
    print("  POST   /api/v1/user-webhooks/{id}/regenerate-secret - Regenerate secret")
    print("  GET    /api/v1/user-webhooks/{id}/deliveries - Get delivery logs")
    print("  POST   /api/v1/user-webhooks/{id}/test - Test webhook")
    print("\n✅ User webhook routes ready")
