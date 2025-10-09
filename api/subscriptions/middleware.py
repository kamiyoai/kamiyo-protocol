# -*- coding: utf-8 -*-
"""
Subscription Enforcement Middleware for Kamiyo
FastAPI middleware to enforce tier limits and track usage
"""

import logging
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_429_TOO_MANY_REQUESTS, HTTP_403_FORBIDDEN

from .manager import get_subscription_manager
from .usage_tracker import get_usage_tracker
from monitoring.prometheus_metrics import api_requests_total, api_key_requests

logger = logging.getLogger(__name__)


class SubscriptionEnforcementMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce subscription tier limits

    Features:
    - Rate limiting based on tier
    - Feature access control
    - Usage tracking
    - Prometheus metrics integration
    - Graceful degradation on errors
    """

    def __init__(self, app, excluded_paths: list = None):
        """
        Initialize middleware

        Args:
            app: FastAPI application
            excluded_paths: List of paths to exclude from enforcement
        """
        super().__init__(app)
        self.manager = get_subscription_manager()
        self.usage_tracker = get_usage_tracker()

        # Paths that don't require subscription enforcement
        self.excluded_paths = excluded_paths or [
            '/health',
            '/metrics',
            '/docs',
            '/redoc',
            '/openapi.json',
            '/',
            '/api/v1/subscriptions/tiers'  # Allow viewing tier info without auth
        ]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request and enforce subscription limits

        Args:
            request: FastAPI request
            call_next: Next middleware in chain

        Returns:
            Response or error response
        """
        # Skip enforcement for excluded paths
        if self._should_skip_enforcement(request):
            return await call_next(request)

        # Extract user identifier
        user_id = await self._get_user_id(request)

        if not user_id:
            # No authentication - allow but with free tier limits
            user_id = request.client.host  # Use IP as identifier
            logger.debug(f"Unauthenticated request from {user_id}")

        # Get user's tier
        try:
            tier = await self.manager.get_user_tier(user_id)
            request.state.tier = tier
            request.state.user_id = user_id
        except Exception as e:
            logger.error(f"Failed to get user tier: {e}")
            # On error, default to free tier
            from .tiers import TierName
            tier = TierName.FREE
            request.state.tier = tier
            request.state.user_id = user_id

        # Check rate limits
        rate_limit_result = self.usage_tracker.check_rate_limit(user_id, tier)

        if not rate_limit_result.get('allowed', True):
            # Rate limit exceeded
            logger.warning(f"Rate limit exceeded for user {user_id} (tier: {tier.value})")

            # Track metrics
            try:
                api_requests_total.labels(
                    method=request.method,
                    endpoint=request.url.path,
                    status=429
                ).inc()
            except Exception as e:
                logger.warning(f"Failed to track metrics: {e}")

            return JSONResponse(
                status_code=HTTP_429_TOO_MANY_REQUESTS,
                content={
                    'error': 'Rate limit exceeded',
                    'message': f'You have exceeded your {tier.value} tier limit',
                    'tier': tier.value,
                    'limit_day': rate_limit_result.get('limit_day', 0),
                    'remaining_day': rate_limit_result.get('remaining_day', 0),
                    'reset_day': rate_limit_result.get('reset_day', 0),
                    'upgrade_url': '/api/v1/subscriptions/upgrade'
                },
                headers={
                    'X-RateLimit-Limit': str(rate_limit_result.get('limit_day', 0)),
                    'X-RateLimit-Remaining': str(rate_limit_result.get('remaining_day', 0)),
                    'X-RateLimit-Reset': str(rate_limit_result.get('reset_day', 0)),
                    'Retry-After': str(rate_limit_result.get('reset_day', 0))
                }
            )

        # Track the API call
        try:
            endpoint = request.url.path
            self.usage_tracker.track_api_call(user_id, endpoint)
        except Exception as e:
            logger.warning(f"Failed to track API call: {e}")

        # Track metrics
        try:
            api_key_requests.labels(tier=tier.value).inc()
        except Exception as e:
            logger.warning(f"Failed to track metrics: {e}")

        # Process request
        response = await call_next(request)

        # Add rate limit headers to response
        response.headers['X-RateLimit-Limit'] = str(rate_limit_result.get('limit_day', 0))
        response.headers['X-RateLimit-Remaining'] = str(rate_limit_result.get('remaining_day', 0))
        response.headers['X-RateLimit-Reset'] = str(rate_limit_result.get('reset_day', 0))
        response.headers['X-Subscription-Tier'] = tier.value

        return response

    def _should_skip_enforcement(self, request: Request) -> bool:
        """
        Check if enforcement should be skipped for this request

        Args:
            request: FastAPI request

        Returns:
            True if should skip enforcement
        """
        path = request.url.path

        # Check exact matches
        if path in self.excluded_paths:
            return True

        # Check path prefixes
        for excluded in self.excluded_paths:
            if path.startswith(excluded):
                return True

        return False

    async def _get_user_id(self, request: Request) -> str:
        """
        Extract user ID from request

        Checks:
        1. X-API-Key header
        2. Authorization header (Bearer token)
        3. User object in request state
        4. Falls back to IP address

        Args:
            request: FastAPI request

        Returns:
            User identifier
        """
        # Check for API key in header
        api_key = request.headers.get('X-API-Key')
        if api_key:
            # In production, validate API key and get user ID
            # For now, use API key as identifier
            return api_key

        # Check for JWT token
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            # In production, decode JWT and extract user ID
            # For now, use token as identifier
            token = auth_header.replace('Bearer ', '')
            return token

        # Check request state
        if hasattr(request.state, 'user'):
            return request.state.user.get('user_id') or request.state.user.get('id')

        # Fallback to IP address
        return request.client.host


