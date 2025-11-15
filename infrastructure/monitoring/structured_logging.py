# -*- coding: utf-8 -*-
"""
Structured Logging Configuration for Kamiyo
JSON-formatted logs for easy parsing and analysis
"""

import os
import sys
import logging
from pythonjsonlogger import jsonlogger
from datetime import datetime
from typing import Optional


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter with additional fields"""

    def add_fields(self, log_record, record, message_dict):
        super(CustomJsonFormatter, self).add_fields(log_record, record, message_dict)

        # Add timestamp
        if not log_record.get('timestamp'):
            log_record['timestamp'] = datetime.utcnow().isoformat() + 'Z'

        # Add log level
        if log_record.get('level'):
            log_record['level'] = log_record['level'].upper()
        else:
            log_record['level'] = record.levelname

        # Add application name
        log_record['application'] = 'kamiyo'

        # Add environment
        log_record['environment'] = os.getenv('ENVIRONMENT', 'development')

        # Add service name if available
        if hasattr(record, 'service'):
            log_record['service'] = record.service


def setup_logging(
    level: str = None,
    format: str = 'json',
    log_file: Optional[str] = None
):
    """
    Setup application logging

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        format: Log format ('json' or 'text')
        log_file: Optional log file path
    """

    # Get log level from environment or argument
    log_level = level or os.getenv('LOG_LEVEL', 'INFO')
    log_level = getattr(logging, log_level.upper())

    # Get log format from environment or argument
    log_format = format or os.getenv('LOG_FORMAT', 'json')

    # Create handlers
    handlers = []

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)

    if log_format == 'json':
        # JSON formatter for production
        formatter = CustomJsonFormatter(
            '%(timestamp)s %(level)s %(name)s %(message)s',
            rename_fields={
                'levelname': 'level',
                'name': 'logger',
                'threadName': 'thread',
                'processName': 'process'
            }
        )
    else:
        # Text formatter for development
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )

    console_handler.setFormatter(formatter)
    handlers.append(console_handler)

    # File handler (optional)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        handlers.append(file_handler)

    # Configure root logger
    logging.basicConfig(
        level=log_level,
        handlers=handlers,
        force=True  # Override any existing configuration
    )

    # Silence noisy loggers
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('requests').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.access').setLevel(logging.WARNING)

    logging.info(f"Logging configured: level={logging.getLevelName(log_level)}, format={log_format}")


def get_logger(name: str, service: str = None) -> logging.Logger:
    """
    Get logger with optional service name

    Args:
        name: Logger name (usually __name__)
        service: Service name (api, aggregator, etc.)

    Returns:
        Configured logger
    """

    logger = logging.getLogger(name)

    # Add service name to all log records
    if service:
        old_factory = logging.getLogRecordFactory()

        def record_factory(*args, **kwargs):
            record = old_factory(*args, **kwargs)
            record.service = service
            return record

        logging.setLogRecordFactory(record_factory)

    return logger


# Context managers for structured logging
class LogContext:
    """Context manager for adding context to logs"""

    def __init__(self, logger: logging.Logger, **context):
        self.logger = logger
        self.context = context
        self.old_factory = None

    def __enter__(self):
        self.old_factory = logging.getLogRecordFactory()

        def record_factory(*args, **kwargs):
            record = self.old_factory(*args, **kwargs)
            for key, value in self.context.items():
                setattr(record, key, value)
            return record

        logging.setLogRecordFactory(record_factory)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        logging.setLogRecordFactory(self.old_factory)


# Helper functions for common log patterns
def log_api_request(logger: logging.Logger, method: str, path: str, status: int, duration: float):
    """Log API request with structured data"""

    logger.info(
        f"API request: {method} {path}",
        extra={
            'event_type': 'api_request',
            'method': method,
            'path': path,
            'status_code': status,
            'duration_ms': round(duration * 1000, 2)
        }
    )


def log_aggregator_fetch(logger: logging.Logger, source: str, count: int, duration: float, success: bool):
    """Log aggregator fetch with structured data"""

    level = logging.INFO if success else logging.ERROR

    logger.log(
        level,
        f"Aggregator fetch: {source}",
        extra={
            'event_type': 'aggregator_fetch',
            'source': source,
            'exploits_count': count,
            'duration_seconds': round(duration, 2),
            'success': success
        }
    )


def log_database_query(logger: logging.Logger, query_type: str, duration: float, rows_affected: int = None):
    """Log database query with structured data"""

    logger.debug(
        f"Database query: {query_type}",
        extra={
            'event_type': 'database_query',
            'query_type': query_type,
            'duration_ms': round(duration * 1000, 2),
            'rows_affected': rows_affected
        }
    )


def log_exploit_detected(logger: logging.Logger, protocol: str, chain: str, amount: float, source: str):
    """Log new exploit detection"""

    logger.info(
        f"New exploit detected: {protocol} on {chain}",
        extra={
            'event_type': 'exploit_detected',
            'protocol': protocol,
            'chain': chain,
            'amount_usd': amount,
            'source': source
        }
    )


def log_payment_event(logger: logging.Logger, user_id: str, amount: float, status: str, tier: str):
    """Log payment event"""

    logger.info(
        f"Payment {status}: {tier}",
        extra={
            'event_type': 'payment',
            'user_id': user_id,
            'amount_usd': amount,
            'status': status,
            'tier': tier
        }
    )


def log_error(logger: logging.Logger, error: Exception, context: dict = None):
    """Log error with context"""

    logger.error(
        f"Error: {type(error).__name__}: {str(error)}",
        exc_info=True,
        extra={
            'event_type': 'error',
            'error_type': type(error).__name__,
            'error_message': str(error),
            **(context or {})
        }
    )


# Test function
if __name__ == '__main__':
    print("\n=== Structured Logging Test ===\n")

    # Setup logging
    print("1. Setting up JSON logging...")
    setup_logging(level='INFO', format='json')

    logger = get_logger(__name__, service='test')

    print("\n2. Testing structured log messages...\n")

    # Test API request log
    log_api_request(logger, 'GET', '/exploits', 200, 0.05)

    # Test aggregator fetch log
    log_aggregator_fetch(logger, 'defillama', 416, 3.5, True)

    # Test database query log
    log_database_query(logger, 'SELECT', 0.02, 100)

    # Test exploit detection log
    log_exploit_detected(logger, 'ExampleDEX', 'Ethereum', 1_000_000, 'defillama')

    # Test payment log
    log_payment_event(logger, 'user_123', 99.00, 'succeeded', 'pro')

    # Test error log
    try:
        raise ValueError("Test error")
    except Exception as e:
        log_error(logger, e, context={'endpoint': '/test', 'user_id': '123'})

    # Test log context
    print("\n3. Testing log context...\n")
    with LogContext(logger, request_id='abc123', user_id='user_456'):
        logger.info("Log with context")

    print("\n✅ Structured logging ready")
    print("All logs are JSON-formatted for easy parsing")
