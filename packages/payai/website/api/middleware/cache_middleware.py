# -*- coding: utf-8 -*-
"""
Cache Middleware for FastAPI
Automatic response caching with ETags and Cache-Control
"""

import hashlib
import json
import logging
from typing import Callable, List, Optional, Set
from datetime import datetime

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from caching.cache_manager import CacheManager, get_cache_manager
from monitoring.cache_metrics import get_metrics_collector

logger = logging.getLogger(__name__)


class CacheMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for automatic response caching

    Features:
    - Cache GET requests by default
    - ETag support for client-side caching
    - Cache-Control headers
    - Vary header support
    - Configurable TTL per endpoint
    - Skip cache for authenticated requests (optional)
    """

    def __init__(
        self,
        app,
        cache_manager: Optional[CacheManager] = None,
        default_ttl: int = 300,
        cache_methods: List[str] = None,
        skip_patterns: List[str] = None,
        skip_authenticated: bool = True,
        add_cache_headers: bool = True,
        enable_etags: bool = True,
    ):
        """
        Initialize cache middleware

        Args:
            app: FastAPI application
            cache_manager: Cache manager instance
            default_ttl: Default TTL in seconds
            cache_methods: HTTP methods to cache
            skip_patterns: URL patterns to skip caching
            skip_authenticated: Skip caching for authenticated requests
            add_cache_headers: Add Cache-Control headers
            enable_etags: Enable ETag support
        """
        super().__init__(app)
        self.cache = cache_manager or get_cache_manager()
        self.metrics = get_metrics_collector()
        self.default_ttl = default_ttl
        self.cache_methods = cache_methods or ['GET']
        self.skip_patterns = skip_patterns or ['/docs', '/redoc', '/openapi.json', '/health']
        self.skip_authenticated = skip_authenticated
        self.add_cache_headers = add_cache_headers
        self.enable_etags = enable_etags

        # Endpoint-specific TTL configuration
        self.endpoint_ttls = {
            '/exploits': 300,  # 5 minutes
            '/stats': 3600,  # 1 hour
            '/chains': 3600,  # 1 hour
            '/health': 120,  # 2 minutes
            '/sources/rankings': 1800,  # 30 minutes
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request with caching

        Args:
            request: HTTP request
            call_next: Next middleware/handler

        Returns:
            HTTP response
        """
        # Check if caching should be applied
        if not self._should_cache(request):
            return await call_next(request)

        # Generate cache key
        cache_key = self._generate_cache_key(request)
        ttl = self._get_ttl(request.url.path)

        # Try to get from cache
        cached_response = await self.cache.get(cache_key)

        if cached_response:
            logger.debug(f"Cache HIT: {cache_key}")
            self.metrics.record_hit(cache_level='redis', key_pattern=self._get_pattern(request))

            # Check ETag if enabled
            if self.enable_etags:
                etag = self._generate_etag(cached_response)
                if_none_match = request.headers.get('if-none-match')

                if if_none_match and if_none_match == etag:
                    # Client has current version
                    return Response(status_code=304)  # Not Modified

            # Return cached response
            response = self._build_response(cached_response, cache_key, ttl, hit=True)
            return response

        # Cache miss - execute request
        logger.debug(f"Cache MISS: {cache_key}")
        self.metrics.record_miss(key_pattern=self._get_pattern(request))

        response = await call_next(request)

        # Cache successful responses
        if response.status_code == 200 and self._is_cacheable_response(response):
            await self._cache_response(cache_key, response, ttl)

        # Add cache headers
        if self.add_cache_headers:
            self._add_cache_headers(response, ttl)

        return response

    def _should_cache(self, request: Request) -> bool:
        """
        Determine if request should be cached

        Args:
            request: HTTP request

        Returns:
            True if should cache
        """
        # Check HTTP method
        if request.method not in self.cache_methods:
            return False

        # Check skip patterns
        for pattern in self.skip_patterns:
            if request.url.path.startswith(pattern):
                return False

        # Check authentication
        if self.skip_authenticated:
            auth_header = request.headers.get('authorization')
            if auth_header:
                return False

        # Check cache-control header
        cache_control = request.headers.get('cache-control', '')
        if 'no-cache' in cache_control or 'no-store' in cache_control:
            return False

        return True

    def _generate_cache_key(self, request: Request) -> str:
        """
        Generate cache key for request

        Args:
            request: HTTP request

        Returns:
            Cache key
        """
        # Include method, path, and query parameters
        key_parts = [
            request.method,
            request.url.path,
        ]

        # Include query parameters (sorted for consistency)
        if request.url.query:
            key_parts.append(request.url.query)

        # Include vary headers if specified
        vary_headers = ['accept-encoding', 'accept-language']
        for header in vary_headers:
            value = request.headers.get(header)
            if value:
                key_parts.append(f"{header}:{value}")

        # Create hash
        key_string = '|'.join(key_parts)
        key_hash = hashlib.md5(key_string.encode()).hexdigest()

        return f"response:{request.url.path}:{key_hash}"

    def _get_ttl(self, path: str) -> int:
        """
        Get TTL for endpoint

        Args:
            path: URL path

        Returns:
            TTL in seconds
        """
        # Check exact match
        if path in self.endpoint_ttls:
            return self.endpoint_ttls[path]

        # Check prefix match
        for endpoint, ttl in self.endpoint_ttls.items():
            if path.startswith(endpoint):
                return ttl

        return self.default_ttl

    def _get_pattern(self, request: Request) -> str:
        """
        Get key pattern for metrics

        Args:
            request: HTTP request

        Returns:
            Key pattern
        """
        path = request.url.path
        # Remove IDs and specific values for pattern matching
        pattern = path.split('/')[1] if len(path.split('/')) > 1 else 'root'
        return pattern

    def _generate_etag(self, content: any) -> str:
        """
        Generate ETag for content

        Args:
            content: Response content

        Returns:
            ETag value
        """
        if isinstance(content, dict):
            content = json.dumps(content, sort_keys=True)
        elif not isinstance(content, (str, bytes)):
            content = str(content)

        if isinstance(content, str):
            content = content.encode()

        etag = hashlib.md5(content).hexdigest()
        return f'"{etag}"'

    def _is_cacheable_response(self, response: Response) -> bool:
        """
        Check if response is cacheable

        Args:
            response: HTTP response

        Returns:
            True if cacheable
        """
        # Check content type
        content_type = response.headers.get('content-type', '')
        if not content_type.startswith('application/json'):
            return False

        # Check cache-control
        cache_control = response.headers.get('cache-control', '')
        if 'no-cache' in cache_control or 'no-store' in cache_control or 'private' in cache_control:
            return False

        return True

    async def _cache_response(self, cache_key: str, response: Response, ttl: int):
        """
        Cache response

        Args:
            cache_key: Cache key
            response: HTTP response
            ttl: Time to live
        """
        try:
            # Extract response body
            body = b''
            async for chunk in response.body_iterator:
                body += chunk

            # Parse JSON
            content = json.loads(body.decode())

            # Store in cache
            await self.cache.set(cache_key, content, ttl=ttl)

            # Recreate response with body
            response.body_iterator = self._body_iterator(body)

        except Exception as e:
            logger.error(f"Failed to cache response: {e}")

    def _build_response(
        self,
        content: dict,
        cache_key: str,
        ttl: int,
        hit: bool = True
    ) -> JSONResponse:
        """
        Build JSON response from cached content

        Args:
            content: Response content
            cache_key: Cache key
            ttl: Time to live
            hit: Whether this is a cache hit

        Returns:
            JSON response
        """
        response = JSONResponse(content=content)

        # Add cache headers
        if self.add_cache_headers:
            self._add_cache_headers(response, ttl, hit=hit)

        # Add ETag
        if self.enable_etags:
            etag = self._generate_etag(content)
            response.headers['etag'] = etag

        # Add custom header to indicate cache hit
        response.headers['x-cache'] = 'HIT' if hit else 'MISS'

        return response

    def _add_cache_headers(self, response: Response, ttl: int, hit: bool = False):
        """
        Add cache-related headers to response

        Args:
            response: HTTP response
            ttl: Time to live
            hit: Whether this is a cache hit
        """
        # Cache-Control header
        response.headers['cache-control'] = f'public, max-age={ttl}'

        # Age header (for cache hits)
        if hit:
            response.headers['age'] = '0'  # Simplified - should track actual age

        # Expires header
        from datetime import datetime, timedelta
        expires = datetime.utcnow() + timedelta(seconds=ttl)
        response.headers['expires'] = expires.strftime('%a, %d %b %Y %H:%M:%S GMT')

        # Vary header
        response.headers['vary'] = 'Accept-Encoding, Accept-Language'

    async def _body_iterator(self, body: bytes):
        """Create body iterator for response"""
        yield body