async def subscription_enforcement_middleware(request: Request, call_next: Callable) -> Response:
    """
    Standalone middleware function for subscription enforcement

    Usage:
        app.add_middleware(SubscriptionEnforcementMiddleware)

    Or:
        @app.middleware("http")
        async def enforce_subscriptions(request: Request, call_next):
            return await subscription_enforcement_middleware(request, call_next)
    """
    middleware = SubscriptionEnforcementMiddleware(None)
    return await middleware.dispatch(request, call_next)


def require_tier(required_tier: str):
    """
    Decorator to require specific subscription tier

    Usage:
        @require_tier("pro")
        async def advanced_endpoint():
            pass

    Args:
        required_tier: Required tier name (free/basic/pro/enterprise)
    """
    from functools import wraps
    from fastapi import HTTPException

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request from args
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break

            if not request:
                raise HTTPException(
                    status_code=500,
                    detail="Request object not found"
                )

            # Check tier
            if not hasattr(request.state, 'tier'):
                raise HTTPException(
                    status_code=HTTP_403_FORBIDDEN,
                    detail="Subscription tier not found"
                )

            from .tiers import TierName, compare_tiers

            user_tier = request.state.tier
            required_tier_enum = TierName(required_tier)

            # Check if user's tier is sufficient
            if compare_tiers(user_tier, required_tier_enum) < 0:
                raise HTTPException(
                    status_code=HTTP_403_FORBIDDEN,
                    detail={
                        'error': 'Insufficient subscription tier',
                        'required': required_tier,
                        'current': user_tier.value,
                        'upgrade_url': '/api/v1/subscriptions/upgrade'
                    }
                )

            return await func(*args, **kwargs)

        return wrapper
    return decorator


def require_feature(feature: str):
    """
    Decorator to require specific feature access

    Usage:
        @require_feature("webhook_alerts")
        async def webhook_endpoint():
            pass

    Args:
        feature: Feature name
    """
    from functools import wraps
    from fastapi import HTTPException

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request from args
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break

            if not request:
                raise HTTPException(
                    status_code=500,
                    detail="Request object not found"
                )

            # Check feature access
            if not hasattr(request.state, 'user_id'):
                raise HTTPException(
                    status_code=HTTP_403_FORBIDDEN,
                    detail="User not authenticated"
                )

            manager = get_subscription_manager()
            has_access = await manager.check_feature_access(request.state.user_id, feature)

            if not has_access:
                raise HTTPException(
                    status_code=HTTP_403_FORBIDDEN,
                    detail={
                        'error': 'Feature not available',
                        'feature': feature,
                        'tier': request.state.tier.value,
                        'upgrade_url': '/api/v1/subscriptions/upgrade'
                    }
                )

            return await func(*args, **kwargs)

        return wrapper
    return decorator


# Test function
if __name__ == '__main__':
    import asyncio
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Subscription Enforcement Middleware Test ===\n")

    # Create a mock request
    class MockClient:
        host = "127.0.0.1"

    class MockURL:
        path = "/exploits"

    class MockState:
        pass

    class MockRequest:
        def __init__(self):
            self.client = MockClient()
            self.url = MockURL()
            self.headers = {}
            self.method = "GET"
            self.state = MockState()

    async def test():
        print("1. Testing middleware initialization...")
        middleware = SubscriptionEnforcementMiddleware(None)
        print("   ✓ Middleware initialized")

        print("\n2. Testing should_skip_enforcement...")
        mock_request = MockRequest()
        mock_request.url.path = "/health"
        skip = middleware._should_skip_enforcement(mock_request)
        print(f"   /health should skip: {skip}")

        mock_request.url.path = "/exploits"
        skip = middleware._should_skip_enforcement(mock_request)
        print(f"   /exploits should skip: {skip}")

        print("\n3. Testing _get_user_id...")
        mock_request.headers = {'X-API-Key': 'test_key_123'}
        user_id = await middleware._get_user_id(mock_request)
        print(f"   User ID from API key: {user_id}")

        print("\n✅ Middleware ready")

    asyncio.run(test())
