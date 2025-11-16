# -*- coding: utf-8 -*-
"""
Alert Limits Module
Handles monthly alert limits for all tiers (all tiers now have unlimited email alerts)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
import logging

from database import get_db

logger = logging.getLogger(__name__)

# Tier alert limits (per month) - All tiers now have unlimited email alerts
ALERT_LIMITS = {
    'free': None,  # Unlimited email alerts
    'pro': None,  # Unlimited
    'team': None,  # Unlimited
    'enterprise': None  # Unlimited
}


class AlertLimitManager:
    """Manages monthly alert limits for users"""

    def __init__(self):
        self.db = get_db()

    def can_send_alert(self, user_id: int) -> Tuple[bool, Dict]:
        """
        Check if user can receive another alert this month

        Returns:
            tuple: (can_send: bool, status: dict)
        """
        try:
            # Get user info
            user = self.db.conn.execute(
                "SELECT id, email, tier, monthly_alerts_sent, monthly_alerts_reset_at FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()

            if not user:
                return False, {"error": "User not found"}

            user_id, email, tier, monthly_sent, reset_at = user

            # Check if reset is needed (monthly)
            if reset_at:
                reset_date = datetime.fromisoformat(reset_at)
                now = datetime.now()

                # Reset if more than 30 days ago
                if (now - reset_date).days >= 30:
                    self.reset_monthly_counter(user_id)
                    monthly_sent = 0
            else:
                # Initialize reset_at if not set
                self.reset_monthly_counter(user_id)
                monthly_sent = 0

            # Get limit for tier
            limit = ALERT_LIMITS.get(tier)

            # No limit for paid tiers
            if limit is None:
                return True, {
                    "tier": tier,
                    "unlimited": True,
                    "sent_this_month": monthly_sent
                }

            # Check if under limit
            can_send = monthly_sent < limit

            return can_send, {
                "tier": tier,
                "limit": limit,
                "sent_this_month": monthly_sent,
                "remaining": max(0, limit - monthly_sent),
                "can_send": can_send
            }

        except Exception as e:
            logger.error(f"Error checking alert limit: {e}")
            return False, {"error": str(e)}

    def increment_alert_count(self, user_id: int, exploit_id: int, channel: str) -> bool:
        """
        Increment user's monthly alert count and record the alert

        Args:
            user_id: User ID
            exploit_id: Exploit ID
            channel: Channel type (email, discord, telegram, etc.)

        Returns:
            bool: Success
        """
        try:
            # Increment counter
            self.db.conn.execute(
                "UPDATE users SET monthly_alerts_sent = monthly_alerts_sent + 1 WHERE id = ?",
                (user_id,)
            )

            # Record alert sent
            self.db.conn.execute(
                """
                INSERT INTO alerts_sent (exploit_id, channel, user_id, sent_at)
                VALUES (?, ?, ?, datetime('now'))
                """,
                (exploit_id, channel, user_id)
            )

            self.db.conn.commit()
            logger.info(f"Incremented alert count for user {user_id} (channel: {channel})")
            return True

        except Exception as e:
            logger.error(f"Error incrementing alert count: {e}")
            self.db.conn.rollback()
            return False

    def reset_monthly_counter(self, user_id: int):
        """Reset monthly alert counter for user"""
        try:
            self.db.conn.execute(
                """
                UPDATE users
                SET monthly_alerts_sent = 0,
                    monthly_alerts_reset_at = datetime('now')
                WHERE id = ?
                """,
                (user_id,)
            )
            self.db.conn.commit()
            logger.info(f"Reset monthly counter for user {user_id}")

        except Exception as e:
            logger.error(f"Error resetting counter: {e}")
            self.db.conn.rollback()

    def get_user_alert_stats(self, user_id: int) -> Optional[Dict]:
        """Get alert statistics for user"""
        try:
            user = self.db.conn.execute(
                "SELECT tier, monthly_alerts_sent, monthly_alerts_reset_at FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()

            if not user:
                return None

            tier, monthly_sent, reset_at = user
            limit = ALERT_LIMITS.get(tier)

            # Get total alerts sent to this user
            total_sent = self.db.conn.execute(
                "SELECT COUNT(*) FROM alerts_sent WHERE user_id = ?",
                (user_id,)
            ).fetchone()[0]

            return {
                "tier": tier,
                "monthly_limit": limit,
                "sent_this_month": monthly_sent,
                "remaining_this_month": max(0, limit - monthly_sent) if limit else None,
                "total_alerts_received": total_sent,
                "reset_at": reset_at,
                "unlimited": limit is None
            }

        except Exception as e:
            logger.error(f"Error getting user stats: {e}")
            return None

    def get_alerts_by_user(self, user_id: int, limit: int = 100) -> list:
        """Get recent alerts sent to user"""
        try:
            alerts = self.db.conn.execute(
                """
                SELECT a.id, a.exploit_id, a.channel, a.sent_at, e.protocol, e.amount_usd
                FROM alerts_sent a
                JOIN exploits e ON a.exploit_id = e.id
                WHERE a.user_id = ?
                ORDER BY a.sent_at DESC
                LIMIT ?
                """,
                (user_id, limit)
            ).fetchall()

            return [
                {
                    "id": row[0],
                    "exploit_id": row[1],
                    "channel": row[2],
                    "sent_at": row[3],
                    "protocol": row[4],
                    "amount_usd": row[5]
                }
                for row in alerts
            ]

        except Exception as e:
            logger.error(f"Error getting alerts: {e}")
            return []


# Singleton instance
_alert_limit_manager = None

def get_alert_limit_manager() -> AlertLimitManager:
    """Get singleton instance of AlertLimitManager"""
    global _alert_limit_manager
    if _alert_limit_manager is None:
        _alert_limit_manager = AlertLimitManager()
    return _alert_limit_manager
