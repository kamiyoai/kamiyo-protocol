"""
Rate limiting for ERC-8004 API endpoints
Production-grade rate limiting with Redis backend
"""

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse
import redis.asyncio as redis
import os
import logging

logger = logging.getLogger(__name__)


async def init_redis_client():
    """
    Initialize Redis client with connection validation

    Raises:
        ConnectionError: If Redis is unavailable
    """
    try:
        client = redis.from_url(
            os.getenv('REDIS_URL', 'redis://localhost:6379'),
            encoding="utf-8",
            decode_responses=True
        )
        await client.ping()
        logger.info("Redis connection established")
        return client
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        raise ConnectionError(f"Failed to connect to Redis: {e}")


redis_client = None  # Will be initialized on startup


async def get_rate_limit_key(request: Request) -> str:
    """
    Generate rate limit key based on API key or IP address

    Authenticated users (with API keys) get higher limits and separate quotas.
    Anonymous users share IP-based limits.

    Health check and metrics endpoints bypass rate limiting.

    Returns:
        Rate limit key string (api_key:xxx or ip:xxx)
    """
    # Bypass rate limiting for health check and metrics endpoints
    if request.url.path in ['/health', '/metrics', '/api/v1/agents/health']:
        return "health_check:bypass"

    auth_header = request.headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        api_key = auth_header[7:]
        return f"api_key:{api_key}"

    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=get_rate_limit_key,
    storage_uri=os.getenv('REDIS_URL', 'redis://localhost:6379'),
    strategy="fixed-window",
    headers_enabled=True
)


class RateLimits:
    """
    Rate limit tiers for different operation types

    Agent operations are expensive and limited more strictly.
    Read operations are lighter and allow higher throughput.
    """
    REGISTER_AGENT = "10/hour"
    UPDATE_AGENT = "100/hour"
    SUBMIT_FEEDBACK = "100/hour"
    GET_AGENT = "1000/hour"
    SEARCH_AGENTS = "500/hour"
    LINK_PAYMENT = "200/hour"


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Custom error response for rate limit exceeded

    Returns structured error with retry information and current limits.
    """
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": f"Rate limit exceeded: {exc.detail}",
                "retry_after": exc.headers.get("Retry-After"),
                "limit": exc.headers.get("X-RateLimit-Limit"),
                "remaining": exc.headers.get("X-RateLimit-Remaining"),
                "reset": exc.headers.get("X-RateLimit-Reset")
            }
        },
        headers=exc.headers
    )
