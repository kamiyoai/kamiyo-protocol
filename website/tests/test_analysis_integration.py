#!/usr/bin/env python3
"""
Integration tests for Analysis API v2 endpoints
Tests fork detection and pattern recognition features
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
from datetime import datetime, timedelta


class AnalysisIntegrationTest:
    """Integration tests for analysis features"""

    def __init__(self, db_path='../data/kamiyo.db'):
        self.db_path = db_path
        self.conn = None
        self.tests_passed = 0
        self.tests_failed = 0

    def connect(self):
        """Connect to database"""
        try:
            self.conn = sqlite3.connect(self.db_path)
            self.conn.row_factory = sqlite3.Row
            print(f"✓ Connected to database: {self.db_path}")
            return True
        except Exception as e:
            print(f"✗ Failed to connect to database: {e}")
            return False

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("✓ Database connection closed")

    def log_test(self, name, passed, details=""):
        """Log test result"""
        if passed:
            self.tests_passed += 1
            print(f"✓ {name}")
            if details:
                print(f"  └─ {details}")
        else:
            self.tests_failed += 1
            print(f"✗ {name}")
            if details:
                print(f"  └─ {details}")

    def test_database_schema(self):
        """Test that all analysis tables exist"""
        print("\n=== Testing Database Schema ===")

        required_tables = [
            'exploit_analysis',
            'fork_relationships',
            'pattern_clusters',
            'cluster_membership'
        ]

        cursor = self.conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = [row[0] for row in cursor.fetchall()]

        for table in required_tables:
            exists = table in existing_tables
            self.log_test(
                f"Table '{table}' exists",
                exists,
                f"Found in database" if exists else "NOT FOUND"
            )

    def test_database_views(self):
        """Test that analysis views exist"""
        print("\n=== Testing Database Views ===")

        required_views = [
            'v_fork_families',
            'v_cluster_stats'
        ]

        cursor = self.conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='view'")
        existing_views = [row[0] for row in cursor.fetchall()]

        for view in required_views:
            exists = view in existing_views
            self.log_test(
                f"View '{view}' exists",
                exists,
                f"Found in database" if exists else "NOT FOUND"
            )

    def test_table_structure(self):
        """Test table structure matches specification"""
        print("\n=== Testing Table Structures ===")

        # Test exploit_analysis table
        cursor = self.conn.cursor()
        cursor.execute("PRAGMA table_info(exploit_analysis)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}

        required_columns = {
            'id': 'INTEGER',
            'exploit_id': 'INTEGER',
            'analysis_type': 'TEXT',
            'results': 'TEXT',
            'analyzed_at': 'DATETIME'
        }

        for col, col_type in required_columns.items():
            exists = col in columns
            self.log_test(
                f"exploit_analysis.{col} ({col_type})",
                exists,
                f"Type: {columns.get(col, 'MISSING')}"
            )

    def test_indexes(self):
        """Test that performance indexes exist"""
        print("\n=== Testing Database Indexes ===")

        cursor = self.conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
        existing_indexes = [row[0] for row in cursor.fetchall()]

        required_indexes = [
            'idx_analysis_exploit',
            'idx_analysis_type',
            'idx_fork_exploit1',
            'idx_fork_exploit2',
            'idx_membership_exploit',
            'idx_membership_cluster'
        ]

        for index in required_indexes:
            exists = index in existing_indexes
            self.log_test(
                f"Index '{index}' exists",
                exists,
                "Found" if exists else "NOT FOUND"
            )

    def test_sample_data_insertion(self):
        """Test inserting sample analysis data"""
        print("\n=== Testing Data Insertion ===")

        cursor = self.conn.cursor()

        # First, check if we have any exploits to work with
        cursor.execute("SELECT COUNT(*) FROM exploits")
        exploit_count = cursor.fetchone()[0]

        if exploit_count == 0:
            self.log_test(
                "Sample data insertion",
                False,
                "No exploits in database to test with"
            )
            return

        # Get first exploit
        cursor.execute("SELECT id FROM exploits LIMIT 1")
        exploit_id = cursor.fetchone()[0]

        try:
            # Test inserting analysis result
            cursor.execute("""
                INSERT INTO exploit_analysis (exploit_id, analysis_type, results)
                VALUES (?, 'test_analysis', '{"test": true}')
            """, (exploit_id,))

            self.conn.commit()

            # Verify insertion
            cursor.execute("""
                SELECT * FROM exploit_analysis
                WHERE exploit_id = ? AND analysis_type = 'test_analysis'
            """, (exploit_id,))

            result = cursor.fetchone()

            self.log_test(
                "Insert analysis result",
                result is not None,
                f"Exploit ID: {exploit_id}"
            )

            # Clean up test data
            cursor.execute("""
                DELETE FROM exploit_analysis
                WHERE exploit_id = ? AND analysis_type = 'test_analysis'
            """, (exploit_id,))
            self.conn.commit()

        except Exception as e:
            self.log_test(
                "Insert analysis result",
                False,
                f"Error: {str(e)}"
            )

    def test_fork_relationship_insertion(self):
        """Test fork relationship data"""
        print("\n=== Testing Fork Relationships ===")

        cursor = self.conn.cursor()

        # Check if we have at least 2 exploits
        cursor.execute("SELECT id FROM exploits LIMIT 2")
        exploits = cursor.fetchall()

        if len(exploits) < 2:
            self.log_test(
                "Fork relationship insertion",
                False,
                "Need at least 2 exploits to test relationships"
            )
            return

        try:
            exploit_id_1 = exploits[0][0]
            exploit_id_2 = exploits[1][0]

            # Insert test fork relationship
            cursor.execute("""
                INSERT INTO fork_relationships
                (exploit_id_1, exploit_id_2, similarity_score, relationship_type)
                VALUES (?, ?, 0.95, 'test_fork')
            """, (exploit_id_1, exploit_id_2))

            self.conn.commit()

            # Verify
            cursor.execute("""
                SELECT * FROM fork_relationships
                WHERE exploit_id_1 = ? AND exploit_id_2 = ?
            """, (exploit_id_1, exploit_id_2))

            result = cursor.fetchone()

            self.log_test(
                "Insert fork relationship",
                result is not None and result[3] == 0.95,
                f"Similarity: {result[3] if result else 'N/A'}"
            )

            # Clean up
            cursor.execute("""
                DELETE FROM fork_relationships
                WHERE exploit_id_1 = ? AND exploit_id_2 = ?
            """, (exploit_id_1, exploit_id_2))
            self.conn.commit()

        except Exception as e:
            self.log_test(
                "Insert fork relationship",
                False,
                f"Error: {str(e)}"
            )

    def test_cluster_operations(self):
        """Test pattern cluster operations"""
        print("\n=== Testing Pattern Clusters ===")

        cursor = self.conn.cursor()

        try:
            # Insert test cluster
            cursor.execute("""
                INSERT INTO pattern_clusters (cluster_name, characteristics)
                VALUES ('test_cluster', '{"attack_type": "reentrancy"}')
            """)

            self.conn.commit()
            cluster_id = cursor.lastrowid

            self.log_test(
                "Insert pattern cluster",
                cluster_id > 0,
                f"Cluster ID: {cluster_id}"
            )

            # Get an exploit to add to cluster
            cursor.execute("SELECT id FROM exploits LIMIT 1")
            exploit_row = cursor.fetchone()

            if exploit_row:
                exploit_id = exploit_row[0]

                # Add exploit to cluster
                cursor.execute("""
                    INSERT INTO cluster_membership
                    (exploit_id, cluster_id, distance_from_center)
                    VALUES (?, ?, 0.15)
                """, (exploit_id, cluster_id))

                self.conn.commit()

                # Verify membership
                cursor.execute("""
                    SELECT * FROM cluster_membership
                    WHERE exploit_id = ? AND cluster_id = ?
                """, (exploit_id, cluster_id))

                membership = cursor.fetchone()

                self.log_test(
                    "Add exploit to cluster",
                    membership is not None,
                    f"Distance: {membership[3] if membership else 'N/A'}"
                )

                # Clean up membership
                cursor.execute("""
                    DELETE FROM cluster_membership
                    WHERE cluster_id = ?
                """, (cluster_id,))

            # Clean up cluster
            cursor.execute("""
                DELETE FROM pattern_clusters WHERE id = ?
            """, (cluster_id,))

            self.conn.commit()

        except Exception as e:
            self.log_test(
                "Pattern cluster operations",
                False,
                f"Error: {str(e)}"
            )

    def test_view_functionality(self):
        """Test that views return data correctly"""
        print("\n=== Testing View Functionality ===")

        cursor = self.conn.cursor()

        try:
            # Test v_cluster_stats view
            cursor.execute("SELECT * FROM v_cluster_stats LIMIT 1")
            result = cursor.fetchone()

            self.log_test(
                "v_cluster_stats view query",
                True,
                "View accessible"
            )

            # Test v_fork_families view
            cursor.execute("SELECT * FROM v_fork_families LIMIT 1")
            result = cursor.fetchone()

            self.log_test(
                "v_fork_families view query",
                True,
                "View accessible"
            )

        except Exception as e:
            self.log_test(
                "View functionality",
                False,
                f"Error: {str(e)}"
            )

    def run_all_tests(self):
        """Run all integration tests"""
        print("\n" + "="*60)
        print("KAMIYO ANALYSIS API v2 - INTEGRATION TESTS")
        print("="*60)

        if not self.connect():
            print("\n✗ Cannot proceed without database connection")
            return False

        try:
            self.test_database_schema()
            self.test_database_views()
            self.test_table_structure()
            self.test_indexes()
            self.test_sample_data_insertion()
            self.test_fork_relationship_insertion()
            self.test_cluster_operations()
            self.test_view_functionality()

        finally:
            self.close()

        # Print summary
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"✓ Passed: {self.tests_passed}")
        print(f"✗ Failed: {self.tests_failed}")
        print(f"Total: {self.tests_passed + self.tests_failed}")

        if self.tests_failed == 0:
            print("\n🎉 ALL TESTS PASSED!")
            return True
        else:
            print(f"\n⚠️  {self.tests_failed} TEST(S) FAILED")
            return False


if __name__ == '__main__':
    tester = AnalysisIntegrationTest()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)
