# -*- coding: utf-8 -*-
"""
Protocol Watchlist Manager
Enterprise feature for monitoring specific protocols
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from typing import List, Dict, Optional
import logging

from database import get_db

logger = logging.getLogger(__name__)


class WatchlistManager:
    """Manages protocol watchlists for Enterprise users"""

    def __init__(self):
        self.db = get_db()

    def create_watchlist(self, user_id: int, name: str, protocols: List[str],
                        chains: Optional[List[str]] = None,
                        min_amount_usd: Optional[float] = None) -> Dict:
        """
        Create a new protocol watchlist

        Args:
            user_id: User ID (must be Enterprise tier)
            name: Watchlist name
            protocols: List of protocol names to monitor
            chains: Optional list of chains to filter
            min_amount_usd: Optional minimum amount filter

        Returns:
            Dict with watchlist details
        """
        try:
            # Check user tier
            user = self.db.conn.execute(
                "SELECT tier FROM users WHERE id = ?", (user_id,)
            ).fetchone()

            if not user or user[0] != 'enterprise':
                raise ValueError("Protocol watchlists are only available for Enterprise tier")

            # Insert watchlist
            cursor = self.db.conn.execute(
                """
                INSERT INTO protocol_watchlists
                (user_id, name, protocols, chains, min_amount_usd, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (
                    user_id,
                    name,
                    json.dumps(protocols),
                    json.dumps(chains) if chains else None,
                    min_amount_usd
                )
            )

            self.db.conn.commit()

            return {
                "id": cursor.lastrowid,
                "user_id": user_id,
                "name": name,
                "protocols": protocols,
                "chains": chains,
                "min_amount_usd": min_amount_usd,
                "is_active": True
            }

        except Exception as e:
            logger.error(f"Error creating watchlist: {e}")
            self.db.conn.rollback()
            raise

    def get_user_watchlists(self, user_id: int) -> List[Dict]:
        """Get all watchlists for a user"""
        try:
            rows = self.db.conn.execute(
                """
                SELECT id, name, protocols, chains, min_amount_usd, is_active,
                       created_at, updated_at
                FROM protocol_watchlists
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user_id,)
            ).fetchall()

            watchlists = []
            for row in rows:
                # Get match count
                match_count = self.db.conn.execute(
                    "SELECT COUNT(*) FROM watchlist_matches WHERE watchlist_id = ?",
                    (row[0],)
                ).fetchone()[0]

                watchlists.append({
                    "id": row[0],
                    "name": row[1],
                    "protocols": json.loads(row[2]),
                    "chains": json.loads(row[3]) if row[3] else None,
                    "min_amount_usd": row[4],
                    "is_active": bool(row[5]),
                    "created_at": row[6],
                    "updated_at": row[7],
                    "match_count": match_count
                })

            return watchlists

        except Exception as e:
            logger.error(f"Error getting watchlists: {e}")
            return []

    def update_watchlist(self, watchlist_id: int, user_id: int, **updates) -> bool:
        """Update a watchlist"""
        try:
            # Verify ownership
            owner = self.db.conn.execute(
                "SELECT user_id FROM protocol_watchlists WHERE id = ?",
                (watchlist_id,)
            ).fetchone()

            if not owner or owner[0] != user_id:
                raise ValueError("Watchlist not found or access denied")

            # Build update query
            valid_fields = ['name', 'protocols', 'chains', 'min_amount_usd', 'is_active']
            set_clauses = []
            values = []

            for field, value in updates.items():
                if field in valid_fields:
                    if field in ['protocols', 'chains'] and value is not None:
                        value = json.dumps(value)
                    elif field == 'is_active':
                        value = 1 if value else 0

                    set_clauses.append(f"{field} = ?")
                    values.append(value)

            if not set_clauses:
                return False

            set_clauses.append("updated_at = datetime('now')")
            values.append(watchlist_id)

            query = f"UPDATE protocol_watchlists SET {', '.join(set_clauses)} WHERE id = ?"

            self.db.conn.execute(query, values)
            self.db.conn.commit()

            return True

        except Exception as e:
            logger.error(f"Error updating watchlist: {e}")
            self.db.conn.rollback()
            return False

    def delete_watchlist(self, watchlist_id: int, user_id: int) -> bool:
        """Delete a watchlist"""
        try:
            # Verify ownership
            owner = self.db.conn.execute(
                "SELECT user_id FROM protocol_watchlists WHERE id = ?",
                (watchlist_id,)
            ).fetchone()

            if not owner or owner[0] != user_id:
                return False

            self.db.conn.execute(
                "DELETE FROM protocol_watchlists WHERE id = ?",
                (watchlist_id,)
            )
            self.db.conn.commit()

            return True

        except Exception as e:
            logger.error(f"Error deleting watchlist: {e}")
            self.db.conn.rollback()
            return False

    def check_exploit_matches(self, exploit: Dict) -> List[int]:
        """
        Check if an exploit matches any active watchlists

        Args:
            exploit: Exploit dict with protocol, chain, amount_usd

        Returns:
            List of watchlist IDs that match
        """
        try:
            # Get all active watchlists
            watchlists = self.db.conn.execute(
                """
                SELECT id, protocols, chains, min_amount_usd
                FROM protocol_watchlists
                WHERE is_active = 1
                """
            ).fetchall()

            matches = []

            for watchlist in watchlists:
                watchlist_id, protocols_json, chains_json, min_amount = watchlist

                protocols = json.loads(protocols_json)
                chains = json.loads(chains_json) if chains_json else None

                # Check protocol match (case-insensitive, partial match)
                protocol_match = any(
                    p.lower() in exploit.get('protocol', '').lower()
                    for p in protocols
                )

                if not protocol_match:
                    continue

                # Check chain filter
                if chains and exploit.get('chain') not in chains:
                    continue

                # Check amount filter
                if min_amount and (not exploit.get('amount_usd') or exploit['amount_usd'] < min_amount):
                    continue

                matches.append(watchlist_id)

            return matches

        except Exception as e:
            logger.error(f"Error checking matches: {e}")
            return []

    def record_match(self, watchlist_id: int, exploit_id: int) -> bool:
        """Record that an exploit matched a watchlist"""
        try:
            self.db.conn.execute(
                """
                INSERT OR IGNORE INTO watchlist_matches (watchlist_id, exploit_id)
                VALUES (?, ?)
                """,
                (watchlist_id, exploit_id)
            )
            self.db.conn.commit()
            return True

        except Exception as e:
            logger.error(f"Error recording match: {e}")
            self.db.conn.rollback()
            return False

    def get_watchlist_matches(self, watchlist_id: int, limit: int = 100) -> List[Dict]:
        """Get recent exploits that matched a watchlist"""
        try:
            rows = self.db.conn.execute(
                """
                SELECT e.id, e.tx_hash, e.protocol, e.chain, e.amount_usd,
                       e.timestamp, m.matched_at, m.notified
                FROM watchlist_matches m
                JOIN exploits e ON m.exploit_id = e.id
                WHERE m.watchlist_id = ?
                ORDER BY m.matched_at DESC
                LIMIT ?
                """,
                (watchlist_id, limit)
            ).fetchall()

            return [
                {
                    "exploit_id": row[0],
                    "tx_hash": row[1],
                    "protocol": row[2],
                    "chain": row[3],
                    "amount_usd": row[4],
                    "timestamp": row[5],
                    "matched_at": row[6],
                    "notified": bool(row[7])
                }
                for row in rows
            ]

        except Exception as e:
            logger.error(f"Error getting matches: {e}")
            return []

    def mark_as_notified(self, watchlist_id: int, exploit_id: int) -> bool:
        """Mark a match as notified"""
        try:
            self.db.conn.execute(
                """
                UPDATE watchlist_matches
                SET notified = 1
                WHERE watchlist_id = ? AND exploit_id = ?
                """,
                (watchlist_id, exploit_id)
            )
            self.db.conn.commit()
            return True

        except Exception as e:
            logger.error(f"Error marking as notified: {e}")
            self.db.conn.rollback()
            return False


# Singleton instance
_watchlist_manager = None

def get_watchlist_manager() -> WatchlistManager:
    """Get singleton instance of WatchlistManager"""
    global _watchlist_manager
    if _watchlist_manager is None:
        _watchlist_manager = WatchlistManager()
    return _watchlist_manager
