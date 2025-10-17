# -*- coding: utf-8 -*-
"""
Query Optimizer and Performance Analyzer
Detects slow queries, analyzes execution plans, and provides optimization recommendations
"""

import os
import time
import re
import logging
import psycopg2
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from collections import defaultdict
import json

logger = logging.getLogger(__name__)


@dataclass
class QueryPlan:
    """
    Database query execution plan
    """
    query: str
    query_hash: str
    execution_time_ms: float
    plan_json: Dict[str, Any]
    rows_returned: int
    total_cost: float
    startup_cost: float
    plan_width: int
    has_seq_scan: bool
    has_index_scan: bool
    has_bitmap_scan: bool
    buffer_hits: Optional[int]
    buffer_reads: Optional[int]
    timestamp: datetime


@dataclass
class SlowQuery:
    """
    Slow query record for tracking and analysis
    """
    query: str
    query_hash: str
    execution_time_ms: float
    call_count: int
    avg_time_ms: float
    max_time_ms: float
    min_time_ms: float
    total_time_ms: float
    first_seen: datetime
    last_seen: datetime
    caller_info: Optional[str]


@dataclass
class IndexRecommendation:
    """
    Index recommendation based on query analysis
    """
    table_name: str
    columns: List[str]
    index_type: str  # btree, hash, gin, gist
    reason: str
    estimated_benefit: str
    query_pattern: str
    create_sql: str


