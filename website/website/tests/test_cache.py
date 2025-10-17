# -*- coding: utf-8 -*-
"""
Test suite for caching system
"""

import pytest
import asyncio
import time
from unittest.mock import Mock, AsyncMock, patch

from caching.cache_manager import CacheManager, cached, cache_invalidate
from caching.strategies import (
    CacheAsideStrategy,
    WriteThroughStrategy,
    WriteBehindStrategy,
    RefreshAheadStrategy
)
from caching.invalidation import CacheInvalidator, InvalidationEvent
from caching.warming import CacheWarmer, WarmingTask
from config.cache_config import CacheConfig


class TestCacheManager:
    """Test CacheManager functionality"""

    @pytest.fixture
    async def cache_manager(self):
        """Create cache manager for testing"""
        cache = CacheManager(
            redis_url="redis://localhost:6379/15",  # Test database
            namespace="test",
            enable_l1=True,
            l1_max_size=100
        )
        try:
            await cache.connect()
            yield cache
        finally:
            await cache.clear()
            await cache.disconnect()

    @pytest.mark.asyncio
    async def test_basic_get_set(self, cache_manager):
        """Test basic cache operations"""
        # Set value
        success = await cache_manager.set("test_key", "test_value", ttl=60)
        assert success

        # Get value
        value = await cache_manager.get("test_key")
        assert value == "test_value"

        # Delete value
        success = await cache_manager.delete("test_key")
        assert success

        # Verify deleted
        value = await cache_manager.get("test_key")
        assert value is None

    @pytest.mark.asyncio
    async def test_ttl_expiration(self, cache_manager):
        """Test TTL expiration"""
        # Set with short TTL
        await cache_manager.set("expire_key", "value", ttl=1)

        # Should exist immediately
        assert await cache_manager.exists("expire_key")

        # Wait for expiration
        await asyncio.sleep(2)

        # Should be expired
        value = await cache_manager.get("expire_key")
        assert value is None

    @pytest.mark.asyncio
    async def test_l1_cache(self, cache_manager):
        """Test L1 (in-memory) cache"""
        # Set value
        await cache_manager.set("l1_key", "l1_value", ttl=60)

        # First get - from Redis
        value1 = await cache_manager.get("l1_key")

        # Second get - should be from L1
        value2 = await cache_manager.get("l1_key")

        assert value1 == value2 == "l1_value"

        # Check L1 cache size
        assert cache_manager.l1.size > 0

    @pytest.mark.asyncio
    async def test_pattern_deletion(self, cache_manager):
        """Test pattern-based deletion"""
        # Set multiple keys
        await cache_manager.set("user:1:profile", {"id": 1})
        await cache_manager.set("user:2:profile", {"id": 2})
        await cache_manager.set("post:1", {"id": 1})

        # Delete user pattern
        count = await cache_manager.delete_pattern("user:*")
        assert count >= 2

        # Verify deletion
        assert await cache_manager.get("user:1:profile") is None
        assert await cache_manager.get("user:2:profile") is None

        # Other keys should remain
        assert await cache_manager.get("post:1") is not None

    @pytest.mark.asyncio
    async def test_mget_mset(self, cache_manager):
        """Test bulk operations"""
        # Bulk set
        mapping = {
            "key1": "value1",
            "key2": "value2",
            "key3": "value3"
        }
        success = await cache_manager.mset(mapping, ttl=60)
        assert success

        # Bulk get
        values = await cache_manager.mget(["key1", "key2", "key3"])
        assert values == mapping

    @pytest.mark.asyncio
    async def test_statistics(self, cache_manager):
        """Test cache statistics"""
        # Perform operations
        await cache_manager.set("stat_key", "value")
        await cache_manager.get("stat_key")  # Hit
        await cache_manager.get("nonexistent")  # Miss

        # Get stats
        stats = cache_manager.get_stats()
        assert stats['global']['hits'] >= 1
        assert stats['global']['misses'] >= 1
        assert stats['global']['hit_rate'] > 0


