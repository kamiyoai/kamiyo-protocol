# -*- coding: utf-8 -*-
"""
Prometheus Metrics for Kamiyo
Tracks API performance, aggregator health, and system metrics
"""

from prometheus_client import Counter, Histogram, Gauge, Info, generate_latest
from prometheus_client import CollectorRegistry, CONTENT_TYPE_LATEST
from functools import wraps
import time
import logging

logger = logging.getLogger(__name__)

# Create registry
registry = CollectorRegistry()

# ==========================================
# API METRICS
# ==========================================

# Request counter
api_requests_total = Counter(
    'kamiyo_api_requests_total',
    'Total number of API requests',
    ['method', 'endpoint', 'status'],
    registry=registry
)

# Request duration
api_request_duration_seconds = Histogram(
    'kamiyo_api_request_duration_seconds',
    'API request duration in seconds',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    registry=registry
)

# Active requests
api_requests_in_progress = Gauge(
    'kamiyo_api_requests_in_progress',
    'Number of API requests currently being processed',
    ['endpoint'],
    registry=registry
)

# ==========================================
# DATABASE METRICS
# ==========================================

# Query duration
db_query_duration_seconds = Histogram(
    'kamiyo_db_query_duration_seconds',
    'Database query duration in seconds',
    ['query_type'],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0],
    registry=registry
)

# Connection pool
db_connections_active = Gauge(
    'kamiyo_db_connections_active',
    'Number of active database connections',
    registry=registry
)

db_connections_idle = Gauge(
    'kamiyo_db_connections_idle',
    'Number of idle database connections',
    registry=registry
)

# Total exploits
db_exploits_total = Gauge(
    'kamiyo_db_exploits_total',
    'Total number of exploits in database',
    registry=registry
)

# ==========================================
# AGGREGATOR METRICS
# ==========================================

# Fetch counter
aggregator_fetches_total = Counter(
    'kamiyo_aggregator_fetches_total',
    'Total number of aggregator fetch attempts',
    ['source', 'status'],
    registry=registry
)

# Fetch duration
aggregator_fetch_duration_seconds = Histogram(
    'kamiyo_aggregator_fetch_duration_seconds',
    'Aggregator fetch duration in seconds',
    ['source'],
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0],
    registry=registry
)

# Exploits discovered
aggregator_exploits_discovered = Counter(
    'kamiyo_aggregator_exploits_discovered',
    'Number of new exploits discovered',
    ['source'],
    registry=registry
)

# Source health
aggregator_source_health = Gauge(
    'kamiyo_aggregator_source_health',
    'Source health score (0-100)',
    ['source'],
    registry=registry
)

# ==========================================
# USER METRICS
# ==========================================

# Active users
users_active_total = Gauge(
    'kamiyo_users_active_total',
    'Number of active users',
    ['tier'],
    registry=registry
)

# Subscription events
subscriptions_total = Counter(
    'kamiyo_subscriptions_total',
    'Total number of subscription events',
    ['tier', 'event'],  # event: created, upgraded, downgraded, cancelled
    registry=registry
)

# API key usage
api_key_requests = Counter(
    'kamiyo_api_key_requests_total',
    'Number of requests per API key',
    ['tier'],
    registry=registry
)

# ==========================================
# PAYMENT METRICS
# ==========================================

# Revenue
revenue_total = Counter(
    'kamiyo_revenue_total_usd',
    'Total revenue in USD',
    ['tier'],
    registry=registry
)

# Payment events
payments_total = Counter(
    'kamiyo_payments_total',
    'Total number of payment events',
    ['status'],  # status: succeeded, failed, refunded
    registry=registry
)

# ==========================================
# CACHE METRICS
# ==========================================

# Cache hits/misses
cache_operations_total = Counter(
    'kamiyo_cache_operations_total',
    'Total cache operations',
    ['operation', 'result'],  # operation: get, set; result: hit, miss
    registry=registry
)

# ==========================================
# SYSTEM METRICS
# ==========================================

# Application info
app_info = Info(
    'kamiyo_app',
    'Application information',
    registry=registry
)

# Uptime
app_uptime_seconds = Gauge(
    'kamiyo_app_uptime_seconds',
    'Application uptime in seconds',
    registry=registry
)

# Last deployment
last_deployment_timestamp = Gauge(
    'kamiyo_last_deployment_timestamp',
    'Timestamp of last deployment',
    registry=registry
)


# ==========================================
# DECORATOR FOR API TRACKING
# ==========================================

