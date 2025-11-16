# -*- coding: utf-8 -*-
"""
Discord Integration API Routes
Handles Discord OAuth2, guild management, and channel settings
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from typing import Optional, List

import httpx
from fastapi import APIRouter, HTTPException, Query, Header, Depends
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

# Discord OAuth2 configuration
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI', 'https://app.kamiyo.ai/discord/callback')
DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')

DISCORD_API_BASE = 'https://discord.com/api/v10'
DISCORD_OAUTH_URL = f'{DISCORD_API_BASE}/oauth2/authorize'
DISCORD_TOKEN_URL = f'{DISCORD_API_BASE}/oauth2/token'


# Models

class DiscordAuthRequest(BaseModel):
    code: str = Field(..., description="OAuth2 authorization code from Discord")
    guild_id: Optional[str] = Field(None, description="Guild ID from bot invite")


class DiscordAuthResponse(BaseModel):
    access_token: str
    guild_id: int
    guild_name: str
    expires_at: datetime


class DiscordGuildInfo(BaseModel):
    guild_id: int
    guild_name: str
    tier: str
    max_channels: int
    active_channels: int
    is_active: bool
    created_at: datetime


class DiscordChannelSettings(BaseModel):
    channel_id: int
    min_amount_usd: Optional[float] = Field(0, description="Minimum exploit amount (USD)")
    chain_filter: Optional[str] = Field(None, description="Comma-separated chain names")
    category_filter: Optional[str] = Field(None, description="Comma-separated categories")
    enable_threads: Optional[bool] = Field(False, description="Create threads for high-value exploits")
    daily_digest: Optional[bool] = Field(False, description="Enable daily digest")
    digest_time: Optional[str] = Field("09:00", description="UTC time for daily digest (HH:MM)")


class DiscordChannelInfo(BaseModel):
    channel_id: int
    channel_name: Optional[str]
    min_amount_usd: float
    chain_filter: Optional[str]
    category_filter: Optional[str]
    enable_threads: bool
    daily_digest: bool
    digest_time: str
    is_active: bool
    created_at: datetime


# Dependency for API key authentication
def verify_api_key(x_api_key: str = Header(...)):
    """Verify API key from header"""
    db = get_db()
    user = db.execute(
        "SELECT id, tier FROM users WHERE api_key = ?",
        (x_api_key,)
    ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return user


# Routes

@router.get("/authorize-url")
async def get_authorize_url():
    """
    Get Discord OAuth2 authorization URL

    Returns URL to redirect user to for bot authorization.
    """
    if not DISCORD_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Discord OAuth not configured")

    # Required permissions for bot
    permissions = 2048 + 68608  # Send Messages + Embed Links + Manage Threads

    # OAuth2 scopes
    scopes = ['bot', 'applications.commands']

    url = (
        f"{DISCORD_OAUTH_URL}"
        f"?client_id={DISCORD_CLIENT_ID}"
        f"&permissions={permissions}"
        f"&scope={'+'.join(scopes)}"
        f"&redirect_uri={DISCORD_REDIRECT_URI}"
        f"&response_type=code"
    )

    return {
        "authorization_url": url,
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI
    }


@router.post("/authorize", response_model=DiscordAuthResponse)
async def authorize_discord(
    request: DiscordAuthRequest,
    user=Depends(verify_api_key)
):
    """
    Complete Discord OAuth2 authorization

    Exchanges authorization code for access token and links guild to user account.
    """
    if not all([DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET]):
        raise HTTPException(status_code=500, detail="Discord OAuth not configured")

    try:
        # Exchange code for token
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                DISCORD_TOKEN_URL,
                data={
                    'client_id': DISCORD_CLIENT_ID,
                    'client_secret': DISCORD_CLIENT_SECRET,
                    'grant_type': 'authorization_code',
                    'code': request.code,
                    'redirect_uri': DISCORD_REDIRECT_URI,
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )

            if token_response.status_code != 200:
                logger.error(f"Discord token exchange failed: {token_response.text}")
                raise HTTPException(status_code=400, detail="Failed to exchange authorization code")

            token_data = token_response.json()

            # Get guild information using bot token
            if request.guild_id:
                guild_response = await client.get(
                    f"{DISCORD_API_BASE}/guilds/{request.guild_id}",
                    headers={'Authorization': f'Bot {DISCORD_BOT_TOKEN}'}
                )

                if guild_response.status_code == 200:
                    guild_data = guild_response.json()
                    guild_id = int(guild_data['id'])
                    guild_name = guild_data['name']
                    owner_id = int(guild_data['owner_id'])
                else:
                    logger.warning(f"Could not fetch guild info: {guild_response.status_code}")
                    guild_id = int(request.guild_id)
                    guild_name = "Unknown Guild"
                    owner_id = 0
            else:
                raise HTTPException(status_code=400, detail="guild_id required")

        # Store OAuth token
        db = get_db()
        expires_at = datetime.utcnow() + timedelta(seconds=token_data['expires_in'])

        db.execute("""
            INSERT INTO discord_oauth_tokens (guild_id, access_token, refresh_token, token_type, expires_at, scope)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at,
                updated_at = CURRENT_TIMESTAMP
        """, (
            guild_id,
            token_data['access_token'],
            token_data.get('refresh_token', ''),
            token_data['token_type'],
            expires_at,
            token_data.get('scope', '')
        ))

        # Create or update guild
        tier = user['tier']
        max_channels = {
            'free': 1,
            'basic': 3,
            'pro': 10,
            'enterprise': 100
        }.get(tier, 1)

        db.execute("""
            INSERT INTO discord_guilds (guild_id, guild_name, owner_id, user_id, tier, max_channels)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
                guild_name = excluded.guild_name,
                user_id = excluded.user_id,
                tier = excluded.tier,
                max_channels = excluded.max_channels,
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP
        """, (guild_id, guild_name, owner_id, user['id'], tier, max_channels))

        db.commit()

        return DiscordAuthResponse(
            access_token=token_data['access_token'],
            guild_id=guild_id,
            guild_name=guild_name,
            expires_at=expires_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Discord authorization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/guilds", response_model=List[DiscordGuildInfo])
async def get_user_guilds(user=Depends(verify_api_key)):
    """
    Get all Discord guilds connected to user account

    Returns list of guilds with their settings and statistics.
    """
    db = get_db()

    guilds = db.execute("""
        SELECT
            dg.guild_id,
            dg.guild_name,
            dg.tier,
            dg.max_channels,
            dg.is_active,
            dg.created_at,
            COUNT(DISTINCT dc.id) as active_channels
        FROM discord_guilds dg
        LEFT JOIN discord_channels dc ON dg.guild_id = dc.guild_id AND dc.is_active = 1
        WHERE dg.user_id = ?
        GROUP BY dg.guild_id
        ORDER BY dg.created_at DESC
    """, (user['id'],)).fetchall()

    return [
        DiscordGuildInfo(
            guild_id=g['guild_id'],
            guild_name=g['guild_name'],
            tier=g['tier'],
            max_channels=g['max_channels'],
            active_channels=g['active_channels'],
            is_active=bool(g['is_active']),
            created_at=datetime.fromisoformat(g['created_at'])
        )
        for g in guilds
    ]


@router.get("/guilds/{guild_id}/channels", response_model=List[DiscordChannelInfo])
async def get_guild_channels(
    guild_id: int,
    user=Depends(verify_api_key)
):
    """
    Get all channels configured for a guild

    Returns channel settings and filter configurations.
    """
    db = get_db()

    # Verify guild ownership
    guild = db.execute("""
        SELECT user_id FROM discord_guilds
        WHERE guild_id = ?
    """, (guild_id,)).fetchone()

    if not guild or guild['user_id'] != user['id']:
        raise HTTPException(status_code=403, detail="Guild not found or access denied")

    # Get channels
    channels = db.execute("""
        SELECT
            channel_id,
            channel_name,
            min_amount_usd,
            chain_filter,
            category_filter,
            enable_threads,
            daily_digest,
            digest_time,
            is_active,
            created_at
        FROM discord_channels
        WHERE guild_id = ?
        ORDER BY created_at DESC
    """, (guild_id,)).fetchall()

    return [
        DiscordChannelInfo(
            channel_id=c['channel_id'],
            channel_name=c['channel_name'],
            min_amount_usd=c['min_amount_usd'] or 0,
            chain_filter=c['chain_filter'],
            category_filter=c['category_filter'],
            enable_threads=bool(c['enable_threads']),
            daily_digest=bool(c['daily_digest']),
            digest_time=c['digest_time'] or '09:00',
            is_active=bool(c['is_active']),
            created_at=datetime.fromisoformat(c['created_at'])
        )
        for c in channels
    ]


@router.post("/guilds/{guild_id}/channels/{channel_id}/settings")
async def update_channel_settings(
    guild_id: int,
    channel_id: int,
    settings: DiscordChannelSettings,
    user=Depends(verify_api_key)
):
    """
    Update settings for a Discord channel

    Configure filters, thresholds, and notification preferences.
    """
    db = get_db()

    # Verify guild ownership
    guild = db.execute("""
        SELECT user_id, max_channels FROM discord_guilds
        WHERE guild_id = ?
    """, (guild_id,)).fetchone()

    if not guild or guild['user_id'] != user['id']:
        raise HTTPException(status_code=403, detail="Guild not found or access denied")

    # Check channel limit
    channel_count = db.execute("""
        SELECT COUNT(*) as count FROM discord_channels
        WHERE guild_id = ? AND is_active = 1 AND channel_id != ?
    """, (guild_id, channel_id)).fetchone()['count']

    if channel_count >= guild['max_channels']:
        raise HTTPException(
            status_code=400,
            detail=f"Channel limit reached ({guild['max_channels']}). Upgrade your tier for more channels."
        )

    # Update or create channel settings
    try:
        db.execute("""
            INSERT INTO discord_channels (
                guild_id, channel_id, min_amount_usd, chain_filter, category_filter,
                enable_threads, daily_digest, digest_time, is_active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(guild_id, channel_id) DO UPDATE SET
                min_amount_usd = excluded.min_amount_usd,
                chain_filter = excluded.chain_filter,
                category_filter = excluded.category_filter,
                enable_threads = excluded.enable_threads,
                daily_digest = excluded.daily_digest,
                digest_time = excluded.digest_time,
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP
        """, (
            guild_id,
            channel_id,
            settings.min_amount_usd,
            settings.chain_filter,
            settings.category_filter,
            settings.enable_threads,
            settings.daily_digest,
            settings.digest_time
        ))

        db.commit()

        return {
            "success": True,
            "message": "Channel settings updated successfully",
            "guild_id": guild_id,
            "channel_id": channel_id
        }

    except Exception as e:
        logger.error(f"Error updating channel settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/guilds/{guild_id}/channels/{channel_id}")
async def remove_channel(
    guild_id: int,
    channel_id: int,
    user=Depends(verify_api_key)
):
    """
    Remove a channel from alert subscriptions

    Deactivates the channel without deleting historical data.
    """
    db = get_db()

    # Verify guild ownership
    guild = db.execute("""
        SELECT user_id FROM discord_guilds
        WHERE guild_id = ?
    """, (guild_id,)).fetchone()

    if not guild or guild['user_id'] != user['id']:
        raise HTTPException(status_code=403, detail="Guild not found or access denied")

    # Deactivate channel
    db.execute("""
        UPDATE discord_channels
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ? AND channel_id = ?
    """, (guild_id, channel_id))

    db.commit()

    return {
        "success": True,
        "message": "Channel removed from subscriptions"
    }


@router.get("/stats")
async def get_discord_stats(
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    user=Depends(verify_api_key)
):
    """
    Get Discord integration statistics for user's guilds

    Returns alert counts, channel activity, and engagement metrics.
    """
    db = get_db()

    # Get user's guilds
    guilds = db.execute("""
        SELECT guild_id FROM discord_guilds
        WHERE user_id = ?
    """, (user['id'],)).fetchall()

    guild_ids = [g['guild_id'] for g in guilds]

    if not guild_ids:
        return {
            "total_guilds": 0,
            "active_channels": 0,
            "alerts_sent": 0,
            "threads_created": 0
        }

    # Get statistics
    guild_ids_str = ','.join(str(g) for g in guild_ids)

    stats = db.execute(f"""
        SELECT
            COUNT(DISTINCT da.guild_id) as active_guilds,
            COUNT(DISTINCT da.channel_id) as active_channels,
            COUNT(da.id) as total_alerts,
            COUNT(da.thread_id) as threads_created
        FROM discord_alerts da
        WHERE da.guild_id IN ({guild_ids_str})
        AND da.sent_at >= datetime('now', '-{days} days')
    """).fetchone()

    return {
        "total_guilds": len(guild_ids),
        "active_guilds": stats['active_guilds'],
        "active_channels": stats['active_channels'],
        "alerts_sent": stats['total_alerts'],
        "threads_created": stats['threads_created'],
        "period_days": days
    }
