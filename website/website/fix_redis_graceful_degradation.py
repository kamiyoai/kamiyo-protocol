#!/usr/bin/env python3
"""
Apply Redis graceful degradation fix to cache_manager.py
Makes cache work without Redis by falling back to L1-only mode
"""

import os
import re

def apply_fixes(filepath):
    """Apply all Redis graceful degradation fixes to a cache_manager.py file"""

    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content

    # Fix 1: Update get_cache_manager() to read REDIS_URL from environment
    content = re.sub(
        r'def get_cache_manager\(\) -> CacheManager:\s+"""Get global cache manager instance"""\s+global _cache_manager\s+if _cache_manager is None:\s+_cache_manager = CacheManager\(\)\s+return _cache_manager',
        '''def get_cache_manager() -> CacheManager:
    """Get global cache manager instance"""
    global _cache_manager
    if _cache_manager is None:
        import os
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _cache_manager = CacheManager(redis_url=redis_url)
    return _cache_manager''',
        content,
        flags=re.MULTILINE | re.DOTALL
    )

    # Fix 2: Update connect() to not raise on failure
    content = re.sub(
        r'async def connect\(self\):\s+"""Connect to Redis"""',
        'async def connect(self):\n        """Connect to Redis (graceful degradation to L1-only if Redis unavailable)"""',
        content
    )

    content = re.sub(
        r'except Exception as e:\s+logger\.error\(f"Failed to connect to Redis: {e}"\)\s+self\._redis = None\s+raise',
        '''except Exception as e:
            logger.warning(f"Redis unavailable, using L1 cache only: {e}")
            self._redis = None
            # Don't raise - gracefully degrade to L1-only cache''',
        content,
        flags=re.MULTILINE
    )

    # Fix 3: Update get() method to skip Redis gracefully
    content = re.sub(
        r'# Try Redis \(L2\)\s+if self\._redis is None:\s+await self\.connect\(\)\s+data = await self\._redis\.get\(full_key\)',
        '''# Try Redis (L2)
            if self._redis is None:
                await self.connect()

            # Skip Redis if still unavailable after connect attempt
            if self._redis is None:
                duration = time.time() - start_time
                self.stats.miss(duration)
                self._update_key_stats(key, hit=False, duration=duration)
                cache_operations_total.labels(
                    operation='get',
                    result='miss'
                ).inc()
                return default

            data = await self._redis.get(full_key)''',
        content,
        flags=re.MULTILINE
    )

    # Fix 4: Update set() method to skip Redis gracefully
    content = re.sub(
        r'# Set in Redis \(L2\)\s+if self\._redis is None:\s+await self\.connect\(\)\s+data = self\._serialize\(value\)',
        '''# Set in Redis (L2)
            if self._redis is None:
                await self.connect()

            # Skip Redis if still unavailable after connect attempt
            if self._redis is None:
                # L1-only mode, still return success
                return True

            data = self._serialize(value)''',
        content,
        flags=re.MULTILINE
    )

    # Fix 5: Update delete() method to skip Redis gracefully
    content = re.sub(
        r'# Delete from Redis\s+if self\._redis is None:\s+await self\.connect\(\)\s+result = await self\._redis\.delete\(full_key\)',
        '''# Delete from Redis
            if self._redis is None:
                await self.connect()

            # Skip Redis if still unavailable after connect attempt
            if self._redis is None:
                # L1-only mode, return True since L1 was cleared
                return True

            result = await self._redis.delete(full_key)''',
        content,
        flags=re.MULTILINE
    )

    # Fix 6: Update delete_pattern() method
    content = re.sub(
        r'try:\s+if self\._redis is None:\s+await self\.connect\(\)\s+# Scan for matching keys\s+keys = \[\]',
        '''try:
            if self._redis is None:
                await self.connect()

            # Skip Redis if still unavailable after connect attempt
            if self._redis is None:
                # Clear L1 cache anyway (conservative approach)
                if self.l1:
                    self.l1.clear()
                return 0

            # Scan for matching keys
            keys = []''',
        content,
        flags=re.MULTILINE
    )

    # Fix 7: Update exists() method
    content = re.sub(
        r'# Check Redis\s+if self\._redis is None:\s+await self\.connect\(\)\s+return await self\._redis\.exists\(full_key\) > 0',
        '''# Check Redis
            if self._redis is None:
                await self.connect()

            # Skip Redis if still unavailable after connect attempt
            if self._redis is None:
                return False

            return await self._redis.exists(full_key) > 0''',
        content,
        flags=re.MULTILINE
    )

    # Fix 8: Update ttl() method
    content = re.sub(
        r'try:\s+if self\._redis is None:\s+await self\.connect\(\)\s+return await self\._redis\.ttl\(full_key\)',
        '''try:
            if self._redis is None:
                await self.connect()

            # Skip Redis if still unavailable after connect attempt
            if self._redis is None:
                return -2  # Key doesn't exist in Redis

            return await self._redis.ttl(full_key)''',
        content,
        flags=re.MULTILINE
    )

    # Fix 9: Update mget() method
    content = re.sub(
        r'# Fetch remaining from Redis\s+if redis_keys:\s+try:\s+if self\._redis is None:\s+await self\.connect\(\)\s+values = await self\._redis\.mget\(redis_keys\)',
        '''# Fetch remaining from Redis
        if redis_keys:
            try:
                if self._redis is None:
                    await self.connect()

                # Skip Redis if still unavailable after connect attempt
                if self._redis is None:
                    return result

                values = await self._redis.mget(redis_keys)''',
        content,
        flags=re.MULTILINE
    )

    # Fix 10: Update mset() method
    content = re.sub(
        r'# Set in Redis\s+if self\._redis is None:\s+await self\.connect\(\)\s+# Serialize values',
        '''# Set in Redis
            if self._redis is None:
                await self.connect()

            # Skip Redis if still unavailable after connect attempt
            if self._redis is None:
                # L1-only mode, still return success
                return True

            # Serialize values''',
        content,
        flags=re.MULTILINE
    )

    # Fix 11: Update clear() method
    content = re.sub(
        r'# Clear Redis namespace\s+if self\._redis is None:\s+await self\.connect\(\)\s+pattern = f"{self\.namespace}:\*"',
        '''# Clear Redis namespace
            if self._redis is None:
                await self.connect()

            # Skip Redis if still unavailable after connect attempt
            if self._redis is None:
                logger.info(f"Cleared L1 cache only (Redis unavailable)")
                return

            pattern = f"{self.namespace}:*"''',
        content,
        flags=re.MULTILINE
    )

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"✅ Applied Redis graceful degradation fixes to {filepath}")
        return True
    else:
        print(f"⚠️  No changes needed for {filepath} (already fixed or different structure)")
        return False

if __name__ == "__main__":
    # Apply to the correct file
    filepath = "/Users/dennisgoslar/Projekter/kamiyo/website/caching/cache_manager.py"

    if os.path.exists(filepath):
        apply_fixes(filepath)
    else:
        print(f"❌ File not found: {filepath}")
