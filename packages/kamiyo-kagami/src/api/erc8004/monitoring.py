"""
Comprehensive logging and monitoring for ERC-8004
Structured logging with Sentry integration and Prometheus metrics
"""

import structlog
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.asyncio import AsyncioIntegration
from prometheus_client import Counter, Histogram, Gauge
from fastapi import Request
import os
import logging
import uuid
import time


sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=os.getenv("ENVIRONMENT", "production"),
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
        integrations=[
            FastApiIntegration(),
            AsyncioIntegration()
        ],
        before_send=lambda event, hint: event if event.get('level') != 'debug' else None
    )
    logging.info("Sentry error tracking enabled")
else:
    logging.warning("SENTRY_DSN not set, error tracking disabled")


structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True
)

logger = structlog.get_logger()


agent_registrations_total = Counter(
    'erc8004_agent_registrations_total',
    'Total agent registrations',
    ['chain', 'status']
)

agent_registration_duration = Histogram(
    'erc8004_agent_registration_duration_seconds',
    'Agent registration duration',
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

feedback_submissions_total = Counter(
    'erc8004_feedback_submissions_total',
    'Total feedback submissions',
    ['status']
)

payment_links_total = Counter(
    'erc8004_payment_links_total',
    'Total payment links',
    ['chain', 'status']
)

agent_search_duration = Histogram(
    'erc8004_agent_search_duration_seconds',
    'Agent search query duration',
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0]
)

active_agents_gauge = Gauge(
    'erc8004_active_agents_total',
    'Total active agents',
    ['chain']
)

api_requests_total = Counter(
    'erc8004_api_requests_total',
    'Total API requests',
    ['method', 'endpoint', 'status_code']
)

api_request_duration = Histogram(
    'erc8004_api_request_duration_seconds',
    'API request duration',
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
)


async def logging_middleware(request: Request, call_next):
    """
    Log all requests with timing and context

    Captures request metadata, timing, and errors with structured logging.
    Integrates with Sentry for error tracking.
    """
    request_id = str(uuid.uuid4())

    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        client_ip=request.client.host if request.client else "unknown"
    )

    start_time = time.time()

    logger.info("request_started",
                query_params=dict(request.query_params))

    try:
        response = await call_next(request)

        duration = time.time() - start_time

        api_requests_total.labels(
            method=request.method,
            endpoint=request.url.path,
            status_code=response.status_code
        ).inc()

        api_request_duration.observe(duration)

        logger.info("request_completed",
                    status_code=response.status_code,
                    duration_seconds=duration)

        response.headers["X-Request-ID"] = request_id
        return response

    except Exception as e:
        duration = time.time() - start_time

        api_requests_total.labels(
            method=request.method,
            endpoint=request.url.path,
            status_code=500
        ).inc()

        logger.error("request_failed",
                     error=str(e),
                     duration_seconds=duration,
                     exc_info=True)

        sentry_sdk.capture_exception(e)
        raise


class MetricsCollector:
    """Helper class for collecting operation metrics"""

    @staticmethod
    def record_registration(chain: str, success: bool, duration: float):
        """Record agent registration metrics"""
        status = 'success' if success else 'error'
        agent_registrations_total.labels(chain=chain, status=status).inc()
        agent_registration_duration.observe(duration)

    @staticmethod
    def record_feedback(success: bool):
        """Record feedback submission metrics"""
        status = 'success' if success else 'error'
        feedback_submissions_total.labels(status=status).inc()

    @staticmethod
    def record_payment_link(chain: str, success: bool):
        """Record payment link metrics"""
        status = 'success' if success else 'error'
        payment_links_total.labels(chain=chain, status=status).inc()

    @staticmethod
    def record_search_duration(duration: float):
        """Record agent search duration"""
        agent_search_duration.observe(duration)

    @staticmethod
    async def update_active_agents_gauge(db):
        """Update active agents gauge from database"""
        try:
            result = await db.fetch_one("""
                SELECT chain, COUNT(*) as count
                FROM erc8004_agents
                WHERE status = 'active'
                GROUP BY chain
            """)

            if result:
                for chain, count in result:
                    active_agents_gauge.labels(chain=chain).set(count)
        except Exception as e:
            logger.error(f"Failed to update active agents gauge: {e}")
