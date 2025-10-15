# -*- coding: utf-8 -*-
"""
Structured Logging for Social Media Posting
JSON-formatted logs with context for aggregation and analysis
"""

import sys
import logging
from contextlib import contextmanager
from typing import Optional, Dict, Any
import structlog
from structlog.stdlib import BoundLogger


# Configure structlog
def configure_logging(
    log_level: str = "INFO",
    log_file: Optional[str] = None,
    json_format: bool = True
):
    """
    Configure structured logging

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Optional log file path
        json_format: Whether to use JSON format (True) or console format (False)
    """
    # Set log level
    level = getattr(logging, log_level.upper(), logging.INFO)

    # Configure structlog processors
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    if json_format:
        # JSON output for production/aggregation
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Console output for development
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure standard library logging
    handlers = []

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    handlers.append(console_handler)

    # File handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(level)
        handlers.append(file_handler)

    # Configure root logger
    logging.basicConfig(
        format="%(message)s",
        level=level,
        handlers=handlers,
        force=True
    )


def get_logger(name: str, **context) -> BoundLogger:
    """
    Get a structured logger with optional context

    Args:
        name: Logger name (usually __name__)
        **context: Initial context to bind to logger

    Returns:
        Structured logger with bound context

    Example:
        logger = get_logger(__name__, service="social_poster", platform="reddit")
        logger.info("post_created", post_id="123", exploit_hash="0x...")
    """
    logger = structlog.get_logger(name)
    if context:
        logger = logger.bind(**context)
    return logger


@contextmanager
def log_context(**context):
    """
    Context manager to temporarily add context to logs

    Args:
        **context: Context key-value pairs

    Example:
        with log_context(request_id="abc123", user_id="user456"):
            logger.info("processing_request")
    """
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(**context)
    try:
        yield
    finally:
        structlog.contextvars.clear_contextvars()


class SocialMediaLogger:
    """
    Specialized logger for social media posting with pre-configured fields
    """

    def __init__(self, name: str):
        self.logger = get_logger(name)

    def log_post_attempt(
        self,
        platform: str,
        exploit_tx_hash: str,
        post_id: Optional[str] = None,
        **extra
    ):
        """Log a post attempt"""
        self.logger.info(
            "post_attempt",
            platform=platform,
            exploit_tx_hash=exploit_tx_hash,
            post_id=post_id,
            **extra
        )

    def log_post_success(
        self,
        platform: str,
        exploit_tx_hash: str,
        post_id: str,
        post_url: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        **extra
    ):
        """Log a successful post"""
        self.logger.info(
            "post_success",
            platform=platform,
            exploit_tx_hash=exploit_tx_hash,
            post_id=post_id,
            post_url=post_url,
            duration_seconds=duration_seconds,
            **extra
        )

    def log_post_failure(
        self,
        platform: str,
        exploit_tx_hash: str,
        error: str,
        error_type: Optional[str] = None,
        retry_count: int = 0,
        **extra
    ):
        """Log a failed post"""
        self.logger.error(
            "post_failure",
            platform=platform,
            exploit_tx_hash=exploit_tx_hash,
            error=error,
            error_type=error_type,
            retry_count=retry_count,
            **extra
        )

    def log_authentication(
        self,
        platform: str,
        success: bool,
        error: Optional[str] = None,
        **extra
    ):
        """Log authentication attempt"""
        if success:
            self.logger.info(
                "authentication_success",
                platform=platform,
                **extra
            )
        else:
            self.logger.error(
                "authentication_failure",
                platform=platform,
                error=error,
                **extra
            )

    def log_rate_limit(
        self,
        platform: str,
        remaining: int,
        reset_time: Optional[str] = None,
        **extra
    ):
        """Log rate limit status"""
        level = "warning" if remaining < 5 else "info"
        getattr(self.logger, level)(
            "rate_limit_status",
            platform=platform,
            remaining=remaining,
            reset_time=reset_time,
            **extra
        )

    def log_api_error(
        self,
        platform: str,
        endpoint: str,
        error: str,
        status_code: Optional[int] = None,
        **extra
    ):
        """Log API error"""
        self.logger.error(
            "api_error",
            platform=platform,
            endpoint=endpoint,
            error=error,
            status_code=status_code,
            **extra
        )

    def log_validation_error(
        self,
        platform: str,
        exploit_tx_hash: str,
        validation_error: str,
        content_length: Optional[int] = None,
        **extra
    ):
        """Log content validation error"""
        self.logger.warning(
            "validation_error",
            platform=platform,
            exploit_tx_hash=exploit_tx_hash,
            validation_error=validation_error,
            content_length=content_length,
            **extra
        )

    def log_exploit_received(
        self,
        exploit_tx_hash: str,
        protocol: str,
        chain: str,
        loss_amount_usd: float,
        exploit_type: str,
        **extra
    ):
        """Log receipt of new exploit"""
        self.logger.info(
            "exploit_received",
            exploit_tx_hash=exploit_tx_hash,
            protocol=protocol,
            chain=chain,
            loss_amount_usd=loss_amount_usd,
            exploit_type=exploit_type,
            **extra
        )

    def log_post_generation(
        self,
        exploit_tx_hash: str,
        platforms: list,
        duration_seconds: Optional[float] = None,
        **extra
    ):
        """Log post content generation"""
        self.logger.info(
            "post_generation",
            exploit_tx_hash=exploit_tx_hash,
            platforms=platforms,
            duration_seconds=duration_seconds,
            **extra
        )

    def log_retry_attempt(
        self,
        platform: str,
        exploit_tx_hash: str,
        attempt: int,
        max_attempts: int,
        error: Optional[str] = None,
        **extra
    ):
        """Log retry attempt"""
        self.logger.warning(
            "retry_attempt",
            platform=platform,
            exploit_tx_hash=exploit_tx_hash,
            attempt=attempt,
            max_attempts=max_attempts,
            error=error,
            **extra
        )

    def log_health_check(
        self,
        check_name: str,
        status: str,
        duration_seconds: Optional[float] = None,
        error: Optional[str] = None,
        **extra
    ):
        """Log health check result"""
        level = "info" if status == "healthy" else "error"
        getattr(self.logger, level)(
            "health_check",
            check_name=check_name,
            status=status,
            duration_seconds=duration_seconds,
            error=error,
            **extra
        )


# Pre-configured logger instance
social_logger = SocialMediaLogger("social_media")


# Example usage patterns
if __name__ == "__main__":
    # Configure logging
    configure_logging(log_level="INFO", json_format=True)

    # Get a logger
    logger = get_logger(__name__, service="social_poster")

    # Log with context
    logger.info("service_started", version="1.0.0")

    # Use context manager
    with log_context(request_id="req_123", user_id="user_456"):
        logger.info("processing_request", action="create_post")
        logger.error("request_failed", error="Rate limit exceeded")

    # Use specialized logger
    social_logger.log_exploit_received(
        exploit_tx_hash="0x123abc",
        protocol="Uniswap",
        chain="Ethereum",
        loss_amount_usd=1000000.0,
        exploit_type="Flash Loan"
    )

    social_logger.log_post_success(
        platform="reddit",
        exploit_tx_hash="0x123abc",
        post_id="post_789",
        post_url="https://reddit.com/r/defi/post_789",
        duration_seconds=2.5
    )

    social_logger.log_post_failure(
        platform="twitter",
        exploit_tx_hash="0x123abc",
        error="Rate limit exceeded",
        error_type="rate_limit",
        retry_count=3
    )