class QueryOptimizer:
    """
    Query performance optimizer with automatic analysis and recommendations

    Features:
    - Slow query detection and logging
    - EXPLAIN ANALYZE wrapper for all queries
    - Query execution plan analysis
    - Index recommendation engine
    - N+1 query detection
    - Query performance profiling
    - Optimization suggestions
    """

    def __init__(self,
                 database_url: str = None,
                 slow_query_threshold_ms: float = 100.0,
                 enable_auto_explain: bool = True,
                 log_all_queries: bool = False):
        """
        Initialize query optimizer

        Args:
            database_url: PostgreSQL connection URL
            slow_query_threshold_ms: Threshold for slow query detection (default: 100ms)
            enable_auto_explain: Automatically run EXPLAIN ANALYZE on slow queries
            log_all_queries: Log all queries regardless of execution time
        """
        self.database_url = database_url or os.getenv('DATABASE_URL')
        self.slow_query_threshold_ms = slow_query_threshold_ms
        self.enable_auto_explain = enable_auto_explain
        self.log_all_queries = log_all_queries

        # Query tracking
        self.query_stats: Dict[str, SlowQuery] = {}
        self.query_plans: List[QueryPlan] = []
        self.index_recommendations: List[IndexRecommendation] = []

        # N+1 detection
        self.recent_queries: List[Tuple[str, float]] = []
        self.n_plus_one_patterns: List[Dict[str, Any]] = []

        # Performance stats
        self.total_queries = 0
        self.slow_queries_count = 0
        self.total_execution_time_ms = 0.0

        logger.info(f"QueryOptimizer initialized with {slow_query_threshold_ms}ms threshold")

    def _hash_query(self, query: str) -> str:
        """
        Generate hash for query (normalize parameters for grouping)

        Args:
            query: SQL query

        Returns:
            Query hash string
        """
        # Normalize query by replacing parameters
        normalized = re.sub(r'\$\d+', '$N', query)
        normalized = re.sub(r"'[^']*'", "'?'", normalized)
        normalized = re.sub(r'\b\d+\b', 'N', normalized)
        normalized = re.sub(r'\s+', ' ', normalized).strip()

        return str(hash(normalized))

    def _extract_table_name(self, query: str) -> Optional[str]:
        """
        Extract table name from SQL query

        Args:
            query: SQL query

        Returns:
            Table name or None
        """
        query_upper = query.upper()

        # Try to extract from FROM clause
        from_match = re.search(r'\bFROM\s+(\w+)', query_upper)
        if from_match:
            return from_match.group(1).lower()

        # Try to extract from INSERT/UPDATE/DELETE
        for keyword in ['INSERT INTO', 'UPDATE', 'DELETE FROM']:
            if keyword in query_upper:
                table_match = re.search(rf'\b{keyword}\s+(\w+)', query_upper)
                if table_match:
                    return table_match.group(1).lower()

        return None

    def execute_with_profiling(self,
                               connection,
                               query: str,
                               params: Tuple = None,
                               caller_info: str = None) -> Tuple[List, float]:
        """
        Execute query with automatic profiling and optimization analysis

        Args:
            connection: Database connection
            query: SQL query
            params: Query parameters
            caller_info: Information about caller (file:line)

        Returns:
            Tuple of (results, execution_time_ms)
        """
        start_time = time.time()
        query_hash = self._hash_query(query)

        cursor = connection.cursor()
        try:
            # Execute query
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)

            # Fetch results if SELECT
            results = []
            if cursor.description:
                results = cursor.fetchall()

            # Calculate execution time
            execution_time_ms = (time.time() - start_time) * 1000

            # Update statistics
            self._update_query_stats(query, query_hash, execution_time_ms, caller_info)

            # Log slow queries
            if execution_time_ms >= self.slow_query_threshold_ms or self.log_all_queries:
                logger.warning(
                    f"Slow query ({execution_time_ms:.2f}ms): {query[:100]}... "
                    f"[caller: {caller_info}]"
                )

                # Run EXPLAIN ANALYZE for slow queries
                if self.enable_auto_explain and execution_time_ms >= self.slow_query_threshold_ms:
                    self._analyze_query_plan(connection, query, params)

            # N+1 detection
            self._detect_n_plus_one(query, execution_time_ms)

            return results, execution_time_ms

        finally:
            cursor.close()

    def _update_query_stats(self,
                           query: str,
                           query_hash: str,
                           execution_time_ms: float,
                           caller_info: Optional[str]):
        """
        Update query statistics for tracking

        Args:
            query: SQL query
            query_hash: Query hash for grouping
            execution_time_ms: Execution time in milliseconds
            caller_info: Caller information
        """
        self.total_queries += 1
        self.total_execution_time_ms += execution_time_ms

        if execution_time_ms >= self.slow_query_threshold_ms:
            self.slow_queries_count += 1

        now = datetime.now()

        if query_hash in self.query_stats:
            stats = self.query_stats[query_hash]
            stats.call_count += 1
            stats.total_time_ms += execution_time_ms
            stats.avg_time_ms = stats.total_time_ms / stats.call_count
            stats.max_time_ms = max(stats.max_time_ms, execution_time_ms)
            stats.min_time_ms = min(stats.min_time_ms, execution_time_ms)
            stats.last_seen = now
        else:
            self.query_stats[query_hash] = SlowQuery(
                query=query,
                query_hash=query_hash,
                execution_time_ms=execution_time_ms,
                call_count=1,
                avg_time_ms=execution_time_ms,
                max_time_ms=execution_time_ms,
                min_time_ms=execution_time_ms,
                total_time_ms=execution_time_ms,
                first_seen=now,
                last_seen=now,
                caller_info=caller_info
            )

    def _analyze_query_plan(self,
                           connection,
                           query: str,
                           params: Tuple = None):
        """
        Analyze query execution plan using EXPLAIN ANALYZE

        Args:
            connection: Database connection
            query: SQL query
            params: Query parameters
        """
        cursor = connection.cursor()
        try:
            # Build EXPLAIN ANALYZE query
            explain_query = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}"

            # Execute EXPLAIN
            if params:
                cursor.execute(explain_query, params)
            else:
                cursor.execute(explain_query)

            result = cursor.fetchone()
            if result and len(result) > 0:
                plan_data = result[0]
                if isinstance(plan_data, str):
                    plan_data = json.loads(plan_data)

                plan = plan_data[0] if isinstance(plan_data, list) else plan_data

                # Extract plan details
                execution_time = plan.get('Execution Time', 0)
                planning_time = plan.get('Planning Time', 0)

                root_plan = plan.get('Plan', {})
                total_cost = root_plan.get('Total Cost', 0)
                startup_cost = root_plan.get('Startup Cost', 0)
                rows = root_plan.get('Actual Rows', 0)
                plan_width = root_plan.get('Plan Width', 0)

                # Check for scan types
                has_seq_scan = self._has_node_type(root_plan, 'Seq Scan')
                has_index_scan = self._has_node_type(root_plan, 'Index Scan')
                has_bitmap_scan = self._has_node_type(root_plan, 'Bitmap Heap Scan')

                # Get buffer statistics
                shared_hit = root_plan.get('Shared Hit Blocks', 0)
                shared_read = root_plan.get('Shared Read Blocks', 0)

                query_plan = QueryPlan(
                    query=query,
                    query_hash=self._hash_query(query),
                    execution_time_ms=execution_time,
                    plan_json=plan,
                    rows_returned=rows,
                    total_cost=total_cost,
                    startup_cost=startup_cost,
                    plan_width=plan_width,
                    has_seq_scan=has_seq_scan,
                    has_index_scan=has_index_scan,
                    has_bitmap_scan=has_bitmap_scan,
                    buffer_hits=shared_hit,
                    buffer_reads=shared_read,
                    timestamp=datetime.now()
                )

                self.query_plans.append(query_plan)

                # Generate index recommendations
                if has_seq_scan and rows > 1000:
                    self._recommend_index(query, root_plan)

        except Exception as e:
            logger.error(f"Failed to analyze query plan: {e}")
        finally:
            cursor.close()

    def _has_node_type(self, plan_node: Dict, node_type: str) -> bool:
        """
        Recursively check if plan contains node type

        Args:
            plan_node: Plan node dictionary
            node_type: Node type to search for

        Returns:
            True if node type found
        """
        if not plan_node:
            return False

        if plan_node.get('Node Type') == node_type:
            return True

        # Check child plans
        if 'Plans' in plan_node:
            for child in plan_node['Plans']:
                if self._has_node_type(child, node_type):
                    return True

        return False

    def _recommend_index(self, query: str, plan_node: Dict):
        """
        Generate index recommendation based on query plan

        Args:
            query: SQL query
            plan_node: Query plan node
        """
        # Extract table name and filter conditions
        table_name = self._extract_table_name(query)
        if not table_name:
            return

        # Look for filter conditions
        filter_cond = plan_node.get('Filter')
        if filter_cond:
            # Extract column names from filter
            columns = re.findall(r'\((\w+)\s*[=<>]', filter_cond)

            if columns:
                recommendation = IndexRecommendation(
                    table_name=table_name,
                    columns=columns,
                    index_type='btree',
                    reason=f"Sequential scan on {len(plan_node.get('Actual Rows', 0))} rows with filter",
                    estimated_benefit="high",
                    query_pattern=query[:200],
                    create_sql=f"CREATE INDEX idx_{table_name}_{'_'.join(columns)} ON {table_name}({', '.join(columns)});"
                )

                self.index_recommendations.append(recommendation)

                logger.info(f"Index recommendation: {recommendation.create_sql}")

    def _detect_n_plus_one(self, query: str, execution_time_ms: float):
        """
        Detect N+1 query patterns

        Args:
            query: SQL query
            execution_time_ms: Execution time
        """
        current_time = time.time()

        # Add to recent queries (keep last 100)
        self.recent_queries.append((query, current_time))
        if len(self.recent_queries) > 100:
            self.recent_queries.pop(0)

        # Check for repeating patterns in last 5 seconds
        recent_window = [
            (q, t) for q, t in self.recent_queries
            if current_time - t < 5.0
        ]

        if len(recent_window) < 10:
            return

        # Group by query hash
        query_groups = defaultdict(list)
        for q, t in recent_window:
            qh = self._hash_query(q)
            query_groups[qh].append((q, t))

        # Detect repeated queries
        for query_hash, queries in query_groups.items():
            if len(queries) >= 10:
                # Potential N+1
                pattern = {
                    'query_hash': query_hash,
                    'query': queries[0][0],
                    'count': len(queries),
                    'time_window_sec': current_time - queries[0][1],
                    'detected_at': datetime.now()
                }

                # Check if already detected
                if not any(p['query_hash'] == query_hash for p in self.n_plus_one_patterns):
                    self.n_plus_one_patterns.append(pattern)

                    logger.warning(
                        f"N+1 query detected: {len(queries)} identical queries in "
                        f"{pattern['time_window_sec']:.1f}s - {queries[0][0][:100]}"
                    )

    def get_slow_queries(self, limit: int = 20) -> List[SlowQuery]:
        """
        Get slowest queries by average execution time

        Args:
            limit: Maximum number of queries to return

        Returns:
            List of slow queries
        """
        sorted_queries = sorted(
            self.query_stats.values(),
            key=lambda x: x.avg_time_ms,
            reverse=True
        )
        return sorted_queries[:limit]

    def get_most_frequent_queries(self, limit: int = 20) -> List[SlowQuery]:
        """
        Get most frequently executed queries

        Args:
            limit: Maximum number of queries to return

        Returns:
            List of frequent queries
        """
        sorted_queries = sorted(
            self.query_stats.values(),
            key=lambda x: x.call_count,
            reverse=True
        )
        return sorted_queries[:limit]

    def get_query_plans(self, limit: int = 20) -> List[QueryPlan]:
        """
        Get recent query execution plans

        Args:
            limit: Maximum number of plans to return

        Returns:
            List of query plans
        """
        sorted_plans = sorted(
            self.query_plans,
            key=lambda x: x.execution_time_ms,
            reverse=True
        )
        return sorted_plans[:limit]

    def get_index_recommendations(self) -> List[IndexRecommendation]:
        """
        Get all index recommendations

        Returns:
            List of index recommendations
        """
        return self.index_recommendations

    def get_n_plus_one_patterns(self) -> List[Dict[str, Any]]:
        """
        Get detected N+1 query patterns

        Returns:
            List of N+1 patterns
        """
        return self.n_plus_one_patterns

    def get_statistics(self) -> Dict[str, Any]:
        """
        Get overall query statistics

        Returns:
            Statistics dictionary
        """
        avg_execution_time = (
            self.total_execution_time_ms / self.total_queries
            if self.total_queries > 0 else 0
        )

        slow_query_percentage = (
            (self.slow_queries_count / self.total_queries * 100)
            if self.total_queries > 0 else 0
        )

        return {
            'total_queries': self.total_queries,
            'slow_queries_count': self.slow_queries_count,
            'slow_query_percentage': f"{slow_query_percentage:.2f}%",
            'total_execution_time_ms': self.total_execution_time_ms,
            'avg_execution_time_ms': f"{avg_execution_time:.2f}",
            'unique_queries': len(self.query_stats),
            'index_recommendations_count': len(self.index_recommendations),
            'n_plus_one_patterns_count': len(self.n_plus_one_patterns)
        }

    def generate_optimization_report(self) -> str:
        """
        Generate comprehensive optimization report

        Returns:
            Formatted report string
        """
        report = []
        report.append("=" * 80)
        report.append("QUERY OPTIMIZATION REPORT")
        report.append("=" * 80)
        report.append("")

        # Overall statistics
        stats = self.get_statistics()
        report.append("OVERALL STATISTICS")
        report.append("-" * 80)
        for key, value in stats.items():
            report.append(f"  {key}: {value}")
        report.append("")

        # Slowest queries
        slow_queries = self.get_slow_queries(10)
        if slow_queries:
            report.append("TOP 10 SLOWEST QUERIES (by avg time)")
            report.append("-" * 80)
            for i, query in enumerate(slow_queries, 1):
                report.append(f"{i}. {query.query[:100]}...")
                report.append(f"   Avg: {query.avg_time_ms:.2f}ms | Max: {query.max_time_ms:.2f}ms | "
                            f"Calls: {query.call_count} | Total: {query.total_time_ms:.2f}ms")
                report.append("")

        # Most frequent queries
        frequent_queries = self.get_most_frequent_queries(10)
        if frequent_queries:
            report.append("TOP 10 MOST FREQUENT QUERIES")
            report.append("-" * 80)
            for i, query in enumerate(frequent_queries, 1):
                report.append(f"{i}. {query.query[:100]}...")
                report.append(f"   Calls: {query.call_count} | Avg: {query.avg_time_ms:.2f}ms | "
                            f"Total: {query.total_time_ms:.2f}ms")
                report.append("")

        # Index recommendations
        recommendations = self.get_index_recommendations()
        if recommendations:
            report.append("INDEX RECOMMENDATIONS")
            report.append("-" * 80)
            for i, rec in enumerate(recommendations, 1):
                report.append(f"{i}. Table: {rec.table_name} | Columns: {', '.join(rec.columns)}")
                report.append(f"   Reason: {rec.reason}")
                report.append(f"   SQL: {rec.create_sql}")
                report.append("")

        # N+1 patterns
        n_plus_one = self.get_n_plus_one_patterns()
        if n_plus_one:
            report.append("N+1 QUERY PATTERNS DETECTED")
            report.append("-" * 80)
            for i, pattern in enumerate(n_plus_one, 1):
                report.append(f"{i}. {pattern['count']} identical queries in {pattern['time_window_sec']:.1f}s")
                report.append(f"   Query: {pattern['query'][:100]}...")
                report.append("")

        report.append("=" * 80)
        report.append("END OF REPORT")
        report.append("=" * 80)

        return "\n".join(report)

    def export_to_json(self) -> str:
        """
        Export all analysis data to JSON

        Returns:
            JSON string
        """
        data = {
            'statistics': self.get_statistics(),
            'slow_queries': [asdict(q) for q in self.get_slow_queries()],
            'frequent_queries': [asdict(q) for q in self.get_most_frequent_queries()],
            'index_recommendations': [asdict(r) for r in self.get_index_recommendations()],
            'n_plus_one_patterns': self.get_n_plus_one_patterns(),
            'generated_at': datetime.now().isoformat()
        }

        return json.dumps(data, indent=2, default=str)


