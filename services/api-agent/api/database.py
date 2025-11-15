"""
Database connection and management for the API.
Handles SQLite connections and query execution.
"""

import sqlite3
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from contextlib import contextmanager
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Database path
DB_PATH = Path(__file__).parent.parent.parent / "processing-agent" / "data" / "exploits.db"


class Database:
    """Database connection manager with connection pooling."""

    def __init__(self, db_path: str = None):
        """Initialize database connection."""
        self.db_path = db_path or str(DB_PATH)
        logger.info(f"Database initialized with path: {self.db_path}")

    @contextmanager
    def get_connection(self):
        """Get a database connection with context manager."""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row  # Enable column access by name
            yield conn
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Database error: {e}")
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                conn.close()

    def execute_query(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Execute a SELECT query and return results as list of dicts."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def execute_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """Execute a SELECT query and return single result."""
        results = self.execute_query(query, params)
        return results[0] if results else None

    def execute_write(self, query: str, params: tuple = ()) -> int:
        """Execute an INSERT/UPDATE/DELETE query."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            return cursor.rowcount

    # ========== Exploit Queries ==========

    def get_exploits(
        self,
        limit: int = 20,
        offset: int = 0,
        chain: Optional[str] = None,
        protocol: Optional[str] = None,
        severity: Optional[str] = None,
        min_amount: Optional[float] = None,
        delay_hours: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get exploits with filtering and pagination.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            chain: Filter by chain name
            protocol: Filter by protocol name
            severity: Filter by severity (critical/high/medium/low)
            min_amount: Minimum amount stolen (USD)
            delay_hours: Delay data by N hours (for subscription tiers)
        """
        query = """
            SELECT
                tx_hash,
                chain,
                block_number,
                timestamp,
                protocol,
                exploit_type,
                amount_stolen,
                token,
                attacker_address,
                victim_address,
                severity,
                confidence_score,
                attack_pattern,
                created_at
            FROM exploits
            WHERE 1=1
        """
        params = []

        # Apply data delay filter
        if delay_hours > 0:
            cutoff_time = datetime.utcnow() - timedelta(hours=delay_hours)
            query += " AND datetime(timestamp) <= ?"
            params.append(cutoff_time.isoformat())

        # Apply filters
        if chain:
            query += " AND LOWER(chain) = LOWER(?)"
            params.append(chain)

        if protocol:
            query += " AND LOWER(protocol) LIKE LOWER(?)"
            params.append(f"%{protocol}%")

        if severity:
            query += " AND LOWER(severity) = LOWER(?)"
            params.append(severity)

        if min_amount is not None:
            query += " AND amount_stolen >= ?"
            params.append(min_amount)

        # Order by timestamp descending (most recent first)
        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        return self.execute_query(query, tuple(params))

    def get_exploit_by_hash(self, tx_hash: str) -> Optional[Dict[str, Any]]:
        """Get a single exploit by transaction hash."""
        query = """
            SELECT
                tx_hash,
                chain,
                block_number,
                timestamp,
                protocol,
                exploit_type,
                amount_stolen,
                token,
                attacker_address,
                victim_address,
                severity,
                confidence_score,
                attack_pattern,
                created_at
            FROM exploits
            WHERE tx_hash = ?
        """
        return self.execute_one(query, (tx_hash,))

    def get_total_exploits(
        self,
        chain: Optional[str] = None,
        protocol: Optional[str] = None,
        severity: Optional[str] = None,
        min_amount: Optional[float] = None,
        delay_hours: int = 0
    ) -> int:
        """Get total count of exploits matching filters."""
        query = "SELECT COUNT(*) as count FROM exploits WHERE 1=1"
        params = []

        # Apply data delay filter
        if delay_hours > 0:
            cutoff_time = datetime.utcnow() - timedelta(hours=delay_hours)
            query += " AND datetime(timestamp) <= ?"
            params.append(cutoff_time.isoformat())

        if chain:
            query += " AND LOWER(chain) = LOWER(?)"
            params.append(chain)

        if protocol:
            query += " AND LOWER(protocol) LIKE LOWER(?)"
            params.append(f"%{protocol}%")

        if severity:
            query += " AND LOWER(severity) = LOWER(?)"
            params.append(severity)

        if min_amount is not None:
            query += " AND amount_stolen >= ?"
            params.append(min_amount)

        result = self.execute_one(query, tuple(params))
        return result['count'] if result else 0

    def search_exploits(
        self,
        search_term: str,
        limit: int = 20,
        delay_hours: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Search exploits by term (matches protocol, chain, addresses, tx_hash).
        """
        query = """
            SELECT
                tx_hash,
                chain,
                block_number,
                timestamp,
                protocol,
                exploit_type,
                amount_stolen,
                token,
                attacker_address,
                victim_address,
                severity,
                confidence_score,
                attack_pattern,
                created_at
            FROM exploits
            WHERE 1=1
        """
        params = []

        # Apply data delay filter
        if delay_hours > 0:
            cutoff_time = datetime.utcnow() - timedelta(hours=delay_hours)
            query += " AND datetime(timestamp) <= ?"
            params.append(cutoff_time.isoformat())

        # Search across multiple fields
        query += """ AND (
            LOWER(protocol) LIKE LOWER(?) OR
            LOWER(chain) LIKE LOWER(?) OR
            LOWER(tx_hash) LIKE LOWER(?) OR
            LOWER(attacker_address) LIKE LOWER(?) OR
            LOWER(victim_address) LIKE LOWER(?)
        )"""
        search_pattern = f"%{search_term}%"
        params.extend([search_pattern] * 5)

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        return self.execute_query(query, tuple(params))

    def get_recent_alerts(
        self,
        hours: int = 24,
        limit: int = 50,
        delay_hours: int = 0
    ) -> List[Dict[str, Any]]:
        """Get recent high-severity exploits as alerts."""
        query = """
            SELECT
                tx_hash,
                chain,
                timestamp,
                protocol,
                exploit_type,
                amount_stolen,
                token,
                severity,
                confidence_score
            FROM exploits
            WHERE severity IN ('critical', 'high')
        """
        params = []

        # Time range filter
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        query += " AND datetime(timestamp) >= ?"
        params.append(cutoff_time.isoformat())

        # Apply data delay filter
        if delay_hours > 0:
            delay_cutoff = datetime.utcnow() - timedelta(hours=delay_hours)
            query += " AND datetime(timestamp) <= ?"
            params.append(delay_cutoff.isoformat())

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        return self.execute_query(query, tuple(params))

    # ========== Statistics Queries ==========

    def get_stats_overview(self, delay_hours: int = 0) -> Dict[str, Any]:
        """Get overview statistics for dashboard."""

        # Base WHERE clause for data delay
        where_clause = "WHERE 1=1"
        params = []

        if delay_hours > 0:
            cutoff_time = datetime.utcnow() - timedelta(hours=delay_hours)
            where_clause += " AND datetime(timestamp) <= ?"
            params.append(cutoff_time.isoformat())

        # Total exploits
        total_query = f"SELECT COUNT(*) as count FROM exploits {where_clause}"
        total_result = self.execute_one(total_query, tuple(params))
        total_exploits = total_result['count'] if total_result else 0

        # Total amount stolen
        amount_query = f"SELECT SUM(amount_stolen) as total FROM exploits {where_clause}"
        amount_result = self.execute_one(amount_query, tuple(params))
        total_stolen = amount_result['total'] if amount_result and amount_result['total'] else 0

        # By severity
        severity_query = f"""
            SELECT severity, COUNT(*) as count
            FROM exploits {where_clause}
            GROUP BY severity
        """
        severity_results = self.execute_query(severity_query, tuple(params))
        by_severity = {row['severity']: row['count'] for row in severity_results}

        # By chain
        chain_query = f"""
            SELECT chain, COUNT(*) as count
            FROM exploits {where_clause}
            GROUP BY chain
            ORDER BY count DESC
            LIMIT 10
        """
        chain_results = self.execute_query(chain_query, tuple(params))
        by_chain = {row['chain']: row['count'] for row in chain_results}

        # Recent activity (last 24 hours)
        recent_cutoff = datetime.utcnow() - timedelta(hours=24)
        recent_params = list(params) if params else []

        recent_where = where_clause + " AND datetime(timestamp) >= ?"
        recent_params.append(recent_cutoff.isoformat())

        recent_query = f"SELECT COUNT(*) as count FROM exploits {recent_where}"
        recent_result = self.execute_one(recent_query, tuple(recent_params))
        recent_24h = recent_result['count'] if recent_result else 0

        return {
            "total_exploits": total_exploits,
            "total_amount_stolen_usd": float(total_stolen),
            "exploits_last_24h": recent_24h,
            "by_severity": by_severity,
            "by_chain": by_chain,
            "last_updated": datetime.utcnow().isoformat()
        }

    # ========== Webhook Management ==========

    def save_webhook_config(
        self,
        api_key: str,
        webhook_url: str,
        event_types: str,
        filters: str
    ) -> int:
        """Save or update webhook configuration."""
        # Check if webhook exists
        check_query = "SELECT id FROM webhooks WHERE api_key = ? AND webhook_url = ?"
        existing = self.execute_one(check_query, (api_key, webhook_url))

        if existing:
            # Update existing
            query = """
                UPDATE webhooks
                SET event_types = ?, filters = ?, updated_at = CURRENT_TIMESTAMP
                WHERE api_key = ? AND webhook_url = ?
            """
            self.execute_write(query, (event_types, filters, api_key, webhook_url))
            return existing['id']
        else:
            # Insert new
            query = """
                INSERT INTO webhooks (api_key, webhook_url, event_types, filters, created_at, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            self.execute_write(query, (api_key, webhook_url, event_types, filters))

            # Get the inserted ID
            result = self.execute_one("SELECT last_insert_rowid() as id")
            return result['id'] if result else 0

    def get_webhooks_by_api_key(self, api_key: str) -> List[Dict[str, Any]]:
        """Get all webhooks for an API key."""
        query = """
            SELECT id, webhook_url, event_types, filters, created_at, updated_at
            FROM webhooks
            WHERE api_key = ?
            ORDER BY created_at DESC
        """
        return self.execute_query(query, (api_key,))

    def delete_webhook(self, api_key: str, webhook_id: int) -> bool:
        """Delete a webhook configuration."""
        query = "DELETE FROM webhooks WHERE id = ? AND api_key = ?"
        rows = self.execute_write(query, (webhook_id, api_key))
        return rows > 0


# Global database instance
db = Database()
