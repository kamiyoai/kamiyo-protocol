"""
Health check and metrics endpoints for ERC-8004
"""

from fastapi import APIRouter, Response
from prometheus_client import generate_latest
from .rate_limiter import get_redis_client
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Comprehensive health check

    Verifies database and Redis connectivity.
    Returns 200 if healthy, 503 if any critical component fails.
    """
    from config.database_pool import get_db

    checks = {}
    overall_healthy = True

    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            await conn.execute("SELECT 1")
        checks['database'] = 'connected'
    except Exception as e:
        checks['database'] = 'disconnected'
        overall_healthy = False
        logger.error(f"Database health check failed: {e}")

    try:
        redis_client = await get_redis_client()
        await redis_client.ping()
        checks['redis'] = 'connected'
    except Exception as e:
        checks['redis'] = 'disconnected'
        overall_healthy = False
        logger.error(f"Redis health check failed: {e}")

    status_code = 200 if overall_healthy else 503

    return {
        'status': 'healthy' if overall_healthy else 'unhealthy',
        'checks': {
            'database': checks.get('database', 'unknown'),
            'redis': checks.get('redis', 'unknown')
        },
        'timestamp': datetime.now().isoformat()
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
