# -*- coding: utf-8 -*-
"""
Unit tests for P0-1: Redis-backed token revocation

Run with: pytest api/auth/tests/test_token_revocation.py -v
"""

import pytest
import time
from datetime import datetime
from api.auth.token_revocation import RedisTokenRevocationStore, get_revocation_store


class TestRedisTokenRevocation:
    """Test suite for Redis-backed token revocation"""

    def test_revoke_and_check(self):
        """Test basic revoke and check operations"""
        store = RedisTokenRevocationStore()
        jti = f"test-jti-{int(time.time())}"

        # Token should not be revoked initially
        assert store.is_revoked(jti) == False

        # Revoke token
        success = store.revoke(jti, expires_in=300, user_id="user123", reason="test")
        assert success == True

        # Token should now be revoked
        assert store.is_revoked(jti) == True

    def test_revocation_distributed(self):
        """Verify revocation works across multiple instances"""
        store1 = RedisTokenRevocationStore()
        store2 = RedisTokenRevocationStore()

        jti = f"test-jti-distributed-{int(time.time())}"

        # Revoke on instance 1
        assert store1.revoke(jti, expires_in=300, user_id="user1") == True

        # Check on instance 2 (should see revocation)
        assert store2.is_revoked(jti) == True

        print("✓ P0-1: Distributed revocation works across instances")

    def test_revocation_ttl_cleanup(self):
        """Verify tokens auto-expire after TTL"""
        store = RedisTokenRevocationStore()
        jti = f"test-jti-ttl-{int(time.time())}"

        # Revoke with short TTL
        store.revoke(jti, expires_in=2, user_id="user1")

        # Should be revoked immediately
        assert store.is_revoked(jti) == True

        # Wait for TTL to expire
        time.sleep(3)

        # Should no longer be revoked (auto-cleaned)
        assert store.is_revoked(jti) == False

        print("✓ P0-1: TTL-based auto-cleanup works")

    def test_fallback_to_memory(self):
        """Verify graceful degradation when Redis unavailable"""
        # Initialize with invalid Redis URL
        store = RedisTokenRevocationStore(redis_url="redis://invalid:9999")

        # Should fall back to memory
        jti = f"test-jti-memory-{int(time.time())}"
        assert store.revoke(jti, expires_in=300, user_id="user1") == True
        assert store.is_revoked(jti) == True

        # Get stats should show memory backend
        stats = store.get_stats()
        assert stats["backend"] == "memory"

        print("✓ P0-1: Graceful degradation to memory works")

    def test_health_check(self):
        """Test health check functionality"""
        store = RedisTokenRevocationStore()
        health = store.health_check()

        assert "status" in health
        assert "backend" in health
        assert health["status"] in ["healthy", "degraded"]

        print(f"✓ P0-1: Health check shows {health['status']}")

    def test_get_stats(self):
        """Test statistics retrieval"""
        store = RedisTokenRevocationStore()
        stats = store.get_stats()

        assert "backend" in stats
        assert stats["backend"] in ["redis", "memory"]

        if stats["backend"] == "redis":
            assert "redis_revoked_count" in stats

        print(f"✓ P0-1: Stats retrieval works (backend: {stats['backend']})")

    def test_singleton_pattern(self):
        """Verify singleton pattern for revocation store"""
        store1 = get_revocation_store()
        store2 = get_revocation_store()

        # Should be same instance
        assert store1 is store2

        print("✓ P0-1: Singleton pattern works")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("P0-1: Redis-Backed Token Revocation Tests")
    print("="*60 + "\n")

    # Run tests
    pytest.main([__file__, "-v", "-s"])