class TestCachingStrategies:
    """Test caching strategies"""

    @pytest.fixture
    async def cache_manager(self):
        """Create cache manager for testing"""
        cache = CacheManager(
            redis_url="redis://localhost:6379/15",
            namespace="test_strategy"
        )
        try:
            await cache.connect()
            yield cache
        finally:
            await cache.clear()
            await cache.disconnect()

    @pytest.mark.asyncio
    async def test_cache_aside(self, cache_manager):
        """Test cache-aside strategy"""
        strategy = CacheAsideStrategy(cache_manager)

        db_calls = []

        def fetch_from_db():
            db_calls.append(1)
            return {"data": "from_db"}

        # First read - should call DB
        value1 = await strategy.read("test_key", fetch_from_db, ttl=60)
        assert value1 == {"data": "from_db"}
        assert len(db_calls) == 1

        # Second read - should use cache
        value2 = await strategy.read("test_key", fetch_from_db, ttl=60)
        assert value2 == {"data": "from_db"}
        assert len(db_calls) == 1  # No additional DB call

    @pytest.mark.asyncio
    async def test_write_through(self, cache_manager):
        """Test write-through strategy"""
        strategy = WriteThroughStrategy(cache_manager)

        db_writes = []

        def persist_to_db(value):
            db_writes.append(value)

        # Write
        await strategy.write(
            "test_key",
            {"data": "test"},
            persist_fn=persist_to_db,
            ttl=60
        )

        # Verify written to DB
        assert len(db_writes) == 1

        # Verify in cache
        value = await cache_manager.get("test_key")
        assert value == {"data": "test"}

    @pytest.mark.asyncio
    async def test_refresh_ahead(self, cache_manager):
        """Test refresh-ahead strategy"""
        strategy = RefreshAheadStrategy(
            cache_manager,
            refresh_threshold=0.5  # Refresh at 50% TTL
        )

        fetch_calls = []

        def fetch_data():
            fetch_calls.append(1)
            return {"timestamp": time.time()}

        # Initial read
        value1 = await strategy.read("test_key", fetch_data, ttl=2)
        assert len(fetch_calls) == 1

        # Wait for refresh threshold
        await asyncio.sleep(1.5)

        # Read again - should trigger background refresh
        value2 = await strategy.read("test_key", fetch_data, ttl=2)

        # Wait for background refresh
        await asyncio.sleep(0.5)

        # Should have refreshed in background
        assert len(fetch_calls) >= 2


class TestCacheInvalidation:
    """Test cache invalidation"""

    @pytest.fixture
    async def setup(self):
        """Setup cache and invalidator"""
        cache = CacheManager(
            redis_url="redis://localhost:6379/15",
            namespace="test_invalidation"
        )
        await cache.connect()

        invalidator = CacheInvalidator(cache)

        yield cache, invalidator

        await cache.clear()
        await cache.disconnect()

    @pytest.mark.asyncio
    async def test_event_invalidation(self, setup):
        """Test event-driven invalidation"""
        cache, invalidator = setup

        # Set up cache data
        await cache.set("exploits:list", [1, 2, 3])
        await cache.set("stats:24h", {"total": 100})

        # Trigger invalidation event
        count = await invalidator.invalidate_by_event(
            InvalidationEvent.EXPLOIT_CREATED
        )

        # Verify invalidation
        assert count > 0
        assert await cache.get("exploits:list") is None
        assert await cache.get("stats:24h") is None

    @pytest.mark.asyncio
    async def test_pattern_invalidation(self, setup):
        """Test pattern-based invalidation"""
        cache, invalidator = setup

        # Set up cache data
        await cache.set("user:1:profile", {"id": 1})
        await cache.set("user:2:profile", {"id": 2})

        # Invalidate pattern
        count = await invalidator.invalidate_by_pattern("user:*")

        # Verify invalidation
        assert count >= 2
        assert await cache.get("user:1:profile") is None

    @pytest.mark.asyncio
    async def test_scheduled_invalidation(self, setup):
        """Test scheduled invalidation"""
        cache, invalidator = setup

        # Set cache value
        await cache.set("temp:data", "value")

        # Schedule invalidation
        await invalidator.schedule_invalidation(
            "temp:*",
            delay=1,
            task_id="test_cleanup"
        )

        # Should still exist
        assert await cache.get("temp:data") is not None

        # Wait for scheduled invalidation
        await asyncio.sleep(1.5)

        # Should be invalidated
        assert await cache.get("temp:data") is None


