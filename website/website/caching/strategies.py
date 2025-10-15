# -*- coding: utf-8 -*-
"""
Caching Strategies for Kamiyo
Implements various caching patterns for different use cases
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, Optional, List
from datetime import datetime

from .cache_manager import CacheManager, get_cache_manager

logger = logging.getLogger(__name__)


class CacheStrategy(ABC):
    """Base class for caching strategies"""

    def __init__(self, cache_manager: Optional[CacheManager] = None):
        self.cache = cache_manager or get_cache_manager()

    @abstractmethod
    async def read(self, key: str, fetch_fn: Callable, **kwargs) -> Any:
        """Read value using strategy"""
        pass

    @abstractmethod
    async def write(self, key: str, value: Any, persist_fn: Optional[Callable] = None, **kwargs):
        """Write value using strategy"""
        pass

    @abstractmethod
    async def invalidate(self, key: str, **kwargs):
        """Invalidate cached value"""
        pass


class CacheAsideStrategy(CacheStrategy):
    """
    Cache-Aside (Lazy Loading) Pattern

    Application code explicitly manages cache:
    1. Check cache first
    2. If miss, fetch from DB
    3. Populate cache
    4. Return value

    Best for: Read-heavy workloads, infrequently changing data
    """

    async def read(
        self,
        key: str,
        fetch_fn: Callable,
        ttl: int = 300,
        **kwargs
    ) -> Any:
        """
        Read with cache-aside pattern

        Args:
            key: Cache key
            fetch_fn: Function to fetch from DB if cache miss
            ttl: Time to live in seconds

        Returns:
            Value from cache or DB
        """
        # Try cache first
        value = await self.cache.get(key)

        if value is not None:
            logger.debug(f"Cache-aside HIT: {key}")
            return value

        # Cache miss - fetch from source
        logger.debug(f"Cache-aside MISS: {key}")

        try:
            value = await fetch_fn() if asyncio.iscoroutinefunction(fetch_fn) else fetch_fn()

            # Populate cache
            if value is not None:
                await self.cache.set(key, value, ttl=ttl)

            return value

        except Exception as e:
            logger.error(f"Cache-aside fetch error for {key}: {e}")
            raise

    async def write(
        self,
        key: str,
        value: Any,
        persist_fn: Optional[Callable] = None,
        ttl: int = 300,
        **kwargs
    ):
        """
        Write with cache-aside pattern

        1. Write to DB
        2. Invalidate cache (or update it)

        Args:
            key: Cache key
            value: Value to write
            persist_fn: Function to persist to DB
            ttl: Time to live if updating cache
        """
        # Persist to database
        if persist_fn:
            try:
                await persist_fn(value) if asyncio.iscoroutinefunction(persist_fn) else persist_fn(value)
            except Exception as e:
                logger.error(f"Cache-aside persist error for {key}: {e}")
                raise

        # Invalidate cache (safe approach)
        await self.cache.delete(key)

        # Alternatively, update cache immediately
        # await self.cache.set(key, value, ttl=ttl)

    async def invalidate(self, key: str, **kwargs):
        """Invalidate cache entry"""
        await self.cache.delete(key)


class WriteThroughStrategy(CacheStrategy):
    """
    Write-Through Caching Pattern

    Writes go through cache to database:
    1. Write to cache
    2. Synchronously write to DB
    3. Return success

    Best for: Data consistency critical, moderate write frequency
    """

    async def read(
        self,
        key: str,
        fetch_fn: Callable,
        ttl: int = 300,
        **kwargs
    ) -> Any:
        """
        Read with write-through pattern (same as cache-aside)

        Args:
            key: Cache key
            fetch_fn: Function to fetch from DB
            ttl: Time to live

        Returns:
            Value from cache or DB
        """
        # Check cache
        value = await self.cache.get(key)

        if value is not None:
            logger.debug(f"Write-through HIT: {key}")
            return value

        # Fetch from DB
        logger.debug(f"Write-through MISS: {key}")

        try:
            value = await fetch_fn() if asyncio.iscoroutinefunction(fetch_fn) else fetch_fn()

            if value is not None:
                await self.cache.set(key, value, ttl=ttl)

            return value

        except Exception as e:
            logger.error(f"Write-through fetch error for {key}: {e}")
            raise

    async def write(
        self,
        key: str,
        value: Any,
        persist_fn: Optional[Callable] = None,
        ttl: int = 300,
        **kwargs
    ):
        """
        Write with write-through pattern

        1. Write to cache
        2. Synchronously write to DB
        3. If DB write fails, invalidate cache

        Args:
            key: Cache key
            value: Value to write
            persist_fn: Function to persist to DB
            ttl: Time to live
        """
        # Write to cache first
        await self.cache.set(key, value, ttl=ttl)

        # Then persist to database
        if persist_fn:
            try:
                await persist_fn(value) if asyncio.iscoroutinefunction(persist_fn) else persist_fn(value)
                logger.debug(f"Write-through success: {key}")
            except Exception as e:
                # DB write failed - invalidate cache to maintain consistency
                logger.error(f"Write-through persist failed for {key}: {e}")
                await self.cache.delete(key)
                raise

    async def invalidate(self, key: str, **kwargs):
        """Invalidate cache entry"""
        await self.cache.delete(key)


class WriteBehindStrategy(CacheStrategy):
    """
    Write-Behind (Write-Back) Caching Pattern

    Writes are asynchronous:
    1. Write to cache immediately
    2. Return success
    3. Asynchronously write to DB in background

    Best for: High write frequency, eventual consistency acceptable
    """

    def __init__(self, cache_manager: Optional[CacheManager] = None, batch_size: int = 100):
        super().__init__(cache_manager)
        self.batch_size = batch_size
        self.write_queue: List[Dict[str, Any]] = []
        self.write_lock = asyncio.Lock()

    async def read(
        self,
        key: str,
        fetch_fn: Callable,
        ttl: int = 300,
        **kwargs
    ) -> Any:
        """
        Read with write-behind pattern

        Check cache first (most up-to-date), then DB

        Args:
            key: Cache key
            fetch_fn: Function to fetch from DB
            ttl: Time to live

        Returns:
            Value from cache or DB
        """
        # Cache should always be most up-to-date
        value = await self.cache.get(key)

        if value is not None:
            logger.debug(f"Write-behind HIT: {key}")
            return value

        # Fetch from DB (rare in write-behind)
        logger.debug(f"Write-behind MISS: {key}")

        try:
            value = await fetch_fn() if asyncio.iscoroutinefunction(fetch_fn) else fetch_fn()

            if value is not None:
                await self.cache.set(key, value, ttl=ttl)

            return value

        except Exception as e:
            logger.error(f"Write-behind fetch error for {key}: {e}")
            raise

    async def write(
        self,
        key: str,
        value: Any,
        persist_fn: Optional[Callable] = None,
        ttl: int = 300,
        immediate: bool = False,
        **kwargs
    ):
        """
        Write with write-behind pattern

        1. Write to cache immediately
        2. Queue DB write for background processing
        3. Return immediately

        Args:
            key: Cache key
            value: Value to write
            persist_fn: Function to persist to DB
            ttl: Time to live
            immediate: If True, write to DB immediately
        """
        # Write to cache immediately
        await self.cache.set(key, value, ttl=ttl)

        # Queue DB write
        if persist_fn:
            if immediate:
                # Immediate write (blocking)
                try:
                    await persist_fn(value) if asyncio.iscoroutinefunction(persist_fn) else persist_fn(value)
                except Exception as e:
                    logger.error(f"Write-behind immediate persist failed for {key}: {e}")
                    # Don't invalidate cache - value is still good
            else:
                # Queue for background write
                async with self.write_lock:
                    self.write_queue.append({
                        'key': key,
                        'value': value,
                        'persist_fn': persist_fn,
                        'timestamp': datetime.now()
                    })

                    # Flush if batch size reached
                    if len(self.write_queue) >= self.batch_size:
                        asyncio.create_task(self._flush_writes())

    async def _flush_writes(self):
        """Flush pending writes to database"""
        async with self.write_lock:
            if not self.write_queue:
                return

            batch = self.write_queue.copy()
            self.write_queue.clear()

        logger.info(f"Flushing {len(batch)} writes to database")

        for item in batch:
            try:
                persist_fn = item['persist_fn']
                value = item['value']

                if asyncio.iscoroutinefunction(persist_fn):
                    await persist_fn(value)
                else:
                    persist_fn(value)

            except Exception as e:
                logger.error(f"Write-behind flush failed for {item['key']}: {e}")
                # Could implement retry logic here

    async def invalidate(self, key: str, flush: bool = True, **kwargs):
        """
        Invalidate cache entry

        Args:
            key: Cache key
            flush: If True, flush pending writes first
        """
        if flush:
            await self._flush_writes()

        await self.cache.delete(key)


class ReadThroughStrategy(CacheStrategy):
    """
    Read-Through Caching Pattern

    Cache sits between application and DB:
    1. Application requests from cache
    2. Cache fetches from DB if miss
    3. Cache populates itself
    4. Returns value

    Best for: Simplifying application code, uniform caching logic
    """

    def __init__(
        self,
        cache_manager: Optional[CacheManager] = None,
        default_fetch_fn: Optional[Callable] = None
    ):
        super().__init__(cache_manager)
        self.default_fetch_fn = default_fetch_fn

    async def read(
        self,
        key: str,
        fetch_fn: Optional[Callable] = None,
        ttl: int = 300,
        **kwargs
    ) -> Any:
        """
        Read with read-through pattern

        Cache automatically handles DB fetch on miss

        Args:
            key: Cache key
            fetch_fn: Function to fetch from DB
            ttl: Time to live

        Returns:
            Value from cache or DB
        """
        fetch_fn = fetch_fn or self.default_fetch_fn

        if fetch_fn is None:
            raise ValueError("No fetch function provided for read-through")

        # Check cache
        value = await self.cache.get(key)

        if value is not None:
            logger.debug(f"Read-through HIT: {key}")
            return value

        # Cache miss - fetch and populate
        logger.debug(f"Read-through MISS: {key}")

        try:
            value = await fetch_fn(key) if asyncio.iscoroutinefunction(fetch_fn) else fetch_fn(key)

            if value is not None:
                await self.cache.set(key, value, ttl=ttl)

            return value

        except Exception as e:
            logger.error(f"Read-through fetch error for {key}: {e}")
            raise

    async def write(
        self,
        key: str,
        value: Any,
        persist_fn: Optional[Callable] = None,
        ttl: int = 300,
        **kwargs
    ):
        """
        Write with read-through pattern

        Write to DB and invalidate cache

        Args:
            key: Cache key
            value: Value to write
            persist_fn: Function to persist to DB
            ttl: Time to live
        """
        # Persist to database
        if persist_fn:
            try:
                await persist_fn(value) if asyncio.iscoroutinefunction(persist_fn) else persist_fn(value)
            except Exception as e:
                logger.error(f"Read-through persist error for {key}: {e}")
                raise

        # Invalidate cache - next read will populate it
        await self.cache.delete(key)

    async def invalidate(self, key: str, **kwargs):
        """Invalidate cache entry"""
        await self.cache.delete(key)


class RefreshAheadStrategy(CacheStrategy):
    """
    Refresh-Ahead Caching Pattern

    Proactively refresh cache before expiration:
    1. Check cache
    2. If near expiration, trigger background refresh
    3. Return current cached value
    4. Background task updates cache

    Best for: Frequently accessed data, avoiding cache stampede
    """

    def __init__(
        self,
        cache_manager: Optional[CacheManager] = None,
        refresh_threshold: float = 0.8  # Refresh when 80% of TTL expired
    ):
        super().__init__(cache_manager)
        self.refresh_threshold = refresh_threshold
        self.refresh_tasks: Dict[str, asyncio.Task] = {}

    async def read(
        self,
        key: str,
        fetch_fn: Callable,
        ttl: int = 300,
        **kwargs
    ) -> Any:
        """
        Read with refresh-ahead pattern

        Args:
            key: Cache key
            fetch_fn: Function to fetch from DB
            ttl: Time to live

        Returns:
            Value from cache or DB
        """
        # Check cache
        value = await self.cache.get(key)

        if value is not None:
            logger.debug(f"Refresh-ahead HIT: {key}")

            # Check if refresh needed
            remaining_ttl = await self.cache.ttl(key)

            if remaining_ttl > 0:
                refresh_time = ttl * self.refresh_threshold

                if remaining_ttl < (ttl - refresh_time):
                    # Schedule refresh
                    if key not in self.refresh_tasks or self.refresh_tasks[key].done():
                        logger.debug(f"Scheduling refresh for {key}")
                        self.refresh_tasks[key] = asyncio.create_task(
                            self._refresh_cache(key, fetch_fn, ttl)
                        )

            return value

        # Cache miss - fetch and populate
        logger.debug(f"Refresh-ahead MISS: {key}")

        try:
            value = await fetch_fn() if asyncio.iscoroutinefunction(fetch_fn) else fetch_fn()

            if value is not None:
                await self.cache.set(key, value, ttl=ttl)

            return value

        except Exception as e:
            logger.error(f"Refresh-ahead fetch error for {key}: {e}")
            raise

    async def _refresh_cache(self, key: str, fetch_fn: Callable, ttl: int):
        """Background task to refresh cache"""
        try:
            logger.debug(f"Refreshing cache: {key}")

            value = await fetch_fn() if asyncio.iscoroutinefunction(fetch_fn) else fetch_fn()

            if value is not None:
                await self.cache.set(key, value, ttl=ttl)
                logger.debug(f"Cache refreshed: {key}")

        except Exception as e:
            logger.error(f"Refresh-ahead refresh error for {key}: {e}")

    async def write(
        self,
        key: str,
        value: Any,
        persist_fn: Optional[Callable] = None,
        ttl: int = 300,
        **kwargs
    ):
        """
        Write with refresh-ahead pattern

        Args:
            key: Cache key
            value: Value to write
            persist_fn: Function to persist to DB
            ttl: Time to live
        """
        # Persist to database
        if persist_fn:
            try:
                await persist_fn(value) if asyncio.iscoroutinefunction(persist_fn) else persist_fn(value)
            except Exception as e:
                logger.error(f"Refresh-ahead persist error for {key}: {e}")
                raise

        # Update cache
        await self.cache.set(key, value, ttl=ttl)

        # Cancel any pending refresh
        if key in self.refresh_tasks and not self.refresh_tasks[key].done():
            self.refresh_tasks[key].cancel()

    async def invalidate(self, key: str, **kwargs):
        """Invalidate cache entry and cancel refresh"""
        # Cancel pending refresh
        if key in self.refresh_tasks and not self.refresh_tasks[key].done():
            self.refresh_tasks[key].cancel()

        await self.cache.delete(key)


# Strategy factory
def get_strategy(strategy_name: str, **kwargs) -> CacheStrategy:
    """
    Get cache strategy by name

    Args:
        strategy_name: Name of strategy
        **kwargs: Additional arguments for strategy

    Returns:
        CacheStrategy instance
    """
    strategies = {
        'cache_aside': CacheAsideStrategy,
        'write_through': WriteThroughStrategy,
        'write_behind': WriteBehindStrategy,
        'read_through': ReadThroughStrategy,
        'refresh_ahead': RefreshAheadStrategy,
    }

    strategy_class = strategies.get(strategy_name.lower())

    if strategy_class is None:
        raise ValueError(f"Unknown strategy: {strategy_name}")

    return strategy_class(**kwargs)
