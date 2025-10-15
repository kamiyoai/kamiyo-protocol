"""
Kamiyo Database Manager
Handles all database operations with connection pooling and error handling
"""

import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import contextmanager
import json
import os

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages database connections and operations for Kamiyo"""

    def __init__(self, db_path: str = "data/kamiyo.db"):
        """Initialize database manager"""
        self.db_path = db_path

        # Ensure data directory exists
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

        # Initialize schema
        self._initialize_schema()

        logger.info(f"Database manager initialized: {db_path}")

    @contextmanager
    def get_connection(self):
        """Context manager for database connections"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Enable column access by name
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            conn.close()

    def _initialize_schema(self):
        """Initialize database schema from schema.sql"""
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")

        with open(schema_path, 'r') as f:
            schema_sql = f.read()

        with self.get_connection() as conn:
            conn.executescript(schema_sql)

        logger.info("Database schema initialized")

    # ==================== EXPLOIT OPERATIONS ====================

    def insert_exploit(self, exploit: Dict[str, Any]) -> Optional[int]:
        """
        Insert exploit with automatic deduplication by tx_hash
        Returns exploit_id if inserted, None if duplicate
        """
        required_fields = ['tx_hash', 'chain', 'protocol', 'timestamp', 'source']

        # Validate required fields
        for field in required_fields:
            if field not in exploit:
                logger.error(f"Missing required field: {field}")
                return None

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Check for duplicate
                cursor.execute(
                    "SELECT id FROM exploits WHERE tx_hash = ?",
                    (exploit['tx_hash'],)
                )

                if cursor.fetchone():
                    logger.debug(f"Duplicate exploit: {exploit['tx_hash']}")
                    return None

                # Insert new exploit
                cursor.execute("""
                    INSERT INTO exploits (
                        tx_hash, chain, protocol, amount_usd, timestamp,
                        source, source_url, category, description, recovery_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    exploit['tx_hash'],
                    exploit['chain'],
                    exploit['protocol'],
                    exploit.get('amount_usd', 0),
                    exploit['timestamp'],
                    exploit['source'],
                    exploit.get('source_url'),
                    exploit.get('category'),
                    exploit.get('description'),
                    exploit.get('recovery_status')
                ))

                exploit_id = cursor.lastrowid
                logger.info(
                    f"Inserted exploit: {exploit['protocol']} on {exploit['chain']} "
                    f"(${exploit.get('amount_usd', 0):,.0f})"
                )

                # Trigger webhooks for new exploit (async, non-blocking)
                try:
                    self._trigger_webhooks(exploit_id)
                except Exception as e:
                    logger.error(f"Error triggering webhooks: {e}")

                return exploit_id

        except Exception as e:
            logger.error(f"Failed to insert exploit: {e}")
            return None

    def get_recent_exploits(
        self,
        limit: int = 100,
        offset: int = 0,
        chain: Optional[str] = None,
        min_amount: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """Get recent exploits with optional filtering"""

        query = "SELECT * FROM exploits WHERE 1=1"
        params = []

        # Filter out test data
        query += " AND LOWER(protocol) NOT LIKE '%test%'"
        query += " AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'"

        if chain:
            query += " AND chain = ?"
            params.append(chain)

        if min_amount:
            query += " AND amount_usd >= ?"
            params.append(min_amount)

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)

                rows = cursor.fetchall()
                return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Failed to fetch exploits: {e}")
            return []

    def get_exploit_by_tx_hash(self, tx_hash: str) -> Optional[Dict[str, Any]]:
        """Get single exploit by transaction hash"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM exploits WHERE tx_hash = ?", (tx_hash,))

                row = cursor.fetchone()
                return dict(row) if row else None

        except Exception as e:
            logger.error(f"Failed to fetch exploit: {e}")
            return None

    def get_exploits_by_chain(self, chain: str) -> List[Dict[str, Any]]:
        """Get all exploits for a specific chain"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM exploits
                    WHERE chain = ?
                    AND LOWER(protocol) NOT LIKE '%test%'
                    AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
                    ORDER BY timestamp DESC
                """,
                    (chain,)
                )

                rows = cursor.fetchall()
                return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Failed to fetch exploits by chain: {e}")
            return []

    def get_stats_24h(self) -> Dict[str, Any]:
        """Get statistics for last 24 hours"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM v_stats_24h")

                row = cursor.fetchone()
                if row:
                    return dict(row)
                else:
                    return {
                        'total_exploits': 0,
                        'total_loss_usd': 0,
                        'chains_affected': 0,
                        'protocols_affected': 0
                    }

        except Exception as e:
            logger.error(f"Failed to fetch 24h stats: {e}")
            return {}

    def get_stats_custom(self, days: int = 7) -> Dict[str, Any]:
        """Get statistics for custom time period"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                since = datetime.now() - timedelta(days=days)

                cursor.execute("""
                    SELECT
                        COUNT(*) as total_exploits,
                        SUM(amount_usd) as total_loss_usd,
                        COUNT(DISTINCT chain) as chains_affected,
                        COUNT(DISTINCT protocol) as protocols_affected,
                        AVG(amount_usd) as avg_loss_usd,
                        MAX(amount_usd) as max_loss_usd
                    FROM exploits
                    WHERE timestamp >= ?
                    AND LOWER(protocol) NOT LIKE '%test%'
                    AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
                """, (since,))

                row = cursor.fetchone()
                return dict(row) if row else {}

        except Exception as e:
            logger.error(f"Failed to fetch custom stats: {e}")
            return {}

    # ==================== SOURCE OPERATIONS ====================

    def update_source_health(self, name: str, success: bool = True, url: str = None):
        """Update source health after fetch attempt"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Check if source exists
                cursor.execute("SELECT id FROM sources WHERE name = ?", (name,))

                if cursor.fetchone():
                    # Update existing
                    if success:
                        cursor.execute("""
                            UPDATE sources
                            SET last_fetch = ?, fetch_count = fetch_count + 1
                            WHERE name = ?
                        """, (datetime.now(), name))
                    else:
                        cursor.execute("""
                            UPDATE sources
                            SET error_count = error_count + 1
                            WHERE name = ?
                        """, (name,))
                else:
                    # Insert new source
                    cursor.execute("""
                        INSERT INTO sources (name, url, last_fetch, fetch_count, error_count)
                        VALUES (?, ?, ?, ?, ?)
                    """, (
                        name,
                        url,
                        datetime.now() if success else None,
                        1 if success else 0,
                        0 if success else 1
                    ))

                logger.debug(f"Updated source health: {name} ({'success' if success else 'failure'})")

        except Exception as e:
            logger.error(f"Failed to update source health: {e}")

    def get_source_health(self) -> List[Dict[str, Any]]:
        """Get health status of all sources"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM v_source_health")

                rows = cursor.fetchall()
                return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Failed to fetch source health: {e}")
            return []

    # ==================== ALERT OPERATIONS ====================

    def record_alert_sent(self, exploit_id: int, channel: str, recipient: str = None):
        """Record that an alert was sent"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO alerts_sent (exploit_id, channel, recipient)
                    VALUES (?, ?, ?)
                """, (exploit_id, channel, recipient))

                logger.debug(f"Recorded alert: exploit={exploit_id}, channel={channel}")

        except Exception as e:
            logger.error(f"Failed to record alert: {e}")

    def was_alert_sent(self, exploit_id: int, channel: str) -> bool:
        """Check if alert was already sent for this exploit/channel"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id FROM alerts_sent
                    WHERE exploit_id = ? AND channel = ?
                """, (exploit_id, channel))

                return cursor.fetchone() is not None

        except Exception as e:
            logger.error(f"Failed to check alert status: {e}")
            return False

    # ==================== UTILITY OPERATIONS ====================

    def get_total_exploits(self) -> int:
        """Get total number of exploits in database (excluding test data)"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT COUNT(*) as count FROM exploits
                    WHERE LOWER(protocol) NOT LIKE '%test%'
                    AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
                """)

                row = cursor.fetchone()
                return row['count'] if row else 0

        except Exception as e:
            logger.error(f"Failed to get total exploits: {e}")
            return 0

    def get_chains(self) -> List[str]:
        """Get list of all chains in database (excluding test data)"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT DISTINCT chain FROM exploits
                    WHERE LOWER(protocol) NOT LIKE '%test%'
                    AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
                    ORDER BY chain
                """)

                return [row['chain'] for row in cursor.fetchall()]

        except Exception as e:
            logger.error(f"Failed to get chains: {e}")
            return []

    def get_chains_with_counts(self) -> List[Dict[str, Any]]:
        """Get list of chains with exploit counts (optimized - single query)"""

        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT
                        chain,
                        COUNT(*) as exploit_count
                    FROM exploits
                    WHERE LOWER(protocol) NOT LIKE '%test%'
                    AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
                    GROUP BY chain
                    ORDER BY exploit_count DESC, chain
                """)

                return [dict(row) for row in cursor.fetchall()]

        except Exception as e:
            logger.error(f"Failed to get chains with counts: {e}")
            return []

    def _trigger_webhooks(self, exploit_id: int):
        """
        Trigger webhook deliveries for new exploit
        Spawns async task without blocking database operation
        """
        import asyncio
        import threading

        def run_webhook_delivery():
            """Run webhook delivery in background thread"""
            try:
                from api.user_webhooks.delivery import WebhookDeliveryService

                # Create new event loop for this thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

                # Create delivery service
                service = WebhookDeliveryService()

                # Send to webhooks
                loop.run_until_complete(service.send_exploit_to_webhooks(exploit_id))

                loop.close()

            except Exception as e:
                logger.error(f"Webhook delivery thread error: {e}")

        # Start background thread
        thread = threading.Thread(target=run_webhook_delivery, daemon=True)
        thread.start()


# Singleton instance
_db_manager = None

def get_db() -> DatabaseManager:
    """Get database manager singleton"""
    global _db_manager

    if _db_manager is None:
        _db_manager = DatabaseManager()

    return _db_manager
