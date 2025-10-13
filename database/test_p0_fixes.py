#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P0 Database Fixes Validation Test
Tests all three critical fixes:
1. Schema auto-initialization
2. Connection timeout protection
3. Connection monitoring
"""

import os
import sys
import time
import logging
import tempfile
import concurrent.futures
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_schema_initialization():
    """
    Test P0-1: Schema Auto-Initialization
    Verify that schema is created automatically on fresh database
    """
    print("\n" + "="*70)
    print("TEST 1: Schema Auto-Initialization")
    print("="*70)

    try:
        from postgres_manager import PostgresManager

        # Create test database URL
        test_db_url = os.getenv('TEST_DATABASE_URL')

        if not test_db_url:
            print("⚠️  SKIPPED: Set TEST_DATABASE_URL to run this test")
            print("   Example: export TEST_DATABASE_URL='postgresql://user:pass@localhost/test_db'")
            return False

        print(f"\n1. Testing fresh database initialization...")
        print(f"   Database: {test_db_url.split('@')[1] if '@' in test_db_url else 'hidden'}")

        # Initialize PostgresManager (should auto-create schema)
        db = PostgresManager(database_url=test_db_url, min_connections=2, max_connections=5)

        print("   ✅ PostgresManager initialized")

        # Verify tables exist
        print("\n2. Verifying schema tables...")

        with db.get_cursor(readonly=True) as cursor:
            cursor.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                ORDER BY table_name
            """)
            tables = [row['table_name'] for row in cursor.fetchall()]

        expected_tables = [
            'exploits', 'sources', 'users', 'alerts_sent',
            'alert_preferences', 'community_submissions',
            'user_reputation', 'payments', 'subscription_changes'
        ]

        missing_tables = [t for t in expected_tables if t not in tables]

        if missing_tables:
            print(f"   ❌ FAILED: Missing tables: {missing_tables}")
            return False

        print(f"   ✅ All {len(expected_tables)} required tables exist")

        # Test idempotency - initialize again
        print("\n3. Testing idempotency (re-initialize)...")
        db2 = PostgresManager(database_url=test_db_url)
        print("   ✅ Re-initialization succeeded (idempotent)")

        db.close()
        db2.close()

        print("\n✅ TEST 1 PASSED: Schema auto-initialization working")
        return True

    except Exception as e:
        print(f"\n❌ TEST 1 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_connection_timeout():
    """
    Test P0-2: Connection Pool Timeout Protection
    Verify that connection acquisition times out properly
    """
    print("\n" + "="*70)
    print("TEST 2: Connection Pool Timeout Protection")
    print("="*70)

    try:
        from postgres_manager import PostgresManager

        test_db_url = os.getenv('TEST_DATABASE_URL')

        if not test_db_url:
            print("⚠️  SKIPPED: Set TEST_DATABASE_URL to run this test")
            return False

        print("\n1. Creating small connection pool (min=1, max=2)...")
        db = PostgresManager(database_url=test_db_url, min_connections=1, max_connections=2)
        print("   ✅ Pool created")

        # Hold connections to exhaust pool
        print("\n2. Exhausting connection pool...")
        held_connections = []

        with db.get_connection() as conn1:
            print("   - Acquired connection 1")
            held_connections.append(conn1)

            with db.get_connection() as conn2:
                print("   - Acquired connection 2 (pool exhausted)")
                held_connections.append(conn2)

                # Try to get third connection with short timeout
                print("\n3. Testing timeout on exhausted pool...")
                start = time.time()

                try:
                    with db.get_connection(timeout=3) as conn3:
                        print("   ❌ FAILED: Should have timed out")
                        return False
                except TimeoutError as e:
                    elapsed = time.time() - start
                    print(f"   ✅ Correctly raised TimeoutError after {elapsed:.2f}s")
                    print(f"   Message: {str(e)[:100]}")

        print("\n4. Testing normal acquisition after release...")
        start = time.time()
        with db.get_connection(timeout=5) as conn:
            elapsed = time.time() - start
            print(f"   ✅ Successfully acquired connection in {elapsed:.3f}s")

        db.close()

        print("\n✅ TEST 2 PASSED: Connection timeout protection working")
        return True

    except Exception as e:
        print(f"\n❌ TEST 2 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_connection_monitoring():
    """
    Test P0-3: Connection Monitoring
    Verify monitoring tracks acquisitions, queries, and pool health
    """
    print("\n" + "="*70)
    print("TEST 3: Connection Pool Monitoring")
    print("="*70)

    try:
        from postgres_manager import PostgresManager
        from connection_monitor import get_monitor, reset_monitor

        test_db_url = os.getenv('TEST_DATABASE_URL')

        if not test_db_url:
            print("⚠️  SKIPPED: Set TEST_DATABASE_URL to run this test")
            return False

        # Reset monitor for clean test
        reset_monitor()

        print("\n1. Initializing with monitoring enabled...")
        db = PostgresManager(database_url=test_db_url)

        if not db.monitor:
            print("   ❌ FAILED: Monitoring not enabled")
            return False

        print("   ✅ Monitoring enabled")

        # Execute some queries
        print("\n2. Executing test queries...")

        # Fast query
        db.execute_with_retry("SELECT 1 as test", readonly=True)
        print("   - Executed fast query")

        # Query with results
        db.execute_with_retry("SELECT version()", readonly=True)
        print("   - Executed version query")

        # Simulate slow query (if possible)
        try:
            db.execute_with_retry("SELECT pg_sleep(0.1)", readonly=True)
            print("   - Executed sleep query")
        except:
            pass

        # Get metrics
        print("\n3. Collecting metrics...")

        health = db.monitor.get_health_status()
        print(f"   Pool Status: {health['status']}")
        print(f"   Total Acquisitions: {health['total_acquisitions']}")
        print(f"   Acquisition Failures: {health['acquisition_failures']}")
        print(f"   Slow Queries: {health['slow_queries']}")
        print(f"   Avg Acquisition Time: {health['avg_acquisition_ms']:.2f}ms")

        if health['total_acquisitions'] < 3:
            print(f"   ❌ FAILED: Expected at least 3 acquisitions, got {health['total_acquisitions']}")
            return False

        print("   ✅ Metrics collected successfully")

        # Test pool metrics method
        print("\n4. Testing get_pool_metrics()...")
        pool_metrics = db.get_pool_metrics()

        if not pool_metrics.get('monitoring_enabled'):
            print("   ❌ FAILED: Monitoring not reported as enabled")
            return False

        print(f"   Pool Config: {pool_metrics['pool_config']}")
        print("   ✅ Pool metrics accessible")

        # Test slow query tracking
        print("\n5. Testing get_query_performance()...")
        slow_queries = db.get_query_performance(limit=5)
        print(f"   Tracked {len(slow_queries)} queries")

        if slow_queries:
            print(f"   Sample: {slow_queries[0]['query_template'][:60]}")

        print("   ✅ Query performance tracking working")

        db.close()

        print("\n✅ TEST 3 PASSED: Connection monitoring working")
        return True

    except Exception as e:
        print(f"\n❌ TEST 3 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_stress_test():
    """
    Stress test: Concurrent connections with monitoring
    """
    print("\n" + "="*70)
    print("STRESS TEST: Concurrent Connection Handling")
    print("="*70)

    try:
        from postgres_manager import PostgresManager

        test_db_url = os.getenv('TEST_DATABASE_URL')

        if not test_db_url:
            print("⚠️  SKIPPED: Set TEST_DATABASE_URL to run this test")
            return False

        print("\n1. Creating connection pool...")
        db = PostgresManager(database_url=test_db_url, min_connections=5, max_connections=10)

        def worker(worker_id):
            """Simulate concurrent database access"""
            try:
                # Execute multiple queries
                for i in range(5):
                    result = db.execute_with_retry(
                        "SELECT %s as worker_id, %s as iteration",
                        (worker_id, i),
                        readonly=True
                    )
                return True
            except Exception as e:
                logger.error(f"Worker {worker_id} failed: {e}")
                return False

        print("\n2. Running 20 concurrent workers (100 queries total)...")
        start = time.time()

        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(worker, i) for i in range(20)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        elapsed = time.time() - start

        success_count = sum(1 for r in results if r)
        print(f"   Completed in {elapsed:.2f}s")
        print(f"   Success: {success_count}/20 workers")

        # Check metrics
        if db.monitor:
            health = db.monitor.get_health_status()
            print(f"   Total Acquisitions: {health['total_acquisitions']}")
            print(f"   Failures: {health['acquisition_failures']}")
            print(f"   Avg Time: {health['avg_acquisition_ms']:.2f}ms")

        db.close()

        if success_count == 20:
            print("\n✅ STRESS TEST PASSED: All workers succeeded")
            return True
        else:
            print(f"\n⚠️  STRESS TEST PARTIAL: {success_count}/20 succeeded")
            return False

    except Exception as e:
        print(f"\n❌ STRESS TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all P0 fix validation tests"""
    print("\n" + "="*70)
    print("P0 DATABASE FIXES VALIDATION TEST SUITE")
    print("="*70)

    # Check for test database URL
    test_db_url = os.getenv('TEST_DATABASE_URL')

    if not test_db_url:
        print("\n⚠️  WARNING: TEST_DATABASE_URL not set")
        print("\nTo run full tests, set TEST_DATABASE_URL:")
        print("  export TEST_DATABASE_URL='postgresql://user:pass@localhost/kamiyo_test'")
        print("\nRunning basic validation only...\n")

    # Run tests
    results = []

    results.append(("Schema Auto-Initialization", test_schema_initialization()))
    results.append(("Connection Timeout", test_connection_timeout()))
    results.append(("Connection Monitoring", test_connection_monitoring()))
    results.append(("Stress Test", test_stress_test()))

    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status:12} - {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n✅ ALL P0 FIXES VALIDATED SUCCESSFULLY")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == '__main__':
    sys.exit(main())
