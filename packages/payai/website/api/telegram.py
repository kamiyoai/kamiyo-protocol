# -*- coding: utf-8 -*-
"""
Telegram API Endpoints
Manage Telegram bot integration and user settings
"""

from fastapi import APIRouter, HTTPException, Header, Query, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()


# ==========================================
# Request/Response Models
# ==========================================

class TelegramLinkRequest(BaseModel):
    """Request to link Telegram account"""
    user_id: str = Field(..., description="Platform user ID")
    chat_id: int = Field(..., description="Telegram chat ID")
    verification_code: Optional[str] = Field(None, description="Verification code from bot")


class TelegramLinkResponse(BaseModel):
    """Response after linking Telegram account"""
    success: bool
    message: str
    chat_id: Optional[int] = None
    tier: Optional[str] = None


class TelegramStatusResponse(BaseModel):
    """Telegram bot status response"""
    bot_active: bool
    bot_username: Optional[str] = None
    total_users: int
    active_users: int
    alerts_sent_today: int


class TelegramSettingsRequest(BaseModel):
    """Update Telegram alert settings"""
    chains: Optional[List[str]] = None
    min_amount_usd: Optional[float] = Field(None, ge=0)
    protocols: Optional[List[str]] = None
    instant_alerts: Optional[bool] = None
    daily_digest: Optional[bool] = None
    weekly_summary: Optional[bool] = None


class TelegramSettingsResponse(BaseModel):
    """Telegram settings response"""
    chat_id: int
    chains: Optional[List[str]]
    min_amount_usd: float
    protocols: Optional[List[str]]
    instant_alerts: bool
    daily_digest: bool
    weekly_summary: bool
    max_alerts_per_day: int
    alerts_today: int


# ==========================================
# Database Helper
# ==========================================

