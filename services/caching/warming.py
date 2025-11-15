# -*- coding: utf-8 -*-
"""
Cache Warming for Kamiyo
Proactive cache population and background refresh
"""

import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional, Set
from datetime import datetime, timedelta
from dataclasses import dataclass

from .cache_manager import CacheManager, get_cache_manager
from .strategies import CacheStrategy, get_strategy

logger = logging.getLogger(__name__)


@dataclass
class WarmingTask:
    """Cache warming task configuration"""
    key: str
    fetch_fn: Callable
    ttl: int = 300
    priority: int = 5  # 1-10, higher = more important
    interval: Optional[int] = None  # Refresh interval in seconds
    dependencies: List[str] = None  # Other tasks to warm first

    def __post_init__(self):
        if self.dependencies is None:
            self.dependencies = []


class CacheWarmer:
    """
    Proactive cache warming and background refresh

    Features:
    - Startup warming (pre-populate hot data)
    - Scheduled warming (periodic refresh)
    - Predictive warming (based on usage patterns)
    - Dependency-based warming (warm related data)
    """

    def __init__(
        self,
        cache_manager: Optional[CacheManager] = None,
        strategy: Optional[CacheStrategy] = None
    ):
        self.cache = cache_manager or get_cache_manager()
        self.strategy = strategy or get_strategy('cache_aside')

        # Warming tasks
        self.tasks: Dict[str, WarmingTask] = {}
        self.background_tasks: Set[asyncio.Task] = set()

        # Usage tracking for predictive warming
        self.access_counts: Dict[str, int] = {}
        self.last_access: Dict[str, datetime] = {}

        # Warming statistics
        self.stats = {
            'total_warmed': 0,
            'startup_warmed': 0,
            'scheduled_warmed': 0,
            'predictive_warmed': 0,
            'failed_warmings': 0,
            'last_warming': None,
        }

        # Control flags
        self.warming_in_progress = False
        self.enabled = True

    def register_task(self, task: WarmingTask):
        """
        Register warming task

        Args:
            task: Warming task configuration
        """
        self.tasks[task.key] = task
        logger.info(f"Registered warming task: {task.key}")

    def unregister_task(self, key: str):
        """
        Unregister warming task

        Args:
            key: Task key
        """
        if key in self.tasks:
            del self.tasks[key]
            logger.info(f"Unregistered warming task: {key}")

    async def warm_on_startup(self, max_concurrent: int = 5):
        """
        Warm cache on application startup

        Args:
            max_concurrent: Maximum concurrent warming tasks
        """
        if not self.enabled:
            logger.info("Cache warming disabled")
            return

        logger.info("Starting cache warming on startup...")
        self.warming_in_progress = True
        start_time = datetime.now()

        try:
            # Sort tasks by priority (highest first)
            sorted_tasks = sorted(
                self.tasks.values(),
                key=lambda t: t.priority,
                reverse=True
            )

            # Warm in batches
            for i in range(0, len(sorted_tasks), max_concurrent):
                batch = sorted_tasks[i:i + max_concurrent]
                await asyncio.gather(
                    *[self._warm_task(task) for task in batch],
                    return_exceptions=True
                )

            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"Startup warming completed in {duration:.2f}s")

            self.stats['startup_warmed'] = len(sorted_tasks)
            self.stats['last_warming'] = datetime.now().isoformat()

        except Exception as e:
            logger.error(f"Startup warming error: {e}")

        finally:
            self.warming_in_progress = False

    async def warm_key(self, key: str, force: bool = False):
        """
        Warm specific cache key

        Args:
            key: Cache key
            force: Force warming even if cached
        """
        if key not in self.tasks:
            logger.warning(f"No warming task for key: {key}")
            return

        # Check if already cached
        if not force and await self.cache.exists(key):
            logger.debug(f"Key already cached: {key}")
            return

        task = self.tasks[key]
        await self._warm_task(task)

    async def warm_pattern(self, pattern: str):
        """
        Warm all tasks matching pattern

        Args:
            pattern: Key pattern (e.g., "exploits:*")
        """
        import re

        pattern_re = re.compile(pattern.replace('*', '.*'))
        matching_tasks = [
            task for key, task in self.tasks.items()
            if pattern_re.match(key)
        ]

        logger.info(f"Warming {len(matching_tasks)} tasks matching '{pattern}'")

        await asyncio.gather(
            *[self._warm_task(task) for task in matching_tasks],
            return_exceptions=True
        )

    async def _warm_task(self, task: WarmingTask):
        """
        Execute warming task

        Args:
            task: Warming task
        """
        try:
            logger.debug(f"Warming cache: {task.key}")

            # Warm dependencies first
            if task.dependencies:
                for dep_key in task.dependencies:
                    if dep_key in self.tasks:
                        await self._warm_task(self.tasks[dep_key])

            # Fetch data
            if asyncio.iscoroutinefunction(task.fetch_fn):
                value = await task.fetch_fn()
            else:
                value = task.fetch_fn()

            # Store in cache
            if value is not None:
                await self.cache.set(task.key, value, ttl=task.ttl)
                self.stats['total_warmed'] += 1
                logger.debug(f"Warmed cache: {task.key}")
            else:
                logger.warning(f"No value returned for warming task: {task.key}")

        except Exception as e:
            logger.error(f"Failed to warm cache for {task.key}: {e}")
            self.stats['failed_warmings'] += 1

    async def start_scheduled_warming(self, default_interval: int = 300):
        """
        Start background scheduled warming

        Args:
            default_interval: Default refresh interval in seconds
        """
        if not self.enabled:
            return

        logger.info("Starting scheduled cache warming...")

        # Create background task for each warming task with interval
        for task in self.tasks.values():
            if task.interval:
                bg_task = asyncio.create_task(
                    self._scheduled_warming_loop(task)
                )
                self.background_tasks.add(bg_task)
                bg_task.add_done_callback(self.background_tasks.discard)

    async def _scheduled_warming_loop(self, task: WarmingTask):
        """
        Background loop for scheduled warming

        Args:
            task: Warming task
        """
        while self.enabled:
            try:
                await asyncio.sleep(task.interval)

                # Check if key is still being accessed
                if self._is_hot_key(task.key):
                    await self._warm_task(task)
                    self.stats['scheduled_warmed'] += 1
                else:
                    logger.debug(f"Skipping warming for cold key: {task.key}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduled warming error for {task.key}: {e}")

    def stop_scheduled_warming(self):
        """Stop all scheduled warming tasks"""
        logger.info("Stopping scheduled cache warming...")

        for task in self.background_tasks:
            task.cancel()

        self.background_tasks.clear()

    async def predictive_warming(
        self,
        min_access_count: int = 10,
        time_window_minutes: int = 60
    ):
        """
        Warm cache based on access patterns

        Args:
            min_access_count: Minimum access count to qualify
            time_window_minutes: Time window for access tracking
        """
        logger.info("Running predictive cache warming...")

        cutoff_time = datetime.now() - timedelta(minutes=time_window_minutes)

        # Find hot keys
        hot_keys = []
        for key, count in self.access_counts.items():
            if count >= min_access_count:
                if key in self.last_access and self.last_access[key] > cutoff_time:
                    hot_keys.append(key)

        logger.info(f"Identified {len(hot_keys)} hot keys for predictive warming")

        # Warm hot keys
        for key in hot_keys:
            if key in self.tasks:
                await self._warm_task(self.tasks[key])
                self.stats['predictive_warmed'] += 1

    def track_access(self, key: str):
        """
        Track cache access for predictive warming

        Args:
            key: Cache key
        """
        self.access_counts[key] = self.access_counts.get(key, 0) + 1
        self.last_access[key] = datetime.now()

    def _is_hot_key(self, key: str, min_accesses: int = 5) -> bool:
        """
        Check if key is frequently accessed

        Args:
            key: Cache key
            min_accesses: Minimum access count

        Returns:
            True if hot key
        """
        return self.access_counts.get(key, 0) >= min_accesses

    async def warm_exploits_list(
        self,
        db: Any,
        page_sizes: List[int] = None,
        chains: List[str] = None
    ):
        """
        Warm exploits list cache

        Args:
            db: Database instance
            page_sizes: Page sizes to warm
            chains: Chains to warm
        """
        page_sizes = page_sizes or [100, 50, 20]
        chains = chains or []

        logger.info("Warming exploits list cache...")

        # General exploits list
        for page_size in page_sizes:
            for page in [1, 2, 3]:  # First 3 pages
                self.register_task(WarmingTask(
                    key=f"exploits:page={page}:size={page_size}",
                    fetch_fn=lambda p=page, ps=page_size: db.get_recent_exploits(
                        limit=ps,
                        offset=(p-1)*ps
                    ),
                    ttl=300,  # 5 minutes
                    priority=8,
                    interval=300
                ))

        # Chain-specific exploits
        for chain in chains:
            for page_size in [100, 50]:
                self.register_task(WarmingTask(
                    key=f"exploits:chain={chain}:page=1:size={page_size}",
                    fetch_fn=lambda c=chain, ps=page_size: db.get_recent_exploits(
                        limit=ps,
                        chain=c
                    ),
                    ttl=300,
                    priority=7,
                    interval=300
                ))

        await self.warm_on_startup(max_concurrent=3)

    async def warm_statistics(self, db: Any):
        """
        Warm statistics cache

        Args:
            db: Database instance
        """
        logger.info("Warming statistics cache...")

        periods = [1, 7, 30, 90]  # days

        for days in periods:
            self.register_task(WarmingTask(
                key=f"stats:days={days}",
                fetch_fn=lambda d=days: db.get_stats_custom(days=d) if d > 1 else db.get_stats_24h(),
                ttl=3600,  # 1 hour
                priority=9,
                interval=1800  # Refresh every 30 minutes
            ))

        await self.warm_on_startup()

    async def warm_chains(self, db: Any):
        """
        Warm chains cache

        Args:
            db: Database instance
        """
        logger.info("Warming chains cache...")

        self.register_task(WarmingTask(
            key="chains:all",
            fetch_fn=db.get_chains,
            ttl=3600,
            priority=8,
            interval=1800
        ))

        await self.warm_on_startup()

    async def warm_health(self, db: Any):
        """
        Warm health status cache

        Args:
            db: Database instance
        """
        logger.info("Warming health cache...")

        self.register_task(WarmingTask(
            key="health:sources",
            fetch_fn=db.get_source_health,
            ttl=120,  # 2 minutes
            priority=6,
            interval=120
        ))

        await self.warm_on_startup()

    async def warm_popular_exploits(
        self,
        db: Any,
        limit: int = 50,
        min_amount: float = 1000000  # $1M+
    ):
        """
        Warm popular (high-value) exploits cache

        Args:
            db: Database instance
            limit: Number of exploits
            min_amount: Minimum loss amount
        """
        logger.info("Warming popular exploits cache...")

        self.register_task(WarmingTask(
            key=f"exploits:popular:limit={limit}",
            fetch_fn=lambda: db.get_recent_exploits(
                limit=limit,
                min_amount=min_amount
            ),
            ttl=600,  # 10 minutes
            priority=9,
            interval=300
        ))

        await self.warm_on_startup()

    def get_warming_progress(self) -> Dict[str, Any]:
        """
        Get warming progress

        Returns:
            Progress information
        """
        total_tasks = len(self.tasks)
        cached_tasks = 0

        # This would require checking cache asynchronously
        # For now, return basic info

        return {
            'total_tasks': total_tasks,
            'in_progress': self.warming_in_progress,
            'background_tasks': len(self.background_tasks),
            'enabled': self.enabled
        }

    def get_stats(self) -> Dict[str, Any]:
        """
        Get warming statistics

        Returns:
            Statistics dictionary
        """
        return {
            **self.stats,
            'total_tasks': len(self.tasks),
            'background_tasks': len(self.background_tasks),
            'enabled': self.enabled,
            'hot_keys': len([k for k in self.access_counts if self._is_hot_key(k)])
        }

    def enable(self):
        """Enable cache warming"""
        self.enabled = True
        logger.info("Cache warming enabled")

    def disable(self):
        """Disable cache warming"""
        self.enabled = False
        self.stop_scheduled_warming()
        logger.info("Cache warming disabled")


# Global warmer instance
_warmer: Optional[CacheWarmer] = None


def get_warmer() -> CacheWarmer:
    """Get global warmer instance"""
    global _warmer
    if _warmer is None:
        _warmer = CacheWarmer()
    return _warmer
