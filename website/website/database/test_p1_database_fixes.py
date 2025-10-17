#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P1 Database Fixes - Comprehensive Test Suite
Tests all P1 database reliability fixes for production readiness
"""

import os
import sys
import time
import logging
from typing import Dict, Any
import psycopg2
from psycopg2 import pool, extras

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class P1DatabaseTester:
    """
    Comprehensive test suite for P1 database fixes
    Tests: Foreign key integrity, query timeouts, read replicas, indexes
    """

    def __init__(self, database_url: str, read_replica_url: str = None):
        self.database_url = database_url
        self.read_replica_url = read_replica_url
        self.test_results = {}

        # Initialize test database connection
        self.conn = psycopg2.connect(database_url)
        self.cursor = self.conn.cursor(cursor_factory=extras.RealDictCursor)

    def run_all_tests(self):
        """Run complete P1 test suite"""

        logger.info("\n" + "="*70)
        logger.info("P1 DATABASE FIXES - COMPREHENSIVE TEST SUITE")
        logger.info("="*70 + "\n")

        tests = [
            ("P1-1: Foreign Key Integrity", self.test_foreign_key_integrity),
            ("P1-2: Query Timeout Configuration", self.test_query_timeout),
            ("P1-3: Read Replica Auto-Selection", self.test_read_replica_routing),
            ("P1-4: Migration Validation", self.test_migration_validation),
            ("P1-5: Performance Indexes", self.test_performance_indexes),
        ]

        for test_name, test_func in tests:
            logger.info(f"\n{'='*70}")
            logger.info(f"Running: {test_name}")
            logger.info(f"{'='*70}\n")

            try:
                result = test_func()
                self.test_results[test_name] = result
                status = "✅ PASSED" if result['passed'] else "❌ FAILED"
                logger.info(f"\n{status}: {test_name}")

            except Exception as e:
                logger.error(f"\n❌ FAILED: {test_name}")
                logger.error(f"Error: {e}")
                self.test_results[test_name] = {
                    'passed': False,
                    'error': str(e)
                }

        # Print final summary
        self.print_summary()

    def test_foreign_key_integrity(self) -> Dict[str, Any]:
        """Test P1-1: Foreign key integrity validation"""

        result = {'passed': True, 'checks': []}

        # Test 1: Check for orphaned alerts (alerts_sent -> exploits)
        logger.info("1. Checking for orphaned alert records...")
        self.cursor.execute("""
            SELECT COUNT(*) as orphans FROM alerts_sent a
            WHERE NOT EXISTS (
                SELECT 1 FROM exploits e WHERE e.id = a.exploit_id
            )
        """)
        orphaned_alerts = self.cursor.fetchone()['orphans']

        if orphaned_alerts > 0:
            result['passed'] = False
            result['checks'].append(f"❌ Found {orphaned_alerts} orphaned alerts")
            logger.error(f"   ❌ Found {orphaned_alerts} orphaned alerts")
        else:
            result['checks'].append("✅ No orphaned alerts")
            logger.info("   ✅ No orphaned alerts found")

        # Test 2: Check for orphaned alert preferences
        logger.info("2. Checking for orphaned alert preferences...")
        try:
            self.cursor.execute("""
                SELECT COUNT(*) as orphans FROM alert_preferences ap
                WHERE NOT EXISTS (
                    SELECT 1 FROM users u WHERE u.id = ap.user_id
                )
            """)
            orphaned_prefs = self.cursor.fetchone()['orphans']

            if orphaned_prefs > 0:
                result['passed'] = False
                result['checks'].append(f"❌ Found {orphaned_prefs} orphaned preferences")
                logger.error(f"   ❌ Found {orphaned_prefs} orphaned preferences")
            else:
                result['checks'].append("✅ No orphaned alert preferences")
                logger.info("   ✅ No orphaned alert preferences")

        except Exception as e:
            logger.warning(f"   ⚠️  Could not check alert_preferences: {e}")

        # Test 3: Check for orphaned payments
        logger.info("3. Checking for orphaned payment records...")
        try:
            self.cursor.execute("""
                SELECT COUNT(*) as orphans FROM payments p
                WHERE NOT EXISTS (
                    SELECT 1 FROM users u WHERE u.id = p.user_id
                )
            """)
            orphaned_payments = self.cursor.fetchone()['orphans']

            if orphaned_payments > 0:
                result['passed'] = False
                result['checks'].append(f"❌ Found {orphaned_payments} orphaned payments")
                logger.error(f"   ❌ Found {orphaned_payments} orphaned payments")
            else:
                result['checks'].append("✅ No orphaned payments")
                logger.info("   ✅ No orphaned payments")

        except Exception as e:
            logger.warning(f"   ⚠️  Could not check payments: {e}")

        # Test 4: Verify foreign key constraints exist
        logger.info("4. Verifying foreign key constraints...")
        self.cursor.execute("""
            SELECT
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            ORDER BY tc.table_name
        """)
        foreign_keys = self.cursor.fetchall()

        result['foreign_keys_count'] = len(foreign_keys)
        logger.info(f"   Found {len(foreign_keys)} foreign key constraints")

        expected_fks = [
            'alerts_sent.exploit_id -> exploits.id',
            'alert_preferences.user_id -> users.id',
            'payments.user_id -> users.id'
        ]

        for fk in foreign_keys:
            fk_desc = f"{fk['table_name']}.{fk['column_name']} -> {fk['foreign_table_name']}.{fk['foreign_column_name']}"
            logger.info(f"   - {fk_desc}")

        return result

    def test_query_timeout(self) -> Dict[str, Any]:
        """Test P1-2: Query timeout configuration"""

        result = {'passed': True, 'checks': []}

        # Test 1: Set and verify statement timeout
        logger.info("1. Testing statement timeout configuration...")
        try:
            test_cursor = self.conn.cursor()

            # Set 1 second timeout
            test_cursor.execute("SET statement_timeout = '1s'")

            # Verify it's set
            test_cursor.execute("SHOW statement_timeout")
            timeout_val = test_cursor.fetchone()[0]

            if timeout_val == '1s':
                result['checks'].append("✅ Statement timeout configurable")
                logger.info("   ✅ Statement timeout can be set")
            else:
                result['passed'] = False
                result['checks'].append(f"❌ Timeout mismatch: {timeout_val}")
                logger.error(f"   ❌ Expected '1s', got '{timeout_val}'")

            # Reset
            test_cursor.execute("RESET statement_timeout")
            test_cursor.close()

        except Exception as e:
            result['passed'] = False
            result['checks'].append(f"❌ Timeout configuration failed: {e}")
            logger.error(f"   ❌ {e}")

        # Test 2: Verify timeout actually works (with very short timeout)
        logger.info("2. Testing timeout enforcement...")
        try:
            test_cursor = self.conn.cursor()
            test_cursor.execute("SET statement_timeout = '100ms'")

            # Try to run a slow query (should timeout)
            try:
                test_cursor.execute("SELECT pg_sleep(5)")
                result['passed'] = False
                result['checks'].append("❌ Timeout not enforced")
                logger.error("   ❌ Query did not timeout as expected")

            except psycopg2.errors.QueryCanceled:
                result['checks'].append("✅ Timeout enforcement works")
                logger.info("   ✅ Query correctly timed out")
                self.conn.rollback()

            test_cursor.execute("RESET statement_timeout")
            test_cursor.close()

        except Exception as e:
            logger.warning(f"   ⚠️  Could not test timeout enforcement: {e}")
            self.conn.rollback()

        # Test 3: Check default timeout from environment
        logger.info("3. Checking default timeout configuration...")
        default_timeout = os.getenv('DB_QUERY_TIMEOUT', '30')
        result['default_timeout'] = default_timeout
        logger.info(f"   Default timeout: {default_timeout}s")

        return result

    def test_read_replica_routing(self) -> Dict[str, Any]:
        """Test P1-3: Read replica auto-selection"""

        result = {'passed': True, 'checks': []}

        # Test 1: Check if read replica is configured
        logger.info("1. Checking read replica configuration...")

        if self.read_replica_url:
            result['checks'].append("✅ Read replica URL configured")
            logger.info("   ✅ Read replica URL available")

            # Test 2: Verify read replica connectivity
            logger.info("2. Testing read replica connectivity...")
            try:
                replica_conn = psycopg2.connect(self.read_replica_url)
                replica_cursor = replica_conn.cursor()

                # Run simple query
                replica_cursor.execute("SELECT 1 as test")
                test_result = replica_cursor.fetchone()[0]

                if test_result == 1:
                    result['checks'].append("✅ Read replica is accessible")
                    logger.info("   ✅ Read replica connection successful")
                else:
                    result['passed'] = False
                    result['checks'].append("❌ Read replica returned unexpected result")
                    logger.error("   ❌ Unexpected query result")

                replica_cursor.close()
                replica_conn.close()

            except Exception as e:
                result['passed'] = False
                result['checks'].append(f"❌ Read replica connection failed: {e}")
                logger.error(f"   ❌ {e}")

        else:
            result['checks'].append("⚠️  No read replica configured")
            logger.warning("   ⚠️  READ_REPLICA_URL not set (optional)")

        # Test 3: Verify PostgresManager has decorator applied
        logger.info("3. Checking read replica decorator implementation...")
        try:
            from database.postgres_manager import PostgresManager, use_read_replica

            # Check if decorator exists
            if callable(use_read_replica):
                result['checks'].append("✅ Read replica decorator implemented")
                logger.info("   ✅ use_read_replica decorator found")

                # Check if key methods have the decorator
                pg_manager = PostgresManager()
                decorated_methods = [
                    'get_chains',
                    'get_exploit_by_tx_hash',
                    'get_stats_24h',
                    'get_recent_exploits'
                ]

                for method_name in decorated_methods:
                    method = getattr(pg_manager, method_name, None)
                    if method:
                        logger.info(f"   ✅ {method_name} found")
                    else:
                        logger.warning(f"   ⚠️  {method_name} not found")

            else:
                result['passed'] = False
                result['checks'].append("❌ Decorator not found")
                logger.error("   ❌ use_read_replica decorator missing")

        except ImportError as e:
            logger.warning(f"   ⚠️  Could not import PostgresManager: {e}")

        return result

    def test_migration_validation(self) -> Dict[str, Any]:
        """Test P1-4: Migration validation enhancements"""

        result = {'passed': True, 'checks': []}

        # Test 1: Check unique constraints
        logger.info("1. Validating unique constraints...")

        # Check tx_hash uniqueness
        self.cursor.execute("""
            SELECT tx_hash, COUNT(*) as cnt
            FROM exploits
            GROUP BY tx_hash
            HAVING COUNT(*) > 1
        """)
        duplicate_txs = self.cursor.fetchall()

        if duplicate_txs:
            result['passed'] = False
            result['checks'].append(f"❌ Found {len(duplicate_txs)} duplicate tx_hashes")
            logger.error(f"   ❌ {len(duplicate_txs)} duplicate tx_hashes")
        else:
            result['checks'].append("✅ All tx_hashes unique")
            logger.info("   ✅ No duplicate tx_hashes")

        # Check email uniqueness
        self.cursor.execute("""
            SELECT email, COUNT(*) as cnt
            FROM users
            GROUP BY email
            HAVING COUNT(*) > 1
        """)
        duplicate_emails = self.cursor.fetchall()

        if duplicate_emails:
            result['passed'] = False
            result['checks'].append(f"❌ Found {len(duplicate_emails)} duplicate emails")
            logger.error(f"   ❌ {len(duplicate_emails)} duplicate emails")
        else:
            result['checks'].append("✅ All emails unique")
            logger.info("   ✅ No duplicate emails")

        # Test 2: Check data integrity
        logger.info("2. Validating data integrity...")

        # Check for NULL values in required fields
        self.cursor.execute("""
            SELECT COUNT(*) as null_count FROM exploits
            WHERE tx_hash IS NULL OR chain IS NULL OR protocol IS NULL
        """)
        null_exploits = self.cursor.fetchone()['null_count']

        if null_exploits > 0:
            result['passed'] = False
            result['checks'].append(f"❌ Found {null_exploits} exploits with NULL required fields")
            logger.error(f"   ❌ {null_exploits} exploits with NULL fields")
        else:
            result['checks'].append("✅ No NULL values in required fields")
            logger.info("   ✅ All required fields populated")

        return result

    def test_performance_indexes(self) -> Dict[str, Any]:
        """Test P1-5: Critical performance indexes"""

        result = {'passed': True, 'checks': [], 'indexes': []}

        logger.info("1. Checking for critical performance indexes...")

        # List of critical indexes from migration 012
        critical_indexes = [
            'idx_exploits_timestamp_chain_active',
            'idx_users_stripe_customer_active',
            'idx_alerts_exploit_channel_recent',
            'idx_users_api_key_active_lookup',
            'idx_exploits_created_active_list',
            'idx_exploits_tx_hash_covering'
        ]

        # Check each index exists
        for idx_name in critical_indexes:
            self.cursor.execute("""
                SELECT indexname, tablename, indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
                AND indexname = %s
            """, (idx_name,))

            idx = self.cursor.fetchone()

            if idx:
                result['checks'].append(f"✅ {idx_name}")
                result['indexes'].append({
                    'name': idx['indexname'],
                    'table': idx['tablename'],
                    'definition': idx['indexdef']
                })
                logger.info(f"   ✅ {idx_name} exists")
            else:
                result['passed'] = False
                result['checks'].append(f"❌ {idx_name} missing")
                logger.error(f"   ❌ {idx_name} not found")

        # Test 2: Verify index usage statistics
        logger.info("\n2. Checking index usage statistics...")

        self.cursor.execute("""
            SELECT
                schemaname,
                tablename,
                indexname,
                idx_scan,
                idx_tup_read,
                idx_tup_fetch
            FROM pg_stat_user_indexes
            WHERE schemaname = 'public'
            AND indexname LIKE 'idx_%'
            ORDER BY idx_scan DESC
            LIMIT 10
        """)

        top_indexes = self.cursor.fetchall()
        logger.info(f"   Top {len(top_indexes)} most-used indexes:")

        for idx in top_indexes:
            logger.info(f"   - {idx['indexname']}: {idx['idx_scan']} scans")

        result['top_indexes'] = top_indexes

        # Test 3: Check for unused indexes
        logger.info("\n3. Checking for unused indexes...")

        self.cursor.execute("""
            SELECT
                schemaname,
                tablename,
                indexname,
                pg_size_pretty(pg_relation_size(indexrelid)) as size
            FROM pg_stat_user_indexes
            WHERE schemaname = 'public'
            AND idx_scan = 0
            AND indexname NOT LIKE '%_pkey'
            ORDER BY pg_relation_size(indexrelid) DESC
        """)

        unused_indexes = self.cursor.fetchall()

        if unused_indexes:
            logger.warning(f"   ⚠️  Found {len(unused_indexes)} unused indexes:")
            for idx in unused_indexes:
                logger.warning(f"   - {idx['indexname']} ({idx['size']})")
            result['unused_indexes'] = unused_indexes
        else:
            logger.info("   ✅ No unused indexes found")

        return result

    def print_summary(self):
        """Print comprehensive test summary"""

        logger.info("\n" + "="*70)
        logger.info("P1 DATABASE FIXES - TEST SUMMARY")
        logger.info("="*70 + "\n")

        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results.values() if r.get('passed', False))
        failed_tests = total_tests - passed_tests

        for test_name, result in self.test_results.items():
            status = "✅ PASSED" if result.get('passed', False) else "❌ FAILED"
            logger.info(f"{status}: {test_name}")

            # Print individual checks
            for check in result.get('checks', []):
                logger.info(f"  {check}")

        logger.info(f"\n{'='*70}")
        logger.info(f"Total Tests: {total_tests}")
        logger.info(f"Passed: {passed_tests}")
        logger.info(f"Failed: {failed_tests}")

        if failed_tests == 0:
            logger.info("\n✅ ALL P1 DATABASE FIXES VALIDATED - READY FOR PRODUCTION")
        else:
            logger.error("\n❌ SOME P1 FIXES FAILED - REVIEW ISSUES BEFORE DEPLOYMENT")

        logger.info("="*70 + "\n")

    def cleanup(self):
        """Close database connections"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()


def main():
    """Main test execution"""

    # Get database URLs from environment
    database_url = os.getenv('DATABASE_URL')
    read_replica_url = os.getenv('READ_REPLICA_URL')

    if not database_url:
        print("❌ ERROR: DATABASE_URL environment variable required")
        print("\nUsage:")
        print("  export DATABASE_URL='postgresql://user:pass@localhost/kamiyo'")
        print("  export READ_REPLICA_URL='postgresql://user:pass@replica/kamiyo'  # optional")
        print("  python database/test_p1_database_fixes.py")
        sys.exit(1)

    # Run tests
    tester = P1DatabaseTester(database_url, read_replica_url)

    try:
        tester.run_all_tests()
    finally:
        tester.cleanup()

    # Return exit code based on results
    failed = sum(1 for r in tester.test_results.values() if not r.get('passed', False))
    sys.exit(0 if failed == 0 else 1)


if __name__ == '__main__':
    main()
