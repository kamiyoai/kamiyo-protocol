"""
Scheduled background tasks for API maintenance
"""
import asyncio
import logging
import os
from datetime import datetime
from database import get_db

logger = logging.getLogger(__name__)


class ScheduledTaskRunner:
    """Runs scheduled maintenance tasks in background"""

    def __init__(self):
        self.db = get_db()
        self.running = False
        self.tasks = []

    async def clean_test_data(self):
        """Remove test exploits from database"""
        try:
            query = """
                DELETE FROM exploits
                WHERE source = 'test'
                RETURNING id, protocol
            """

            result = self.db.execute_with_retry(query, readonly=False)

            if result:
                deleted_count = len(result)
                logger.info(f"[SCHEDULED] Cleaned {deleted_count} test exploit(s)")
            else:
                logger.debug("[SCHEDULED] No test exploits to clean")

        except Exception as e:
            logger.error(f"[SCHEDULED] Error cleaning test data: {e}")

    async def run_hourly_tasks(self):
        """Run tasks every hour"""
        while self.running:
            try:
                logger.info("[SCHEDULED] Running hourly maintenance tasks...")

                # Clean test data
                await self.clean_test_data()

                logger.info("[SCHEDULED] Hourly tasks completed")

            except Exception as e:
                logger.error(f"[SCHEDULED] Error in hourly tasks: {e}")

            # Wait 1 hour
            await asyncio.sleep(3600)

    async def start(self):
        """Start background task runner"""
        if self.running:
            logger.warning("[SCHEDULED] Task runner already running")
            return

        self.running = True
        logger.info("[SCHEDULED] Starting scheduled task runner (hourly)")

        # Create background task
        task = asyncio.create_task(self.run_hourly_tasks())
        self.tasks.append(task)

    def stop(self):
        """Stop background task runner"""
        self.running = False
        logger.info("[SCHEDULED] Stopping scheduled task runner")

        # Cancel all tasks
        for task in self.tasks:
            task.cancel()

        self.tasks.clear()


# Singleton instance
_task_runner = None


def get_task_runner() -> ScheduledTaskRunner:
    """Get task runner singleton"""
    global _task_runner
    if _task_runner is None:
        _task_runner = ScheduledTaskRunner()
    return _task_runner