class TestCacheWarming:
    """Test cache warming"""

    @pytest.fixture
    async def setup(self):
        """Setup cache and warmer"""
        cache = CacheManager(
            redis_url="redis://localhost:6379/15",
            namespace="test_warming"
        )
        await cache.connect()

        warmer = CacheWarmer(cache)

        yield cache, warmer

        warmer.stop_scheduled_warming()
        await cache.clear()
        await cache.disconnect()

    @pytest.mark.asyncio
    async def test_basic_warming(self, setup):
        """Test basic cache warming"""
        cache, warmer = setup

        fetch_calls = []

        def fetch_data():
            fetch_calls.append(1)
            return {"data": "warmed"}

        # Register warming task
        warmer.register_task(WarmingTask(
            key="warm:test",
            fetch_fn=fetch_data,
            ttl=60,
            priority=5
        ))

        # Warm cache
        await warmer.warm_on_startup(max_concurrent=1)

        # Verify warmed
        assert len(fetch_calls) == 1
        value = await cache.get("warm:test")
        assert value == {"data": "warmed"}

    @pytest.mark.asyncio
    async def test_warming_dependencies(self, setup):
        """Test warming with dependencies"""
        cache, warmer = setup

        exec_order = []

        def fetch_base():
            exec_order.append("base")
            return {"base": True}

        def fetch_dependent():
            exec_order.append("dependent")
            return {"dependent": True}

        # Register tasks with dependency
        warmer.register_task(WarmingTask(
            key="base:data",
            fetch_fn=fetch_base,
            ttl=60
        ))

        warmer.register_task(WarmingTask(
            key="dependent:data",
            fetch_fn=fetch_dependent,
            ttl=60,
            dependencies=["base:data"]
        ))

        # Warm dependent (should warm base first)
        await warmer.warm_key("dependent:data")

        # Verify order
        assert exec_order == ["base", "dependent"]


class TestCacheDecorators:
    """Test cache decorators"""

    @pytest.mark.asyncio
    async def test_cached_decorator(self):
        """Test @cached decorator"""
        call_count = []

        @cached(ttl=60, key_prefix="test")
        async def expensive_function(arg1: str):
            call_count.append(1)
            return f"result_{arg1}"

        # First call
        result1 = await expensive_function("test")
        assert result1 == "result_test"
        assert len(call_count) == 1

        # Second call - should use cache
        result2 = await expensive_function("test")
        assert result2 == "result_test"
        assert len(call_count) == 1  # No additional call

        # Different argument
        result3 = await expensive_function("other")
        assert result3 == "result_other"
        assert len(call_count) == 2

    @pytest.mark.asyncio
    async def test_cache_invalidate_decorator(self):
        """Test @cache_invalidate decorator"""
        cache = CacheManager(
            redis_url="redis://localhost:6379/15",
            namespace="test_decorator"
        )
        await cache.connect()

        # Set cache value
        await cache.set("test:value", "old_value")

        @cache_invalidate(pattern="test:*")
        async def update_data():
            return "updated"

        # Call function
        result = await update_data()

        # Verify cache invalidated
        value = await cache.get("test:value")
        assert value is None

        await cache.disconnect()


@pytest.mark.asyncio
async def test_performance_benchmark():
    """Benchmark cache performance"""
    cache = CacheManager(
        redis_url="redis://localhost:6379/15",
        namespace="bench"
    )
    await cache.connect()

    # Benchmark sets
    start = time.time()
    for i in range(1000):
        await cache.set(f"bench:{i}", f"value_{i}", ttl=60)
    set_time = time.time() - start

    print(f"\n1000 cache sets: {set_time:.3f}s ({1000/set_time:.0f} ops/sec)")

    # Benchmark gets
    start = time.time()
    for i in range(1000):
        await cache.get(f"bench:{i}")
    get_time = time.time() - start

    print(f"1000 cache gets: {get_time:.3f}s ({1000/get_time:.0f} ops/sec)")

    # Verify performance
    assert set_time < 5.0, "Cache sets too slow"
    assert get_time < 2.0, "Cache gets too slow"

    await cache.clear()
    await cache.disconnect()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
