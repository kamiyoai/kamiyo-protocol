# -*- coding: utf-8 -*-
"""
Webhook Worker Service
Background worker for processing webhook deliveries and retries
"""

import os
import sys
import logging
import asyncio
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from api.database import SessionLocal
from api.user_webhooks.delivery import WebhookDeliveryService

logger = logging.getLogger(__name__)


class WebhookWorker:
    """
    Background worker for webhook system

    Responsibilities:
    - Process retry queue every minute
    - Monitor webhook health
    - Clean up old delivery logs
    """

    def __init__(self):
        self.is_running = False
        self.retry_interval = 60  # Process retries every 60 seconds
        self.cleanup_interval = 3600  # Clean up every hour

    async def start(self):
        """Start the worker"""
        self.is_running = True
        logger.info("Webhook worker started")

        # Start background tasks
        await asyncio.gather(
            self._retry_processor(),
            self._cleanup_processor()
        )

    async def stop(self):
        """Stop the worker"""
        self.is_running = False
        logger.info("Webhook worker stopped")

    async def _retry_processor(self):
        """Process retry queue periodically"""
        while self.is_running:
            try:
                db = SessionLocal()
                service = WebhookDeliveryService(db)

                # Process retries
                retry_count = await service.process_retries()

                if retry_count > 0:
                    logger.info(f"Processed {retry_count} webhook retries")

                db.close()

            except Exception as e:
                logger.error(f"Error in retry processor: {e}")

            # Wait before next iteration
            await asyncio.sleep(self.retry_interval)

    async def _cleanup_processor(self):
        """Clean up old delivery logs periodically"""
        while self.is_running:
            try:
                db = SessionLocal()

                # Delete delivery logs older than 30 days
                result = db.execute(
                    """
                    DELETE FROM webhook_deliveries
                    WHERE sent_at < datetime('now', '-30 days')
                    """
                )
                deleted = result.rowcount
                db.commit()

                if deleted > 0:
                    logger.info(f"Cleaned up {deleted} old webhook delivery logs")

                db.close()

            except Exception as e:
                logger.error(f"Error in cleanup processor: {e}")

            # Wait before next iteration
            await asyncio.sleep(self.cleanup_interval)


# Global worker instance
_worker: WebhookWorker = None


async def start_webhook_worker():
    """Start the global webhook worker"""
    global _worker

    if _worker is None:
        _worker = WebhookWorker()
        await _worker.start()


async def stop_webhook_worker():
    """Stop the global webhook worker"""
    global _worker

    if _worker is not None:
        await _worker.stop()
        _worker = None


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    print("\n=== Webhook Worker Service ===\n")
    print("Starting worker...")

    async def main():
        worker = WebhookWorker()
        try:
            # Run for 5 minutes as a test
            await asyncio.wait_for(worker.start(), timeout=300)
        except asyncio.TimeoutError:
            await worker.stop()
            print("\n✅ Worker test completed")

    asyncio.run(main())
