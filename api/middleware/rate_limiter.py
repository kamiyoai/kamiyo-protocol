# -*- coding: utf-8 -*-
"""
Rate Limiting Middleware
Protects API endpoints from abuse
"""

import time
import hashlib
import os
from typing import Dict, Optional
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    """In-memory rate limiter (use Redis for production multi-instance)"""

    def __init__(self):
        self.requests: Dict[str, list] = {}

    def is_allowed(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> bool:
        """
        Check if request is allowed within rate limit

        Args:
            key: Unique identifier (IP address, API key, user ID)
            max_requests: Maximum requests allowed
            window_seconds: Time window in seconds

        Returns:
            bool: True if allowed
        """
        now = time.time()
        window_start = now - window_seconds

        # Get requests for this key
        if key not in self.requests:
            self.requests[key] = []

        # Remove old requests outside window
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if req_time > window_start
        ]

        # Check if under limit
        if len(self.requests[key]) >= max_requests:
            return False

        # Add current request
        self.requests[key].append(now)
        return True

    def get_remaining(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> int:
        """Get remaining requests in current window"""
        now = time.time()
        window_start = now - window_seconds

        if key not in self.requests:
            return max_requests

        # Count requests in window
        recent = [
            req_time for req_time in self.requests[key]
            if req_time > window_start
        ]

        return max(0, max_requests - len(recent))

    def get_reset_time(
        self,
        key: str,
        window_seconds: int
    ) -> int:
        """Get time until rate limit resets (seconds)"""
        if key not in self.requests or not self.requests[key]:
            return 0

        oldest_request = min(self.requests[key])
        reset_time = oldest_request + window_seconds
        return max(0, int(reset_time - time.time()))


# Global rate limiter instance
_rate_limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for rate limiting"""

    # Default rate limits (requests per minute)
    RATE_LIMITS = {
        'free': 10,
        'basic': 100,
        'pro': 1000,
        'enterprise': 10000,
        'default': 60  # For unauthenticated requests
    }

    def __init__(self, app, limiter: Optional[RateLimiter] = None):
        super().__init__(app)
        self.limiter = limiter or _rate_limiter
        self.window_seconds = 60  # 1 minute window

    def get_client_identifier(self, request: Request) -> str:
        """
        Get unique identifier for client

        Priority:
        1. API key (if authenticated)
        2. User ID (if logged in)
        3. IP address (validated)
        """
        # Check for API key
        api_key = request.headers.get('X-API-Key') or request.headers.get('Authorization')
        if api_key:
            # Hash API key for privacy
            return hashlib.sha256(api_key.encode()).hexdigest()[:16]

        # Check for user in session (if implemented)
        # user = getattr(request.state, 'user', None)
        # if user:
        #     return f"user_{user.id}"

        # Get IP address with anti-spoofing protection
        # Only trust X-Forwarded-For if behind known proxy
        trusted_proxies = os.getenv('TRUSTED_PROXIES', '').split(',')
        client_ip = request.client.host if request.client else 'unknown'

        # Only use X-Forwarded-For if request comes from trusted proxy
        if trusted_proxies and client_ip in trusted_proxies:
            forwarded = request.headers.get('X-Forwarded-For')
            if forwarded:
                # Take the first IP (client's real IP)
                ip = forwarded.split(',')[0].strip()
                # Validate IP format
                if self._is_valid_ip(ip):
                    return ip

        return client_ip

    def _is_valid_ip(self, ip: str) -> bool:
        """Validate IP address format"""
        import ipaddress
        try:
            ipaddress.ip_address(ip)
            return True
        except ValueError:
            return False

    def get_user_tier(self, request: Request) -> str:
        """
        Get user tier from request

        Returns tier name (free, basic, pro, enterprise)
        """
        # Check for tier in headers (set by auth middleware)
        tier = request.headers.get('X-User-Tier')
        if tier and tier in self.RATE_LIMITS:
            return tier

        # Check if has API key (default to basic)
        api_key = request.headers.get('X-API-Key')
        if api_key:
            return 'basic'

        # Default to free tier
        return 'default'

    def is_excluded_path(self, path: str) -> bool:
        """Check if path should be excluded from rate limiting"""
        excluded = [
            '/health',
            '/docs',
            '/redoc',
            '/openapi.json',
            '/_health',
            '/metrics'
        ]
        return any(path.startswith(exc) for exc in excluded)

    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting"""

        # Skip rate limiting for excluded paths
        if self.is_excluded_path(request.url.path):
            return await call_next(request)

        # Get client identifier and tier
        client_id = self.get_client_identifier(request)
        tier = self.get_user_tier(request)
        max_requests = self.RATE_LIMITS.get(tier, self.RATE_LIMITS['default'])

        # Check rate limit
        if not self.limiter.is_allowed(client_id, max_requests, self.window_seconds):
            # Rate limit exceeded
            reset_time = self.limiter.get_reset_time(client_id, self.window_seconds)

            logger.warning(
                f"Rate limit exceeded for {client_id} "
                f"(tier: {tier}, limit: {max_requests}/min)"
            )

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    'error': 'Rate limit exceeded',
                    'limit': max_requests,
                    'window': f'{self.window_seconds}s',
                    'retry_after': reset_time
                },
                headers={
                    'X-RateLimit-Limit': str(max_requests),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': str(int(time.time()) + reset_time),
                    'Retry-After': str(reset_time)
                }
            )

        # Get remaining requests
        remaining = self.limiter.get_remaining(client_id, max_requests, self.window_seconds)

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        response.headers['X-RateLimit-Limit'] = str(max_requests)
        response.headers['X-RateLimit-Remaining'] = str(remaining - 1)
        response.headers['X-RateLimit-Reset'] = str(int(time.time()) + self.window_seconds)

        return response


def get_rate_limiter():
    """Get global rate limiter instance"""
    return _rate_limiter
