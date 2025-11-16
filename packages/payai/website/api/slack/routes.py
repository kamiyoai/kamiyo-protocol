# -*- coding: utf-8 -*-
"""
Slack Integration API Routes
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import Optional
import logging
import httpx

from api.auth_helpers import get_current_user
from database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/slack", tags=["Slack"])


class SlackWebhookRequest(BaseModel):
    """Request to set Slack webhook"""
    webhook_url: HttpUrl
    enabled: bool = True


class SlackStatusResponse(BaseModel):
    """Slack integration status"""
    enabled: bool
    webhook_configured: bool
    webhook_url: Optional[str] = None


class SlackTestRequest(BaseModel):
    """Request to test Slack webhook"""
    webhook_url: Optional[HttpUrl] = None


@router.post("/webhook")
async def set_slack_webhook(
    request: SlackWebhookRequest,
    user=Depends(get_current_user)
):
    """
    Configure Slack webhook for exploit alerts

    Requires Team or Enterprise tier.
    """
    # Check tier
    if user['tier'] not in ['team', 'enterprise']:
        raise HTTPException(
            status_code=403,
            detail="Slack integration requires Team or Enterprise tier"
        )

    db = get_db()

    try:
        db.conn.execute(
            """
            UPDATE users
            SET slack_webhook_url = ?, slack_enabled = ?
            WHERE id = ?
            """,
            (str(request.webhook_url), 1 if request.enabled else 0, user['id'])
        )
        db.conn.commit()

        return {
            "message": "Slack webhook configured successfully",
            "enabled": request.enabled,
            "webhook_url": str(request.webhook_url)
        }

    except Exception as e:
        logger.error(f"Error setting Slack webhook: {e}")
        db.conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to configure Slack webhook")


@router.get("/status", response_model=SlackStatusResponse)
async def get_slack_status(user=Depends(get_current_user)):
    """
    Get Slack integration status

    Returns whether Slack is configured and enabled.
    """
    db = get_db()

    row = db.conn.execute(
        "SELECT slack_webhook_url, slack_enabled FROM users WHERE id = ?",
        (user['id'],)
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    webhook_url, enabled = row

    # Mask webhook URL for security
    masked_url = None
    if webhook_url:
        parts = webhook_url.split('/')
        if len(parts) >= 2:
            masked_url = f"{parts[0]}//{parts[2]}/services/***"

    return SlackStatusResponse(
        enabled=bool(enabled),
        webhook_configured=bool(webhook_url),
        webhook_url=masked_url
    )


@router.post("/test")
async def test_slack_webhook(
    request: SlackTestRequest,
    user=Depends(get_current_user)
):
    """
    Test Slack webhook

    Sends a test message to verify webhook is working.
    """
    db = get_db()

    # Get webhook URL from request or database
    webhook_url = request.webhook_url

    if not webhook_url:
        row = db.conn.execute(
            "SELECT slack_webhook_url FROM users WHERE id = ?",
            (user['id'],)
        ).fetchone()

        if not row or not row[0]:
            raise HTTPException(status_code=400, detail="No Slack webhook configured")

        webhook_url = row[0]

    # Send test message
    try:
        message = {
            "text": "🧪 *Kamiyo Test Alert*",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "✅ *Slack integration is working!*\n\nYou will receive exploit alerts in this channel."
                    }
                }
            ]
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                str(webhook_url),
                json=message,
                timeout=10.0
            )

            if response.status_code == 200:
                return {
                    "message": "Test message sent successfully",
                    "status": "success"
                }
            else:
                raise HTTPException(
                    status_code=502,
                    detail=f"Slack webhook returned status {response.status_code}"
                )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Slack webhook request timed out")
    except Exception as e:
        logger.error(f"Error testing Slack webhook: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send test message: {str(e)}")


@router.delete("/webhook")
async def remove_slack_webhook(user=Depends(get_current_user)):
    """
    Remove Slack webhook configuration

    Disables Slack integration.
    """
    db = get_db()

    try:
        db.conn.execute(
            """
            UPDATE users
            SET slack_webhook_url = NULL, slack_enabled = 0
            WHERE id = ?
            """,
            (user['id'],)
        )
        db.conn.commit()

        return {"message": "Slack webhook removed successfully"}

    except Exception as e:
        logger.error(f"Error removing Slack webhook: {e}")
        db.conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to remove Slack webhook")


async def send_slack_alert(webhook_url: str, exploit: dict) -> bool:
    """
    Send exploit alert to Slack

    Args:
        webhook_url: Slack webhook URL
        exploit: Exploit data

    Returns:
        bool: Success status
    """
    try:
        # Format amount
        amount_str = f"${exploit.get('amount_usd', 0):,.2f}" if exploit.get('amount_usd') else "Unknown"

        # Build message
        message = {
            "text": f"🚨 New Exploit Alert: {exploit.get('protocol', 'Unknown')}",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"🚨 {exploit.get('protocol', 'Unknown')} Exploit"
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {
                            "type": "mrkdwn",
                            "text": f"*Chain:*\n{exploit.get('chain', 'Unknown')}"
                        },
                        {
                            "type": "mrkdwn",
                            "text": f"*Amount:*\n{amount_str}"
                        },
                        {
                            "type": "mrkdwn",
                            "text": f"*Category:*\n{exploit.get('category', 'Unknown')}"
                        },
                        {
                            "type": "mrkdwn",
                            "text": f"*Source:*\n{exploit.get('source', 'Unknown')}"
                        }
                    ]
                }
            ]
        }

        # Add transaction hash if available
        if exploit.get('tx_hash'):
            message["blocks"].append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Transaction:*\n`{exploit['tx_hash']}`"
                }
            })

        async with httpx.AsyncClient() as client:
            response = await client.post(
                webhook_url,
                json=message,
                timeout=10.0
            )

            return response.status_code == 200

    except Exception as e:
        logger.error(f"Error sending Slack alert: {e}")
        return False
