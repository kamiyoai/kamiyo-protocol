# -*- coding: utf-8 -*-
"""
Kamiyo API Compression Middleware
Implements gzip and brotli compression for API responses

Performance targets:
- Gzip (level 6): 3:1 compression ratio, ~10ms overhead
- Brotli (level 4): 4:1 compression ratio, ~15ms overhead
- Only compress responses >= 1KB
- Only compress text/json content types
"""

import gzip
import time
import logging
from typing import Optional, Set, Callable
from io import BytesIO

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp

try:
    import brotli
    BROTLI_AVAILABLE = True
except ImportError:
    BROTLI_AVAILABLE = False
    logging.warning("Brotli not available. Install with: pip install brotli")

from monitoring.response_metrics import (
    track_compression_ratio,
    track_compression_time,
    track_response_size
)

logger = logging.getLogger(__name__)


class CompressionConfig:
    """Configuration for compression middleware"""

    # Compression levels (higher = better compression but slower)
    GZIP_LEVEL: int = 6  # Default: 6 (balanced)
    BROTLI_LEVEL: int = 4  # Default: 4 (balanced)

    # Minimum size to compress (don't compress small responses)
    MIN_SIZE_BYTES: int = 1024  # 1KB

    # Compressible content types
    COMPRESSIBLE_TYPES: Set[str] = {
        'application/json',
        'application/javascript',
        'application/xml',
        'text/html',
        'text/css',
        'text/plain',
        'text/csv',
        'text/javascript',
        'image/svg+xml',
    }

    # Paths to exclude from compression
    EXCLUDE_PATHS: Set[str] = {
        '/health',  # Health checks should be fast
        '/metrics',  # Prometheus metrics
    }

    # Enable compression by default
    ENABLED: bool = True


class GzipCompressor:
    """Gzip compression implementation"""

    def __init__(self, level: int = CompressionConfig.GZIP_LEVEL):
        """
        Initialize gzip compressor

        Args:
            level: Compression level (0-9), default 6
        """
        self.level = level

    def compress(self, data: bytes) -> bytes:
        """
        Compress data using gzip

        Args:
            data: Raw bytes to compress

        Returns:
            Compressed bytes
        """
        start_time = time.time()

        # Create gzip buffer
        buf = BytesIO()

        with gzip.GzipFile(
            fileobj=buf,
            mode='wb',
            compresslevel=self.level
        ) as f:
            f.write(data)

        compressed = buf.getvalue()

        # Track metrics
        compression_time = (time.time() - start_time) * 1000  # ms
        track_compression_time('gzip', compression_time)

        return compressed

    @property
    def encoding(self) -> str:
        """Get encoding name"""
        return 'gzip'


class BrotliCompressor:
    """Brotli compression implementation"""

    def __init__(self, level: int = CompressionConfig.BROTLI_LEVEL):
        """
        Initialize brotli compressor

        Args:
            level: Compression level (0-11), default 4
        """
        if not BROTLI_AVAILABLE:
            raise RuntimeError("Brotli not available")

        self.level = level

    def compress(self, data: bytes) -> bytes:
        """
        Compress data using brotli

        Args:
            data: Raw bytes to compress

        Returns:
            Compressed bytes
        """
        start_time = time.time()

        # Compress with brotli
        compressed = brotli.compress(
            data,
            quality=self.level,
            mode=brotli.MODE_TEXT  # Optimize for text
        )

        # Track metrics
        compression_time = (time.time() - start_time) * 1000  # ms
        track_compression_time('brotli', compression_time)

        return compressed

    @property
    def encoding(self) -> str:
        """Get encoding name"""
        return 'br'


class CompressionMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for automatic response compression

    Features:
    - Automatic compression based on Accept-Encoding header
    - Supports gzip and brotli (brotli preferred for better compression)
    - Configurable compression levels
    - Size threshold (don't compress small responses)
    - Content-type filtering
    - Path exclusion
    - Compression metrics tracking
    """

    def __init__(
        self,
        app: ASGIApp,
        minimum_size: int = CompressionConfig.MIN_SIZE_BYTES,
        gzip_level: int = CompressionConfig.GZIP_LEVEL,
        brotli_level: int = CompressionConfig.BROTLI_LEVEL,
        compressible_types: Optional[Set[str]] = None,
        exclude_paths: Optional[Set[str]] = None,
    ):
        """
        Initialize compression middleware

        Args:
            app: ASGI application
            minimum_size: Minimum response size to compress (bytes)
            gzip_level: Gzip compression level (0-9)
            brotli_level: Brotli compression level (0-11)
            compressible_types: Set of compressible content types
            exclude_paths: Set of paths to exclude from compression
        """
        super().__init__(app)

        self.minimum_size = minimum_size
        self.compressible_types = compressible_types or CompressionConfig.COMPRESSIBLE_TYPES
        self.exclude_paths = exclude_paths or CompressionConfig.EXCLUDE_PATHS

        # Initialize compressors
        self.gzip = GzipCompressor(level=gzip_level)
        self.brotli = BrotliCompressor(level=brotli_level) if BROTLI_AVAILABLE else None

        logger.info(
            f"Compression middleware initialized: "
            f"min_size={minimum_size}B, "
            f"gzip_level={gzip_level}, "
            f"brotli_level={brotli_level}, "
            f"brotli_available={BROTLI_AVAILABLE}"
        )

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request and compress response if applicable

        Args:
            request: FastAPI request
            call_next: Next middleware in chain

        Returns:
            Response (compressed if applicable)
        """
        # Check if path should be excluded
        if request.url.path in self.exclude_paths:
            return await call_next(request)

        # Get accepted encodings from request
        accept_encoding = request.headers.get('accept-encoding', '').lower()

        # Process request
        response = await call_next(request)

        # Check if response should be compressed
        if not self._should_compress(response):
            return response

        # Get response body
        body = b''
        async for chunk in response.body_iterator:
            body += chunk

        # Track original size
        original_size = len(body)
        track_response_size('original', original_size)

        # Check size threshold
        if original_size < self.minimum_size:
            # Too small to compress
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )

        # Select compressor based on accept-encoding
        compressor = self._select_compressor(accept_encoding)

        if not compressor:
            # No suitable compressor
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )

        # Compress body
        try:
            compressed_body = compressor.compress(body)
            compressed_size = len(compressed_body)

            # Track compressed size and ratio
            track_response_size('compressed', compressed_size)
            compression_ratio = original_size / compressed_size if compressed_size > 0 else 1.0
            track_compression_ratio(compressor.encoding, compression_ratio)

            logger.debug(
                f"Compressed {request.url.path}: "
                f"{original_size}B -> {compressed_size}B "
                f"({compression_ratio:.2f}x) using {compressor.encoding}"
            )

            # Update headers
            headers = MutableHeaders(response.headers)
            headers['content-encoding'] = compressor.encoding
            headers['content-length'] = str(compressed_size)
            headers['vary'] = 'Accept-Encoding'

            # Remove any existing content-length from original response
            if 'content-length' in headers:
                del headers['content-length']
            headers['content-length'] = str(compressed_size)

            return Response(
                content=compressed_body,
                status_code=response.status_code,
                headers=dict(headers),
                media_type=response.media_type
            )

        except Exception as e:
            logger.error(f"Compression failed: {e}")
            # Return uncompressed on error
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )

    def _should_compress(self, response: Response) -> bool:
        """
        Check if response should be compressed

        Args:
            response: FastAPI response

        Returns:
            True if response should be compressed
        """
        # Check status code (only compress successful responses)
        if response.status_code < 200 or response.status_code >= 300:
            return False

        # Check if already compressed
        if 'content-encoding' in response.headers:
            return False

        # Check content type
        content_type = response.media_type or ''

        # Extract base content type (ignore charset)
        base_type = content_type.split(';')[0].strip().lower()

        return base_type in self.compressible_types

    def _select_compressor(self, accept_encoding: str) -> Optional[object]:
        """
        Select best compressor based on Accept-Encoding header

        Args:
            accept_encoding: Accept-Encoding header value

        Returns:
            Compressor instance or None
        """
        # Prefer brotli for better compression
        if self.brotli and 'br' in accept_encoding:
            return self.brotli

        # Fall back to gzip
        if 'gzip' in accept_encoding:
            return self.gzip

        # No suitable compressor
        return None


class StreamingCompressionWrapper:
    """
    Wrapper for streaming compression

    Use this for streaming responses that need compression
    """

    def __init__(
        self,
        iterator,
        compressor: Optional[object] = None,
        chunk_size: int = 8192
    ):
        """
        Initialize streaming compression

        Args:
            iterator: Async iterator yielding chunks
            compressor: Compressor instance (GzipCompressor or BrotliCompressor)
            chunk_size: Size of chunks to compress
        """
        self.iterator = iterator
        self.compressor = compressor or GzipCompressor()
        self.chunk_size = chunk_size
        self.buffer = BytesIO()

    async def __aiter__(self):
        """Async iterator interface"""
        return self

    async def __anext__(self):
        """
        Get next compressed chunk

        Returns:
            Compressed chunk bytes
        """
        async for chunk in self.iterator:
            self.buffer.write(chunk)

            # Compress when buffer reaches chunk size
            if self.buffer.tell() >= self.chunk_size:
                data = self.buffer.getvalue()
                self.buffer = BytesIO()
                return self.compressor.compress(data)

        # Compress remaining data
        if self.buffer.tell() > 0:
            data = self.buffer.getvalue()
            self.buffer = BytesIO()
            return self.compressor.compress(data)

        raise StopAsyncIteration


# Convenience functions

def create_compression_middleware(
    app: ASGIApp,
    enabled: bool = True,
    **kwargs
) -> Optional[CompressionMiddleware]:
    """
    Create compression middleware with configuration

    Args:
        app: ASGI application
        enabled: Enable compression
        **kwargs: Additional configuration options

    Returns:
        CompressionMiddleware instance or None if disabled
    """
    if not enabled:
        return None

    return CompressionMiddleware(app, **kwargs)


def get_compression_stats() -> dict:
    """
    Get compression statistics

    Returns:
        Dictionary with compression stats
    """
    from monitoring.response_metrics import get_compression_stats as get_stats

    return get_stats()
