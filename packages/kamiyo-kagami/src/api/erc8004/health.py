"""
Health check and metrics endpoints for ERC-8004
"""

from fastapi import APIRouter, Response
from prometheus_client import generate_latest
from database import get_db
from .rate_limiter import redis_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Comprehensive health check

    Verifies database, Redis, and materialized view freshness.
    Returns 200 if healthy, 503 if any critical component fails.
    """
    checks = {}
    overall_healthy = True

    try:
        db = get_db()
        await db.execute("SELECT 1")
        checks['database'] = {'status': 'healthy'}
    except Exception as e:
        checks['database'] = {'status': 'unhealthy', 'error': str(e)}
        overall_healthy = False
        logger.error(f"Database health check failed: {e}")

    try:
        await redis_client.ping()
        checks['redis'] = {'status': 'healthy'}
    except Exception as e:
        checks['redis'] = {'status': 'unhealthy', 'error': str(e)}
        overall_healthy = False
        logger.error(f"Redis health check failed: {e}")

    try:
        db = get_db()
        result = await db.fetch_one("""
            SELECT EXTRACT(EPOCH FROM (NOW() - MAX(last_feedback_at)))::int as age_seconds
            FROM mv_erc8004_agent_reputation
        """)
        age_seconds = result[0] if result and result[0] else 0

        if age_seconds > 3600:
            checks['materialized_views'] = {
                'status': 'degraded',
                'age_seconds': age_seconds,
                'message': 'Views need refresh'
            }
        else:
            checks['materialized_views'] = {
                'status': 'healthy',
                'age_seconds': age_seconds
            }
    except Exception as e:
        checks['materialized_views'] = {'status': 'unknown', 'error': str(e)}
        logger.warning(f"Materialized view check failed: {e}")

    status_code = 200 if overall_healthy else 503

    return {
        'status': 'healthy' if overall_healthy else 'unhealthy',
        'checks': checks,
        'version': '1.0.0'
    }


@router.get("/metrics")
async def metrics():
    """
    Prometheus metrics endpoint

    Exposes all ERC-8004 metrics for Prometheus scraping.
    """
    return Response(
        content=generate_latest(),
        media_type="text/plain"
    )