class SelectiveCacheMiddleware(CacheMiddleware):
    """
    Cache middleware with selective caching based on rules

    Allows fine-grained control over what gets cached
    """

    def __init__(self, app, **kwargs):
        super().__init__(app, **kwargs)

        # Cache rules: path -> (should_cache, ttl)
        self.cache_rules: dict = {}

    def add_rule(self, path_pattern: str, cache: bool = True, ttl: Optional[int] = None):
        """
        Add cache rule for path pattern

        Args:
            path_pattern: URL path pattern (supports wildcards)
            cache: Whether to cache
            ttl: TTL override
        """
        self.cache_rules[path_pattern] = (cache, ttl)
        logger.info(f"Added cache rule: {path_pattern} -> cache={cache}, ttl={ttl}")

    def remove_rule(self, path_pattern: str):
        """
        Remove cache rule

        Args:
            path_pattern: URL path pattern
        """
        if path_pattern in self.cache_rules:
            del self.cache_rules[path_pattern]
            logger.info(f"Removed cache rule: {path_pattern}")

    def _should_cache(self, request: Request) -> bool:
        """
        Determine if request should be cached (with rules)

        Args:
            request: HTTP request

        Returns:
            True if should cache
        """
        # Check rules first
        for pattern, (should_cache, _) in self.cache_rules.items():
            if self._matches_pattern(request.url.path, pattern):
                return should_cache

        # Fall back to default logic
        return super()._should_cache(request)

    def _get_ttl(self, path: str) -> int:
        """
        Get TTL for endpoint (with rules)

        Args:
            path: URL path

        Returns:
            TTL in seconds
        """
        # Check rules first
        for pattern, (_, ttl) in self.cache_rules.items():
            if self._matches_pattern(path, pattern):
                if ttl is not None:
                    return ttl

        # Fall back to default logic
        return super()._get_ttl(path)

    def _matches_pattern(self, path: str, pattern: str) -> bool:
        """
        Check if path matches pattern

        Args:
            path: URL path
            pattern: Pattern (supports * wildcard)

        Returns:
            True if matches
        """
        import re

        # Convert wildcard pattern to regex
        regex_pattern = pattern.replace('*', '.*')
        return re.match(f'^{regex_pattern}$', path) is not None
