# Query Optimization Guide
**Kamiyo Exploit Intelligence Platform**
**Day 13: Database Optimization**

## Table of Contents

1. [Introduction](#introduction)
2. [Query Optimization Best Practices](#query-optimization-best-practices)
3. [Index Usage Guidelines](#index-usage-guidelines)
4. [Common Query Anti-Patterns](#common-query-anti-patterns)
5. [EXPLAIN ANALYZE Interpretation](#explain-analyze-interpretation)
6. [Connection Pooling Configuration](#connection-pooling-configuration)
7. [Read Replica Setup](#read-replica-setup)
8. [Troubleshooting Slow Queries](#troubleshooting-slow-queries)
9. [Performance Benchmarks](#performance-benchmarks)
10. [Monitoring and Maintenance](#monitoring-and-maintenance)

---

## Introduction

This guide provides comprehensive best practices for optimizing database queries in the Kamiyo platform. Following these guidelines will help you achieve:

- Query response times < 50ms (p95)
- Query response times < 20ms (p50)
- Connection pool efficiency > 90%
- Index hit rate > 99%
- Zero N+1 queries

## Query Optimization Best Practices

### 1. Use Specific Column Names

**Bad:**
```sql
SELECT * FROM exploits WHERE chain = 'ethereum';
```

**Good:**
```sql
SELECT id, tx_hash, chain, amount_usd, timestamp
FROM exploits
WHERE chain = 'ethereum';
```

**Why:** Reduces data transfer, allows use of covering indexes, and improves cache efficiency.

### 2. Use LIMIT for Large Result Sets

**Bad:**
```sql
SELECT * FROM exploits ORDER BY timestamp DESC;
```

**Good:**
```sql
SELECT id, tx_hash, chain, amount_usd, timestamp
FROM exploits
ORDER BY timestamp DESC
LIMIT 100;
```

**Why:** Prevents loading excessive data into memory, improves response time.

### 3. Use WHERE Clauses Effectively

**Bad:**
```sql
SELECT * FROM exploits WHERE EXTRACT(YEAR FROM timestamp) = 2024;
```

**Good:**
```sql
SELECT * FROM exploits
WHERE timestamp >= '2024-01-01'
AND timestamp < '2025-01-01';
```

**Why:** Allows index usage. Function calls on columns prevent index usage.

### 4. Avoid SELECT DISTINCT When Possible

**Bad:**
```sql
SELECT DISTINCT chain FROM exploits;
```

**Good:**
```sql
SELECT chain FROM exploits GROUP BY chain;
-- Or even better, use a materialized view or cache
```

**Why:** `GROUP BY` is often more efficient and allows better query optimization.

### 5. Use EXISTS Instead of IN for Subqueries

**Bad:**
```sql
SELECT * FROM users
WHERE id IN (SELECT user_id FROM subscriptions WHERE status = 'active');
```

**Good:**
```sql
SELECT * FROM users u
WHERE EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id AND s.status = 'active'
);
```

**Why:** `EXISTS` can short-circuit and is generally more efficient for large datasets.

### 6. Batch INSERT Operations

**Bad:**
```python
for exploit in exploits:
    cursor.execute("INSERT INTO exploits VALUES (...)", exploit)
    conn.commit()
```

**Good:**
```python
cursor.executemany("INSERT INTO exploits VALUES (...)", exploits)
conn.commit()
```

**Why:** Reduces round trips to database, improves throughput by 10-100x.

### 7. Use Connection Pooling

**Bad:**
```python
def get_exploits():
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    # ... query ...
    conn.close()
```

**Good:**
```python
from database.connection_pool import get_pool_manager

def get_exploits():
    pool = get_pool_manager().get_pool('primary')
    with pool.get_connection() as conn:
        cursor = conn.cursor()
        # ... query ...
```

**Why:** Eliminates connection establishment overhead (typically 20-50ms per connection).

---

## Index Usage Guidelines

### When to Create an Index

Create an index when:
- Column is frequently used in `WHERE` clauses
- Column is used in `JOIN` conditions
- Column is used in `ORDER BY` clauses
- Table has > 1000 rows
- Query performance is critical

### Index Types

#### 1. B-Tree Index (Default)

Best for:
- Equality comparisons (`=`)
- Range queries (`<`, `>`, `BETWEEN`)
- Sorted results (`ORDER BY`)

```sql
CREATE INDEX idx_exploits_timestamp ON exploits(timestamp);
```

#### 2. Partial Index

Best for:
- Queries that filter on specific values
- Reducing index size

```sql
CREATE INDEX idx_exploits_high_value
    ON exploits(amount_usd DESC, timestamp DESC)
    WHERE amount_usd > 1000000;
```

**Usage:**
```sql
-- Will use the partial index
SELECT * FROM exploits
WHERE amount_usd > 1000000
ORDER BY amount_usd DESC;
```

#### 3. Composite Index

Best for:
- Queries with multiple filter conditions
- Complex WHERE clauses

```sql
CREATE INDEX idx_exploits_chain_created
    ON exploits(chain, created_at DESC);
```

**Usage:**
```sql
-- Will use the composite index
SELECT * FROM exploits
WHERE chain = 'ethereum'
ORDER BY created_at DESC;
```

**Column order matters!**
- Most selective column first
- Columns used for equality before range
- ORDER BY columns last

#### 4. Covering Index

Best for:
- Queries that only need specific columns
- Read-heavy workloads

```sql
CREATE INDEX idx_exploits_covering
    ON exploits(created_at DESC, id, chain, amount_usd)
    WHERE deleted_at IS NULL;
```

**Usage:**
```sql
-- Index-only scan (fastest!)
SELECT id, chain, amount_usd
FROM exploits
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 100;
```

#### 5. GIN Index (Generalized Inverted Index)

Best for:
- JSONB columns
- Full-text search
- Array columns

```sql
CREATE INDEX idx_exploits_metadata_gin
    ON exploits USING GIN(metadata);
```

**Usage:**
```sql
SELECT * FROM exploits
WHERE metadata @> '{"severity": "critical"}';
```

#### 6. Full-Text Search Index

Best for:
- Searching within text columns

```sql
CREATE INDEX idx_exploits_fulltext
    ON exploits USING GIN(to_tsvector('english',
        COALESCE(description, '') || ' ' ||
        COALESCE(protocol, '')
    ));
```

**Usage:**
```sql
SELECT * FROM exploits
WHERE to_tsvector('english', description || ' ' || protocol)
    @@ to_tsquery('english', 'reentrancy & exploit');
```

### Index Maintenance

```sql
-- Rebuild all indexes (use during maintenance window)
REINDEX TABLE exploits;

-- Update statistics for query planner
ANALYZE exploits;

-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- Find unused indexes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexrelname NOT LIKE '%_pkey';
```

---

## Common Query Anti-Patterns

### 1. N+1 Query Problem

**Bad:**
```python
# Get all users
users = db.query("SELECT * FROM users LIMIT 100")

# For each user, get their subscription (N+1!)
for user in users:
    subscription = db.query(
        "SELECT * FROM subscriptions WHERE user_id = %s",
        (user['id'],)
    )
```

**Good:**
```python
# Single query with JOIN
results = db.query("""
    SELECT u.*, s.*
    FROM users u
    LEFT JOIN subscriptions s ON u.id = s.user_id
    LIMIT 100
""")
```

### 2. SELECT * in Joins

**Bad:**
```sql
SELECT *
FROM exploits e
JOIN sources s ON e.source_id = s.id
WHERE e.chain = 'ethereum';
```

**Good:**
```sql
SELECT
    e.id, e.tx_hash, e.chain, e.amount_usd,
    s.name as source_name, s.url as source_url
FROM exploits e
JOIN sources s ON e.source_id = s.id
WHERE e.chain = 'ethereum';
```

### 3. Implicit Type Conversion

**Bad:**
```sql
SELECT * FROM exploits WHERE id = '123';  -- id is INTEGER
```

**Good:**
```sql
SELECT * FROM exploits WHERE id = 123;
```

**Why:** Implicit conversion prevents index usage.

### 4. OR in WHERE Clause

**Bad:**
```sql
SELECT * FROM exploits
WHERE chain = 'ethereum' OR chain = 'binance';
```

**Good:**
```sql
SELECT * FROM exploits
WHERE chain IN ('ethereum', 'binance');
```

**Or even better:**
```sql
SELECT * FROM exploits WHERE chain = 'ethereum'
UNION ALL
SELECT * FROM exploits WHERE chain = 'binance';
```

### 5. LIKE with Leading Wildcard

**Bad:**
```sql
SELECT * FROM exploits WHERE protocol LIKE '%swap%';
```

**Good (if possible):**
```sql
SELECT * FROM exploits WHERE protocol LIKE 'Uniswap%';
-- Or use full-text search for substring matching
```

### 6. Cartesian Joins

**Bad:**
```sql
SELECT * FROM exploits, sources
WHERE exploits.chain = 'ethereum';
```

**Good:**
```sql
SELECT * FROM exploits
JOIN sources ON exploits.source_id = sources.id
WHERE exploits.chain = 'ethereum';
```

---

## EXPLAIN ANALYZE Interpretation

### Running EXPLAIN ANALYZE

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM exploits WHERE chain = 'ethereum';
```

### Understanding the Output

```
Seq Scan on exploits  (cost=0.00..1234.56 rows=100 width=256) (actual time=0.05..25.32 rows=98 loops=1)
  Filter: (chain = 'ethereum'::text)
  Rows Removed by Filter: 9902
  Buffers: shared hit=123 read=45
Planning Time: 0.234 ms
Execution Time: 25.567 ms
```

**Key Metrics:**

- **cost**: Estimated cost (lower is better)
  - Format: `cost=startup..total`
  - Startup cost: Cost before first row
  - Total cost: Cost for all rows

- **rows**: Estimated vs actual row count
  - `rows=100`: Planner estimate
  - `actual ... rows=98`: Actual count

- **width**: Average row size in bytes

- **actual time**: Actual execution time in milliseconds
  - Format: `actual time=startup..total`

- **loops**: Number of times the node was executed

- **Buffers**:
  - `shared hit`: Pages found in cache (fast!)
  - `shared read`: Pages read from disk (slow)
  - Target: > 99% hit rate

### Scan Types (Fastest to Slowest)

1. **Index Only Scan** (Fastest)
   - All needed columns in index
   - No table access required

2. **Index Scan**
   - Uses index to find rows
   - Then fetches from table

3. **Bitmap Index Scan + Bitmap Heap Scan**
   - Uses multiple indexes
   - Good for OR conditions

4. **Sequential Scan** (Slowest)
   - Reads entire table
   - No index used
   - Acceptable for small tables (<1000 rows)

### Red Flags

- **Seq Scan on large tables** → Add index
- **High "Rows Removed by Filter"** → Improve WHERE clause or add index
- **High "Buffers: read"** → Improve cache or add indexes
- **Large difference between estimated and actual rows** → Run `ANALYZE table`

---

## Connection Pooling Configuration

### Basic Setup

```python
from database.connection_pool import get_pool_manager

# Initialize pool manager
manager = get_pool_manager()

# Create primary pool
primary_pool = manager.create_pool(
    name='primary',
    database_url=os.getenv('DATABASE_URL'),
    min_connections=10,   # Minimum pool size
    max_connections=50,   # Maximum pool size
    connection_timeout=30 # Timeout in seconds
)

# Use connection
with primary_pool.get_connection() as conn:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM exploits LIMIT 10")
    results = cursor.fetchall()
```

### Pool Sizing Guidelines

**Formula:**
```
max_connections = (number_of_app_servers * max_threads_per_server * 2) + 10
min_connections = max_connections / 5
```

**Example:**
- 2 app servers
- 10 threads per server
- Max connections: (2 * 10 * 2) + 10 = 50
- Min connections: 50 / 5 = 10

### Monitoring Pool Health

```python
# Get pool statistics
stats = primary_pool.get_statistics()

print(f"Active connections: {stats.active_connections}")
print(f"Idle connections: {stats.idle_connections}")
print(f"Pool efficiency: {primary_pool.get_pool_efficiency():.2f}%")

# Print detailed statistics
primary_pool.print_statistics()
```

### Troubleshooting

**Pool Exhaustion:**
```
PoolError: Connection pool 'primary' exhausted (timeout after 30s)
```

**Solutions:**
1. Increase `max_connections`
2. Reduce query execution time
3. Check for connection leaks (connections not returned to pool)
4. Increase `connection_timeout`

**Connection Leaks:**
```python
# Always use context manager
with pool.get_connection() as conn:
    # Query here
    pass
# Connection automatically returned to pool
```

---

## Read Replica Setup

### Configuration

```python
from database.read_replica import ReadReplicaManager

# Initialize with primary and replicas
manager = ReadReplicaManager(
    primary_url=os.getenv('DATABASE_URL'),
    replica_urls=[
        os.getenv('READ_REPLICA_1_URL'),
        os.getenv('READ_REPLICA_2_URL'),
    ],
    max_replica_lag_seconds=5.0,  # Max acceptable lag
    health_check_interval=30       # Check health every 30s
)

# Automatic routing
with manager.get_connection(query="SELECT * FROM exploits") as conn:
    # Automatically routed to replica
    pass

with manager.get_connection(query="INSERT INTO exploits ...") as conn:
    # Automatically routed to primary
    pass

# Force primary
with manager.get_connection(force_primary=True) as conn:
    # Always uses primary
    pass
```

### Query Classification

**Read queries (routed to replica):**
- `SELECT`
- `WITH ... SELECT`

**Write queries (routed to primary):**
- `INSERT`
- `UPDATE`
- `DELETE`
- `CREATE`
- `ALTER`
- `DROP`
- Transaction control (`BEGIN`, `COMMIT`, `ROLLBACK`)

### Monitoring Replication

```python
# Check replica health
health = manager.get_replica_health_status()
for replica_name, status in health.items():
    print(f"{replica_name}: lag={status.replication_lag_seconds}s, healthy={status.is_healthy}")

# Get routing statistics
stats = manager.get_routing_statistics()
print(f"Read queries: {stats.read_queries}")
print(f"Routed to replica: {stats.routed_to_replica}")
print(f"Failovers: {stats.replica_failovers}")
```

### Handling Replication Lag

```sql
-- Check replication lag on replica
SELECT
    CASE
        WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
        THEN 0
        ELSE EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
    END AS lag_seconds;
```

**If lag is high:**
1. Check network connectivity
2. Verify replica has sufficient resources
3. Check primary write load
4. Consider additional replicas for load balancing

---

## Troubleshooting Slow Queries

### Step-by-Step Diagnosis

#### 1. Identify Slow Queries

```sql
-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slow queries
SELECT
    LEFT(query, 100) as query_preview,
    calls,
    ROUND(mean_exec_time::numeric, 2) as mean_ms,
    ROUND(max_exec_time::numeric, 2) as max_ms
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Queries > 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;
```

#### 2. Analyze with EXPLAIN

```sql
EXPLAIN (ANALYZE, BUFFERS) <your slow query>;
```

#### 3. Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Sequential scan on large table | Add index on filtered columns |
| High "Rows Removed by Filter" | Add more selective index or improve WHERE clause |
| Index scan returning many rows | Consider covering index or limit result set |
| Many buffer reads (disk I/O) | Increase shared_buffers or add indexes |
| Nested Loop join on large tables | Force Hash Join or improve statistics |

#### 4. Use Query Optimizer

```python
from database.query_optimizer import get_query_optimizer

optimizer = get_query_optimizer()

# Generate optimization report
report = optimizer.generate_optimization_report()
print(report)

# Get index recommendations
recommendations = optimizer.get_index_recommendations()
for rec in recommendations:
    print(f"Recommended: {rec.create_sql}")
```

### Quick Fixes

#### Add Missing Index

```sql
-- Analyze query
EXPLAIN SELECT * FROM exploits WHERE chain = 'ethereum';
-- Shows: Seq Scan on exploits  (cost=0.00..1234.56 rows=100 width=256)

-- Add index
CREATE INDEX idx_exploits_chain ON exploits(chain);

-- Verify improvement
EXPLAIN SELECT * FROM exploits WHERE chain = 'ethereum';
-- Shows: Index Scan using idx_exploits_chain  (cost=0.29..123.45 rows=100 width=256)
```

#### Update Statistics

```sql
-- Update table statistics
ANALYZE exploits;

-- Rerun query
```

#### Rewrite Query

```sql
-- Before (slow)
SELECT * FROM exploits WHERE EXTRACT(YEAR FROM timestamp) = 2024;

-- After (fast)
SELECT * FROM exploits
WHERE timestamp >= '2024-01-01'
AND timestamp < '2025-01-01';
```

---

## Performance Benchmarks

### Target Metrics

| Metric | Target | Critical |
|--------|--------|----------|
| Query response time (p50) | < 20ms | < 50ms |
| Query response time (p95) | < 50ms | < 100ms |
| Query response time (p99) | < 100ms | < 200ms |
| Connection pool efficiency | > 90% | > 80% |
| Index hit rate | > 99% | > 95% |
| Cache hit rate | > 99% | > 95% |
| Database CPU | < 50% | < 70% |
| Connection count | < 80% of max | < 95% of max |

### Running Benchmarks

```bash
# Analyze queries
./scripts/analyze_queries.sh

# Run performance benchmarks
python3 -m database.query_optimizer
```

### Sample Queries to Benchmark

```sql
-- Simple SELECT
SELECT * FROM exploits LIMIT 1;

-- Filtered SELECT
SELECT * FROM exploits WHERE chain = 'ethereum' LIMIT 100;

-- Sorted SELECT
SELECT * FROM exploits ORDER BY created_at DESC LIMIT 100;

-- Aggregation
SELECT chain, COUNT(*), SUM(amount_usd)
FROM exploits
GROUP BY chain;

-- JOIN
SELECT e.*, s.name
FROM exploits e
JOIN sources s ON e.source_id = s.id
WHERE e.chain = 'ethereum'
LIMIT 100;
```

---

## Monitoring and Maintenance

### Daily Monitoring

```python
from monitoring.query_performance import get_query_monitor

monitor = get_query_monitor()

# Print statistics
monitor.print_statistics()

# Get slow queries
slow_queries = monitor.get_slow_queries(limit=10)
for query in slow_queries:
    print(f"{query['execution_time_ms']:.2f}ms - {query['query'][:100]}")
```

### Weekly Maintenance

```bash
# Run database maintenance
./scripts/database_maintenance.sh
```

### Monthly Tasks

1. **Review Index Usage**
```sql
SELECT * FROM find_unused_indexes();
```

2. **Check Table Bloat**
```sql
SELECT * FROM get_table_bloat();
```

3. **Archive Old Data**
```python
from database.archival import get_data_archival

archival = get_data_archival()
archival.archive_old_exploits(dry_run=True)  # Preview
archival.archive_old_exploits(dry_run=False) # Execute
```

4. **Review Slow Queries**
```bash
./scripts/analyze_queries.sh
```

### Quarterly Tasks

1. **Deep maintenance (during maintenance window)**
```bash
REINDEX=true VACUUM_ANALYZE=true ./scripts/database_maintenance.sh
```

2. **Review and optimize materialized views**
```sql
-- Check materialized view refresh times
SELECT * FROM archival_history ORDER BY archived_at DESC LIMIT 10;

-- Consider adding or removing views based on usage
```

3. **Capacity planning**
- Review database growth rate
- Plan for scaling (vertical or horizontal)
- Consider archival strategy

---

## Conclusion

Following this guide will help you maintain optimal database performance for the Kamiyo platform. Key takeaways:

1. **Always use indexes** for filtered and sorted columns
2. **Monitor query performance** continuously
3. **Use connection pooling** to reduce overhead
4. **Leverage read replicas** for scaling reads
5. **Run regular maintenance** (VACUUM, ANALYZE, REINDEX)
6. **Archive old data** to keep tables lean
7. **Profile slow queries** with EXPLAIN ANALYZE
8. **Avoid anti-patterns** (N+1, SELECT *, etc.)

For questions or issues, refer to:
- PostgreSQL documentation: https://www.postgresql.org/docs/
- Query optimization tools in `database/` directory
- Monitoring dashboards in Grafana

**Happy optimizing!**