def track_api_request(endpoint: str):
    """Decorator to track API requests"""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Track in-progress requests
            api_requests_in_progress.labels(endpoint=endpoint).inc()

            start_time = time.time()
            status = 200

            try:
                result = await func(*args, **kwargs)
                return result

            except Exception as e:
                status = getattr(e, 'status_code', 500)
                raise

            finally:
                # Track duration
                duration = time.time() - start_time
                api_request_duration_seconds.labels(
                    method='GET',  # Can be extracted from request
                    endpoint=endpoint
                ).observe(duration)

                # Track total requests
                api_requests_total.labels(
                    method='GET',
                    endpoint=endpoint,
                    status=status
                ).inc()

                # Decrement in-progress
                api_requests_in_progress.labels(endpoint=endpoint).dec()

        return wrapper
    return decorator


def track_db_query(query_type: str):
    """Decorator to track database queries"""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()

            try:
                result = func(*args, **kwargs)
                return result

            finally:
                duration = time.time() - start_time
                db_query_duration_seconds.labels(
                    query_type=query_type
                ).observe(duration)

        return wrapper
    return decorator


def track_aggregator_fetch(source: str):
    """Decorator to track aggregator fetches"""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            status = 'success'
            exploits_count = 0

            try:
                result = func(*args, **kwargs)
                exploits_count = len(result) if result else 0
                return result

            except Exception as e:
                status = 'error'
                logger.error(f"Aggregator {source} failed: {e}")
                raise

            finally:
                duration = time.time() - start_time

                # Track fetch duration
                aggregator_fetch_duration_seconds.labels(
                    source=source
                ).observe(duration)

                # Track fetch count
                aggregator_fetches_total.labels(
                    source=source,
                    status=status
                ).inc()

                # Track exploits discovered
                if exploits_count > 0:
                    aggregator_exploits_discovered.labels(
                        source=source
                    ).inc(exploits_count)

        return wrapper
    return decorator


# ==========================================
# METRICS UPDATER FUNCTIONS
# ==========================================

def update_database_metrics(db):
    """Update database metrics"""

    try:
        # Total exploits
        total = db.get_total_exploits()
        db_exploits_total.set(total)

        # Connection pool stats (if available)
        # db_connections_active.set(db.pool._used)
        # db_connections_idle.set(db.pool._free)

    except Exception as e:
        logger.error(f"Failed to update database metrics: {e}")


def update_user_metrics(db):
    """Update user metrics"""

    try:
        # Query users by tier
        cursor = db.connection.cursor()
        cursor.execute("""
            SELECT tier, COUNT(*) as count
            FROM users
            WHERE is_active = true
            GROUP BY tier
        """)

        for row in cursor.fetchall():
            users_active_total.labels(tier=row['tier']).set(row['count'])

        cursor.close()

    except Exception as e:
        logger.error(f"Failed to update user metrics: {e}")


def update_source_health_metrics(db):
    """Update source health metrics"""

    try:
        sources = db.get_source_health()

        for source in sources:
            aggregator_source_health.labels(
                source=source['name']
            ).set(source['success_rate'])

    except Exception as e:
        logger.error(f"Failed to update source health metrics: {e}")


def set_app_info(version: str, environment: str, commit: str = None):
    """Set application information"""

    app_info.info({
        'version': version,
        'environment': environment,
        'commit': commit or 'unknown'
    })


def update_uptime(start_time: float):
    """Update application uptime"""

    uptime = time.time() - start_time
    app_uptime_seconds.set(uptime)


# ==========================================
# METRICS ENDPOINT
# ==========================================

def get_metrics():
    """Get Prometheus metrics in text format"""

    return generate_latest(registry)


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Kamiyo Prometheus Metrics Test ===\n")

    # Simulate some metrics
    print("1. Simulating API requests...")
    api_requests_total.labels(method='GET', endpoint='/exploits', status=200).inc(100)
    api_requests_total.labels(method='GET', endpoint='/health', status=200).inc(500)
    api_requests_total.labels(method='POST', endpoint='/community/submit', status=201).inc(10)

    print("2. Simulating database queries...")
    db_query_duration_seconds.labels(query_type='select').observe(0.05)
    db_query_duration_seconds.labels(query_type='insert').observe(0.02)
    db_exploits_total.set(415)

    print("3. Simulating aggregator fetches...")
    aggregator_fetches_total.labels(source='defillama', status='success').inc(50)
    aggregator_fetch_duration_seconds.labels(source='defillama').observe(3.5)
    aggregator_exploits_discovered.labels(source='defillama').inc(416)

    print("4. Simulating user activity...")
    users_active_total.labels(tier='free').set(100)
    users_active_total.labels(tier='pro').set(20)
    subscriptions_total.labels(tier='pro', event='created').inc(5)

    print("5. Setting app info...")
    set_app_info(version='2.0', environment='production', commit='abc123')

    print("\n=== Generated Metrics ===\n")
    print(get_metrics().decode('utf-8'))

    print("\n✅ Metrics system ready for Prometheus scraping")