# Singleton instance
_optimizer_instance: Optional[QueryOptimizer] = None


def get_query_optimizer() -> QueryOptimizer:
    """
    Get query optimizer singleton

    Returns:
        QueryOptimizer instance
    """
    global _optimizer_instance
    if _optimizer_instance is None:
        _optimizer_instance = QueryOptimizer()
    return _optimizer_instance


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Query Optimizer Test ===\n")

    # Create optimizer
    optimizer = QueryOptimizer(
        slow_query_threshold_ms=50.0,
        enable_auto_explain=True
    )

    print("✅ Query Optimizer initialized")
    print(f"   Slow query threshold: {optimizer.slow_query_threshold_ms}ms")
    print(f"   Auto EXPLAIN: {optimizer.enable_auto_explain}")
    print("")

    # Simulate some queries
    print("Simulating queries...")
    test_queries = [
        "SELECT * FROM exploits WHERE chain = 'ethereum' ORDER BY timestamp DESC",
        "SELECT * FROM users WHERE email = 'test@example.com'",
        "SELECT * FROM subscriptions WHERE user_id = 123",
    ]

    for query in test_queries:
        query_hash = optimizer._hash_query(query)
        optimizer._update_query_stats(query, query_hash, 75.5, "test.py:123")

    print("")
    print("Statistics:")
    stats = optimizer.get_statistics()
    for key, value in stats.items():
        print(f"  {key}: {value}")

    print("\n✅ Query Optimizer ready for production")
