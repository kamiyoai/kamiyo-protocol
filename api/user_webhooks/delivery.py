# -*- coding: utf-8 -*-
"""
Webhook Delivery System
Handles sending exploit alerts to user webhook endpoints with retry logic
"""

import os
import sys
import json
import logging
import hmac
import hashlib
import time
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

import httpx
from sqlalchemy.orm import Session

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from api.database import SessionLocal

logger = logging.getLogger(__name__)


class WebhookDeliveryService:
    """
    Service for delivering webhook notifications to user endpoints

    Features:
    - Async HTTP delivery
    - HMAC signature verification
    - Exponential backoff retry
    - Delivery logging
    - Stats tracking
    """

    def __init__(self, db: Session = None):
        self.db = db or SessionLocal()
        self.timeout = 10.0  # seconds
        self.max_attempts = 3
        self.retry_delays = [60, 300, 900]  # 1min, 5min, 15min

    async def send_exploit_to_webhooks(self, exploit_id: int):
        """
        Send exploit alert to all matching webhooks

        Args:
            exploit_id: ID of new exploit

        Returns:
            Number of webhooks notified
        """
        try:
            # Get exploit details
            exploit = self._get_exploit(exploit_id)

            if not exploit:
                logger.error(f"Exploit {exploit_id} not found")
                return 0

            # Get all active webhooks
            webhooks = self._get_active_webhooks()

            # Filter webhooks by user's alert preferences
            matching_webhooks = [
                wh for wh in webhooks
                if self._webhook_matches_exploit(wh, exploit)
            ]

            logger.info(
                f"Sending exploit {exploit_id} to {len(matching_webhooks)} webhooks "
                f"(out of {len(webhooks)} active)"
            )

            # Send to all matching webhooks (concurrently)
            tasks = [
                self._deliver_to_webhook(wh, exploit)
                for wh in matching_webhooks
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Count successes
            successes = sum(1 for r in results if r is True)

            logger.info(
                f"Delivered exploit {exploit_id} to {successes}/{len(matching_webhooks)} webhooks"
            )

            return successes

        except Exception as e:
            logger.error(f"Error sending exploit {exploit_id} to webhooks: {e}")
            return 0

    async def _deliver_to_webhook(
        self,
        webhook: Dict[str, Any],
        exploit: Dict[str, Any]
    ) -> bool:
        """
        Deliver single webhook notification

        Args:
            webhook: Webhook configuration dict
            exploit: Exploit data dict

        Returns:
            True if successful, False otherwise
        """
        webhook_id = webhook['id']
        url = webhook['url']

        try:
            # Build payload
            payload = self._build_payload(exploit)
            payload_json = json.dumps(payload, default=str)

            # Generate HMAC signature
            signature = self._generate_signature(webhook['secret'], payload_json)

            # Send HTTP request
            start_time = time.time()

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        'Content-Type': 'application/json',
                        'X-Kamiyo-Signature': signature,
                        'X-Kamiyo-Event': 'exploit.detected',
                        'X-Kamiyo-Delivery-Id': f"{webhook_id}-{exploit['id']}-{int(time.time())}"
                    }
                )

            latency_ms = int((time.time() - start_time) * 1000)

            # Log delivery
            success = response.status_code < 300

            self._log_delivery(
                webhook_id=webhook_id,
                exploit_id=exploit['id'],
                url=url,
                payload=payload_json,
                signature=signature,
                status_code=response.status_code,
                response_body=response.text[:1000],  # Limit size
                error=None if success else f"HTTP {response.status_code}",
                attempt_number=1,
                success=success
            )

            if success:
                logger.info(
                    f"✓ Webhook {webhook_id} delivered successfully "
                    f"(exploit {exploit['id']}, {latency_ms}ms)"
                )
                return True
            else:
                logger.warning(
                    f"✗ Webhook {webhook_id} failed with HTTP {response.status_code} "
                    f"(exploit {exploit['id']})"
                )
                # Schedule retry
                await self._schedule_retry(webhook_id, exploit['id'])
                return False

        except Exception as e:
            logger.error(f"✗ Webhook {webhook_id} error: {e}")

            # Log failure
            self._log_delivery(
                webhook_id=webhook_id,
                exploit_id=exploit['id'],
                url=url,
                payload=json.dumps(self._build_payload(exploit), default=str),
                signature="",
                status_code=None,
                response_body=None,
                error=str(e)[:500],
                attempt_number=1,
                success=False
            )

            # Schedule retry
            await self._schedule_retry(webhook_id, exploit['id'])
            return False

    async def _schedule_retry(self, webhook_id: int, exploit_id: int):
        """
        Schedule retry for failed webhook delivery

        Args:
            webhook_id: Webhook ID
            exploit_id: Exploit ID
        """
        try:
            # Get last delivery attempt
            result = self.db.execute(
                """
                SELECT id, attempt_number FROM webhook_deliveries
                WHERE webhook_id = ? AND exploit_id = ?
                ORDER BY sent_at DESC LIMIT 1
                """,
                (webhook_id, exploit_id)
            ).fetchone()

            if not result:
                return

            delivery_id, attempt_number = result

            # Check if we should retry
            if attempt_number >= self.max_attempts:
                logger.warning(
                    f"Max retry attempts reached for webhook {webhook_id}, "
                    f"exploit {exploit_id}"
                )
                return

            # Calculate next retry time
            delay_seconds = self.retry_delays[attempt_number - 1]
            next_retry_at = datetime.now() + timedelta(seconds=delay_seconds)

            # Update delivery record
            self.db.execute(
                "UPDATE webhook_deliveries SET next_retry_at = ? WHERE id = ?",
                (next_retry_at, delivery_id)
            )
            self.db.commit()

            logger.info(
                f"Scheduled retry for webhook {webhook_id}, exploit {exploit_id} "
                f"at {next_retry_at} (attempt {attempt_number + 1}/{self.max_attempts})"
            )

        except Exception as e:
            logger.error(f"Error scheduling retry: {e}")

    async def process_retries(self):
        """
        Process all pending retries

        Called periodically by background worker
        """
        try:
            # Get deliveries ready for retry
            results = self.db.execute(
                """
                SELECT
                    d.id,
                    d.webhook_id,
                    d.exploit_id,
                    d.attempt_number,
                    w.url,
                    w.secret
                FROM webhook_deliveries d
                JOIN user_webhooks w ON d.webhook_id = w.id
                WHERE d.next_retry_at IS NOT NULL
                AND d.next_retry_at <= ?
                AND d.attempt_number < ?
                AND w.is_active = 1
                """,
                (datetime.now(), self.max_attempts)
            ).fetchall()

            if not results:
                return 0

            logger.info(f"Processing {len(results)} webhook retries")

            retry_count = 0

            for row in results:
                delivery_id, webhook_id, exploit_id, attempt_number, url, secret = row

                # Get exploit
                exploit = self._get_exploit(exploit_id)

                if not exploit:
                    continue

                # Attempt redelivery
                success = await self._retry_delivery(
                    delivery_id=delivery_id,
                    webhook_id=webhook_id,
                    exploit=exploit,
                    url=url,
                    secret=secret,
                    attempt_number=attempt_number + 1
                )

                if success:
                    retry_count += 1

            logger.info(f"Successfully retried {retry_count}/{len(results)} webhooks")

            return retry_count

        except Exception as e:
            logger.error(f"Error processing retries: {e}")
            return 0

    async def _retry_delivery(
        self,
        delivery_id: int,
        webhook_id: int,
        exploit: Dict[str, Any],
        url: str,
        secret: str,
        attempt_number: int
    ) -> bool:
        """Retry failed delivery"""
        try:
            # Build payload
            payload = self._build_payload(exploit)
            payload_json = json.dumps(payload, default=str)

            # Generate signature
            signature = self._generate_signature(secret, payload_json)

            # Send HTTP request
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        'Content-Type': 'application/json',
                        'X-Kamiyo-Signature': signature,
                        'X-Kamiyo-Event': 'exploit.detected',
                        'X-Kamiyo-Retry-Attempt': str(attempt_number)
                    }
                )

            success = response.status_code < 300

            # Update delivery record
            if success:
                self.db.execute(
                    """
                    UPDATE webhook_deliveries
                    SET status_code = ?, response_body = ?, delivered_at = ?,
                        next_retry_at = NULL, attempt_number = ?
                    WHERE id = ?
                    """,
                    (response.status_code, response.text[:1000], datetime.now(),
                     attempt_number, delivery_id)
                )
                # Update webhook stats
                self.db.execute(
                    """
                    UPDATE user_webhooks
                    SET total_success = total_success + 1,
                        last_success_at = ?
                    WHERE id = ?
                    """,
                    (datetime.now(), webhook_id)
                )
            else:
                # Schedule next retry if attempts remain
                next_retry_at = None
                if attempt_number < self.max_attempts:
                    delay = self.retry_delays[attempt_number - 1]
                    next_retry_at = datetime.now() + timedelta(seconds=delay)

                self.db.execute(
                    """
                    UPDATE webhook_deliveries
                    SET status_code = ?, response_body = ?, error = ?,
                        failed_at = ?, next_retry_at = ?, attempt_number = ?
                    WHERE id = ?
                    """,
                    (response.status_code, response.text[:1000],
                     f"HTTP {response.status_code}", datetime.now(),
                     next_retry_at, attempt_number, delivery_id)
                )

                # Update webhook stats
                if attempt_number >= self.max_attempts:
                    self.db.execute(
                        """
                        UPDATE user_webhooks
                        SET total_failed = total_failed + 1,
                            last_failure_at = ?, last_error = ?
                        WHERE id = ?
                        """,
                        (datetime.now(), f"HTTP {response.status_code}", webhook_id)
                    )

            self.db.commit()

            return success

        except Exception as e:
            logger.error(f"Retry delivery error: {e}")

            # Mark as failed
            self.db.execute(
                """
                UPDATE webhook_deliveries
                SET error = ?, failed_at = ?, next_retry_at = NULL
                WHERE id = ?
                """,
                (str(e)[:500], datetime.now(), delivery_id)
            )

            # Update webhook stats
            self.db.execute(
                """
                UPDATE user_webhooks
                SET total_failed = total_failed + 1,
                    last_failure_at = ?, last_error = ?
                WHERE id = ?
                """,
                (datetime.now(), str(e)[:500], webhook_id)
            )

            self.db.commit()

            return False

    def _get_exploit(self, exploit_id: int) -> Optional[Dict[str, Any]]:
        """Get exploit by ID"""
        result = self.db.execute(
            """
            SELECT id, tx_hash, chain, protocol, amount_usd,
                   timestamp, source, source_url, category, description
            FROM exploits WHERE id = ?
            """,
            (exploit_id,)
        ).fetchone()

        if not result:
            return None

        return {
            'id': result[0],
            'tx_hash': result[1],
            'chain': result[2],
            'protocol': result[3],
            'amount_usd': result[4],
            'timestamp': result[5],
            'source': result[6],
            'source_url': result[7],
            'category': result[8],
            'description': result[9]
        }

    def _get_active_webhooks(self) -> List[Dict[str, Any]]:
        """Get all active webhooks"""
        results = self.db.execute(
            """
            SELECT id, user_id, url, secret, min_amount_usd,
                   chains, protocols, categories
            FROM user_webhooks WHERE is_active = 1
            """
        ).fetchall()

        return [
            {
                'id': row[0],
                'user_id': row[1],
                'url': row[2],
                'secret': row[3],
                'min_amount_usd': row[4],
                'chains': json.loads(row[5]) if row[5] else None,
                'protocols': json.loads(row[6]) if row[6] else None,
                'categories': json.loads(row[7]) if row[7] else None
            }
            for row in results
        ]

    def _webhook_matches_exploit(
        self,
        webhook: Dict[str, Any],
        exploit: Dict[str, Any]
    ) -> bool:
        """Check if webhook filters match exploit"""

        # Check min amount
        if webhook['min_amount_usd'] is not None:
            if exploit['amount_usd'] is None or exploit['amount_usd'] < webhook['min_amount_usd']:
                return False

        # Check chains filter
        if webhook['chains'] is not None:
            if exploit['chain'] not in webhook['chains']:
                return False

        # Check protocols filter
        if webhook['protocols'] is not None:
            if exploit['protocol'] not in webhook['protocols']:
                return False

        # Check categories filter
        if webhook['categories'] is not None:
            if exploit['category'] is None or exploit['category'] not in webhook['categories']:
                return False

        return True

    def _build_payload(self, exploit: Dict[str, Any]) -> Dict[str, Any]:
        """Build webhook payload"""
        return {
            'event': 'exploit.detected',
            'timestamp': int(time.time()),
            'exploit': {
                'id': exploit['id'],
                'tx_hash': exploit['tx_hash'],
                'chain': exploit['chain'],
                'protocol': exploit['protocol'],
                'amount_usd': exploit['amount_usd'],
                'timestamp': exploit['timestamp'].isoformat() if isinstance(exploit['timestamp'], datetime) else exploit['timestamp'],
                'source': exploit['source'],
                'source_url': exploit['source_url'],
                'category': exploit['category'],
                'description': exploit['description']
            }
        }

    def _generate_signature(self, secret: str, payload: str) -> str:
        """Generate HMAC-SHA256 signature"""
        return hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

    def _log_delivery(
        self,
        webhook_id: int,
        exploit_id: int,
        url: str,
        payload: str,
        signature: str,
        status_code: Optional[int],
        response_body: Optional[str],
        error: Optional[str],
        attempt_number: int,
        success: bool
    ):
        """Log webhook delivery attempt"""
        try:
            # Insert delivery log
            self.db.execute(
                """
                INSERT INTO webhook_deliveries (
                    webhook_id, exploit_id, url, payload, signature,
                    status_code, response_body, error, attempt_number,
                    sent_at, delivered_at, failed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    webhook_id,
                    exploit_id,
                    url,
                    payload,
                    signature,
                    status_code,
                    response_body,
                    error,
                    attempt_number,
                    datetime.now(),
                    datetime.now() if success else None,
                    None if success else datetime.now()
                )
            )

            # Update webhook stats
            if success:
                self.db.execute(
                    """
                    UPDATE user_webhooks
                    SET total_sent = total_sent + 1,
                        total_success = total_success + 1,
                        last_sent_at = ?, last_success_at = ?
                    WHERE id = ?
                    """,
                    (datetime.now(), datetime.now(), webhook_id)
                )
            else:
                self.db.execute(
                    """
                    UPDATE user_webhooks
                    SET total_sent = total_sent + 1,
                        last_sent_at = ?
                    WHERE id = ?
                    """,
                    (datetime.now(), webhook_id)
                )

            self.db.commit()

        except Exception as e:
            logger.error(f"Error logging delivery: {e}")
            self.db.rollback()


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Webhook Delivery Service ===\n")
    print("Features:")
    print("  • Async HTTP delivery")
    print("  • HMAC-SHA256 signatures")
    print("  • Exponential backoff retry (1min, 5min, 15min)")
    print("  • Filter by amount, chain, protocol, category")
    print("  • Delivery logging and stats")
    print("\n✅ Webhook delivery service ready")