def get_db_connection():
    """Get database connection"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise HTTPException(status_code=500, detail="Database not configured")
    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)


# ==========================================
# API Endpoints
# ==========================================

@router.post("/link", response_model=TelegramLinkResponse)
async def link_telegram_account(request: TelegramLinkRequest):
    """
    Link Telegram account to platform user

    This endpoint connects a user's Telegram account to their Kamiyo platform account,
    enabling them to receive alerts based on their subscription tier.

    Steps:
    1. User starts bot and gets their chat_id
    2. User provides chat_id and verification code on platform
    3. This endpoint verifies and links the accounts
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Check if chat_id exists in telegram_users
        cursor.execute("""
            SELECT chat_id, username FROM telegram_users
            WHERE chat_id = %s
        """, (request.chat_id,))

        telegram_user = cursor.fetchone()
        if not telegram_user:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=404,
                detail="Chat ID not found. Please start the bot first by messaging /start"
            )

        # Get user's subscription tier
        cursor.execute("""
            SELECT tier, status FROM user_subscriptions
            WHERE user_id = %s AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        """, (request.user_id,))

        subscription = cursor.fetchone()
        tier = subscription['tier'] if subscription else 'free'

        # Link the accounts
        cursor.execute("""
            SELECT link_telegram_user(%s, %s)
        """, (request.chat_id, request.user_id))

        conn.commit()

        # Get updated info
        cursor.execute("""
            SELECT tier FROM telegram_users WHERE chat_id = %s
        """, (request.chat_id,))

        updated_user = cursor.fetchone()

        cursor.close()
        conn.close()

        return TelegramLinkResponse(
            success=True,
            message=f"Telegram account linked successfully. Tier: {tier}",
            chat_id=request.chat_id,
            tier=updated_user['tier']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error linking Telegram account: {e}")
        raise HTTPException(status_code=500, detail="Failed to link Telegram account")


@router.get("/status", response_model=TelegramStatusResponse)
async def get_telegram_status():
    """
    Get Telegram bot status

    Returns information about the bot's operational status and usage statistics.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Get user counts
        cursor.execute("""
            SELECT
                COUNT(*) as total_users,
                COUNT(*) FILTER (WHERE is_active = TRUE) as active_users
            FROM telegram_users
        """)

        stats = cursor.fetchone()

        # Get alerts sent today
        cursor.execute("""
            SELECT COUNT(*) as alerts_today
            FROM telegram_alerts
            WHERE date = CURRENT_DATE AND delivered = TRUE
        """)

        alerts = cursor.fetchone()

        cursor.close()
        conn.close()

        # Check if bot is configured
        bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
        bot_active = bool(bot_token)
        bot_username = os.getenv('TELEGRAM_BOT_USERNAME', 'kamiyo_bot')

        return TelegramStatusResponse(
            bot_active=bot_active,
            bot_username=bot_username if bot_active else None,
            total_users=stats['total_users'],
            active_users=stats['active_users'],
            alerts_sent_today=alerts['alerts_today']
        )

    except Exception as e:
        logger.error(f"Error getting Telegram status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get Telegram status")


@router.post("/settings", response_model=TelegramSettingsResponse)
async def update_telegram_settings(
    request: TelegramSettingsRequest,
    chat_id: int = Query(..., description="Telegram chat ID")
):
    """
    Update Telegram alert settings

    Configure which alerts you want to receive via Telegram.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Check if user exists
        cursor.execute("""
            SELECT chat_id FROM telegram_users WHERE chat_id = %s
        """, (chat_id,))

        if not cursor.fetchone():
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Chat ID not found")

        # Build update query
        updates = []
        params = []

        if request.chains is not None:
            updates.append("chains = %s")
            params.append(request.chains)

        if request.min_amount_usd is not None:
            updates.append("min_amount_usd = %s")
            params.append(request.min_amount_usd)

        if request.protocols is not None:
            updates.append("protocols = %s")
            params.append(request.protocols)

        if request.instant_alerts is not None:
            updates.append("instant_alerts = %s")
            params.append(request.instant_alerts)

        if request.daily_digest is not None:
            updates.append("daily_digest = %s")
            params.append(request.daily_digest)

        if request.weekly_summary is not None:
            updates.append("weekly_summary = %s")
            params.append(request.weekly_summary)

        if updates:
            query = f"""
                UPDATE telegram_subscriptions
                SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP
                WHERE chat_id = %s
            """
            params.append(chat_id)
            cursor.execute(query, params)
            conn.commit()

        # Get updated settings
        cursor.execute("""
            SELECT
                ts.*,
                COALESCE(trl.alert_count, 0) as alerts_today
            FROM telegram_subscriptions ts
            LEFT JOIN telegram_rate_limits trl ON ts.chat_id = trl.chat_id AND trl.date = CURRENT_DATE
            WHERE ts.chat_id = %s
        """, (chat_id,))

        settings = cursor.fetchone()

        cursor.close()
        conn.close()

        if not settings:
            raise HTTPException(status_code=404, detail="Settings not found")

        return TelegramSettingsResponse(
            chat_id=settings['chat_id'],
            chains=settings['chains'],
            min_amount_usd=float(settings['min_amount_usd']),
            protocols=settings['protocols'],
            instant_alerts=settings['instant_alerts'],
            daily_digest=settings['daily_digest'],
            weekly_summary=settings['weekly_summary'],
            max_alerts_per_day=settings['max_alerts_per_day'],
            alerts_today=settings['alerts_today']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating Telegram settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to update settings")


@router.get("/settings", response_model=TelegramSettingsResponse)
async def get_telegram_settings(
    chat_id: int = Query(..., description="Telegram chat ID")
):
    """
    Get current Telegram alert settings

    Retrieve your current alert configuration.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                ts.*,
                COALESCE(trl.alert_count, 0) as alerts_today
            FROM telegram_subscriptions ts
            LEFT JOIN telegram_rate_limits trl ON ts.chat_id = trl.chat_id AND trl.date = CURRENT_DATE
            WHERE ts.chat_id = %s
        """, (chat_id,))

        settings = cursor.fetchone()

        cursor.close()
        conn.close()

        if not settings:
            raise HTTPException(status_code=404, detail="Settings not found")

        return TelegramSettingsResponse(
            chat_id=settings['chat_id'],
            chains=settings['chains'],
            min_amount_usd=float(settings['min_amount_usd']),
            protocols=settings['protocols'],
            instant_alerts=settings['instant_alerts'],
            daily_digest=settings['daily_digest'],
            weekly_summary=settings['weekly_summary'],
            max_alerts_per_day=settings['max_alerts_per_day'],
            alerts_today=settings['alerts_today']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Telegram settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to get settings")


@router.delete("/unlink")
async def unlink_telegram_account(
    chat_id: int = Query(..., description="Telegram chat ID")
):
    """
    Unlink Telegram account from platform user

    This removes the connection between your Telegram and platform accounts.
    You'll revert to the free tier for Telegram alerts.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Unlink account (set user_id to NULL, tier to 'free')
        cursor.execute("""
            UPDATE telegram_users
            SET user_id = NULL,
                tier = 'free',
                updated_at = CURRENT_TIMESTAMP
            WHERE chat_id = %s
        """, (chat_id,))

        # Reset max_alerts_per_day to free tier limit
        cursor.execute("""
            UPDATE telegram_subscriptions
            SET max_alerts_per_day = 5
            WHERE chat_id = %s
        """, (chat_id,))

        conn.commit()
        cursor.close()
        conn.close()

        return {
            "success": True,
            "message": "Telegram account unlinked successfully"
        }

    except Exception as e:
        logger.error(f"Error unlinking Telegram account: {e}")
        raise HTTPException(status_code=500, detail="Failed to unlink Telegram account")


@router.get("/analytics")
async def get_telegram_analytics(
    admin_key: str = Header(..., alias="X-Admin-Key")
):
    """
    Get Telegram usage analytics (Admin only)

    Returns detailed statistics about Telegram bot usage.
    """
    # Verify admin key
    expected_key = os.getenv('ADMIN_API_KEY')
    if not expected_key or admin_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid admin key")

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Get user analytics by tier
        cursor.execute("""
            SELECT * FROM v_telegram_analytics
        """)
        user_analytics = cursor.fetchall()

        # Get alert stats
        cursor.execute("""
            SELECT * FROM v_telegram_alert_stats
            ORDER BY day DESC
            LIMIT 30
        """)
        alert_stats = cursor.fetchall()

        # Get top commands
        cursor.execute("""
            SELECT
                command,
                COUNT(*) as usage_count,
                COUNT(*) FILTER (WHERE success = TRUE) as successful,
                COUNT(*) FILTER (WHERE success = FALSE) as failed
            FROM telegram_commands
            WHERE executed_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY command
            ORDER BY usage_count DESC
            LIMIT 10
        """)
        command_stats = cursor.fetchall()

        cursor.close()
        conn.close()

        return {
            "user_analytics": [dict(row) for row in user_analytics],
            "alert_stats": [dict(row) for row in alert_stats],
            "command_stats": [dict(row) for row in command_stats]
        }

    except Exception as e:
        logger.error(f"Error getting Telegram analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get analytics")
