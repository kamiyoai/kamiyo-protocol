# -*- coding: utf-8 -*-
"""
Distributed Circuit Breaker for Stripe API Calls
PCI DSS Compliance: High Availability & Fault Tolerance

This module implements a distributed circuit breaker pattern using Redis
for shared state across multiple application instances. This ensures that
payment processing remains resilient during Stripe API outages or degradation.

PCI DSS Requirements Addressed:
- Requirement 12.10.1: Incident response plan for payment processing failures
- Requirement 10.7: Retain audit trail history for payment system failures
- High Availability: Prevent cascading failures in distributed deployments
"""

import os
import sys
import json
import time
import logging
from typing import Optional, Dict, Any
from enum import Enum
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states per Martin Fowler's pattern"""
    CLOSED = "closed"      # Normal operation, requests pass through
    OPEN = "open"          # Too many failures, reject requests immediately
    HALF_OPEN = "half_open"  # Testing if service recovered


class RedisCircuitBreaker:
    """
    Distributed circuit breaker using Redis for shared state.

    This implementation ensures that all application instances share
    the same circuit breaker state, preventing multiple instances from
    simultaneously hammering a failing Stripe API.

    Circuit Breaker Logic:
    1. CLOSED: All requests pass through normally
    2. After N failures → OPEN: Block all requests for timeout period
    3. After timeout → HALF_OPEN: Allow 1 test request
    4. If test succeeds → CLOSED: Resume normal operation
    5. If test fails → OPEN: Back to blocking for another timeout

    PCI Compliance Notes:
    - All state changes are logged for audit trail (PCI DSS 10.2)
    - Failure patterns help identify potential security incidents
    - Prevents excessive API calls during payment processor outages
    """

    def __init__(
        self,
        redis_client,
        service_name: str = "stripe_api",
        failure_threshold: int = 5,
        timeout_seconds: int = 60,
        half_open_max_calls: int = 1
    ):
        """
        Initialize distributed circuit breaker.

        Args:
            redis_client: Redis client instance (redis.Redis or aioredis)
            service_name: Unique name for this circuit breaker
            failure_threshold: Number of failures before opening circuit
            timeout_seconds: Seconds to wait before attempting recovery
            half_open_max_calls: Number of test calls in half-open state
        """
        self.redis = redis_client
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self.half_open_max_calls = half_open_max_calls

        # Redis keys for distributed state
        self.state_key = f"circuit_breaker:{service_name}:state"
        self.failure_count_key = f"circuit_breaker:{service_name}:failures"
        self.opened_at_key = f"circuit_breaker:{service_name}:opened_at"
        self.half_open_calls_key = f"circuit_breaker:{service_name}:half_open_calls"
        self.stats_key = f"circuit_breaker:{service_name}:stats"

        logger.info(
            f"Circuit breaker initialized: {service_name} "
            f"(threshold={failure_threshold}, timeout={timeout_seconds}s)"
        )

    def record_success(self) -> None:
        """
        Record successful API call.

        This resets failure count and closes the circuit if in half-open state.
        PCI Audit: Log successful recovery from degraded state.
        """
        try:
            current_state = self._get_state()

            # Reset failure counter
            self.redis.set(self.failure_count_key, 0)

            # If we were in HALF_OPEN, close the circuit
            if current_state == CircuitState.HALF_OPEN.value:
                self._set_state(CircuitState.CLOSED.value)
                logger.info(
                    f"[CIRCUIT BREAKER] {self.service_name}: "
                    f"Recovered from degraded state → CLOSED"
                )
                self._increment_stat("recoveries")

            # Clear half-open call counter
            self.redis.delete(self.half_open_calls_key)

            # Track success metrics
            self._increment_stat("total_calls")
            self._increment_stat("successful_calls")

        except Exception as e:
            logger.error(f"Error recording success in circuit breaker: {e}")

    def record_failure(self, error: Optional[Exception] = None) -> None:
        """
        Record failed API call.

        Increments failure counter and opens circuit if threshold exceeded.
        PCI Audit: Log failure patterns for security incident detection.

        Args:
            error: Exception that caused the failure (for logging)
        """
        try:
            # Increment failure counter
            failure_count = self.redis.incr(self.failure_count_key)

            # Set expiry on failure counter to auto-reset after timeout
            self.redis.expire(self.failure_count_key, self.timeout_seconds * 2)

            # Log failure for audit trail
            error_type = type(error).__name__ if error else "Unknown"
            logger.warning(
                f"[CIRCUIT BREAKER] {self.service_name}: "
                f"Failure recorded (count={failure_count}/{self.failure_threshold}) "
                f"Error: {error_type}"
            )

            # Open circuit if threshold exceeded
            if failure_count >= self.failure_threshold:
                self._open_circuit()

            # Track failure metrics
            self._increment_stat("total_calls")
            self._increment_stat("failed_calls")

        except Exception as e:
            logger.error(f"Error recording failure in circuit breaker: {e}")

    def can_call(self) -> bool:
        """
        Check if API call is allowed based on circuit state.

        Returns:
            True if call is allowed, False if circuit is open

        PCI Compliance:
        - Prevents excessive failed payment attempts (PCI DSS 8.1.6)
        - Protects payment processor relationship during outages
        """
        try:
            state = self._get_state()

            if state == CircuitState.CLOSED.value:
                # Normal operation
                return True

            elif state == CircuitState.OPEN.value:
                # Check if timeout period has passed
                opened_at_str = self.redis.get(self.opened_at_key)
                if not opened_at_str:
                    # No timestamp, allow call (safety fallback)
                    return True

                opened_at = float(opened_at_str)
                elapsed = time.time() - opened_at

                if elapsed >= self.timeout_seconds:
                    # Timeout expired, transition to HALF_OPEN
                    self._set_state(CircuitState.HALF_OPEN.value)
                    self.redis.set(self.half_open_calls_key, 0)
                    logger.info(
                        f"[CIRCUIT BREAKER] {self.service_name}: "
                        f"Timeout expired → HALF_OPEN (testing recovery)"
                    )
                    return True
                else:
                    # Still in timeout period
                    remaining = self.timeout_seconds - elapsed
                    logger.debug(
                        f"[CIRCUIT BREAKER] {self.service_name}: "
                        f"OPEN - rejecting call (retry in {remaining:.0f}s)"
                    )
                    self._increment_stat("rejected_calls")
                    return False

            elif state == CircuitState.HALF_OPEN.value:
                # Allow limited test calls
                half_open_calls = int(self.redis.get(self.half_open_calls_key) or 0)

                if half_open_calls < self.half_open_max_calls:
                    self.redis.incr(self.half_open_calls_key)
                    logger.debug(
                        f"[CIRCUIT BREAKER] {self.service_name}: "
                        f"HALF_OPEN - allowing test call ({half_open_calls + 1}/{self.half_open_max_calls})"
                    )
                    return True
                else:
                    logger.debug(
                        f"[CIRCUIT BREAKER] {self.service_name}: "
                        f"HALF_OPEN - max test calls reached"
                    )
                    self._increment_stat("rejected_calls")
                    return False

            # Unknown state, allow call (safety fallback)
            logger.warning(
                f"[CIRCUIT BREAKER] {self.service_name}: "
                f"Unknown state '{state}', allowing call"
            )
            return True

        except Exception as e:
            logger.error(f"Error checking circuit breaker state: {e}")
            # On error, allow call (fail open for availability)
            return True

    def get_status(self) -> Dict[str, Any]:
        """
        Get current circuit breaker status for monitoring.

        Returns:
            Dict with state, metrics, and timing information

        Used for:
        - Health check endpoints
        - Prometheus metrics export
        - PCI audit reports
        """
        try:
            state = self._get_state()
            failure_count = int(self.redis.get(self.failure_count_key) or 0)

            status = {
                "service": self.service_name,
                "state": state,
                "failure_count": failure_count,
                "failure_threshold": self.failure_threshold,
                "timeout_seconds": self.timeout_seconds,
                "is_available": state == CircuitState.CLOSED.value
            }

            # Add timing info for OPEN state
            if state == CircuitState.OPEN.value:
                opened_at_str = self.redis.get(self.opened_at_key)
                if opened_at_str:
                    opened_at = float(opened_at_str)
                    elapsed = time.time() - opened_at
                    remaining = max(0, self.timeout_seconds - elapsed)
                    status["opened_at"] = datetime.fromtimestamp(opened_at).isoformat()
                    status["retry_in_seconds"] = int(remaining)

            # Add statistics
            stats = self._get_stats()
            status["statistics"] = stats

            return status

        except Exception as e:
            logger.error(f"Error getting circuit breaker status: {e}")
            return {
                "service": self.service_name,
                "state": "unknown",
                "error": str(e)
            }

    def reset(self) -> None:
        """
        Manually reset circuit breaker to CLOSED state.

        Use cases:
        - After manual intervention fixed the issue
        - During maintenance windows
        - For testing

        PCI Audit: Log manual resets with operator information
        """
        try:
            logger.warning(
                f"[CIRCUIT BREAKER] {self.service_name}: "
                f"Manual reset → CLOSED"
            )

            self._set_state(CircuitState.CLOSED.value)
            self.redis.delete(self.failure_count_key)
            self.redis.delete(self.opened_at_key)
            self.redis.delete(self.half_open_calls_key)

            self._increment_stat("manual_resets")

        except Exception as e:
            logger.error(f"Error resetting circuit breaker: {e}")

    # ==========================================
    # PRIVATE HELPER METHODS
    # ==========================================

    def _get_state(self) -> str:
        """Get current state from Redis"""
        try:
            state = self.redis.get(self.state_key)
            if state:
                return state.decode('utf-8') if isinstance(state, bytes) else state
            return CircuitState.CLOSED.value
        except Exception as e:
            logger.error(f"Error reading circuit state: {e}")
            return CircuitState.CLOSED.value

    def _set_state(self, state: str) -> None:
        """Set current state in Redis"""
        try:
            self.redis.set(self.state_key, state)
            # Set expiry to auto-close after extended timeout
            self.redis.expire(self.state_key, self.timeout_seconds * 10)
        except Exception as e:
            logger.error(f"Error setting circuit state: {e}")

    def _open_circuit(self) -> None:
        """Transition to OPEN state"""
        try:
            self._set_state(CircuitState.OPEN.value)
            self.redis.set(self.opened_at_key, time.time())

            logger.error(
                f"[CIRCUIT BREAKER] {self.service_name}: "
                f"Threshold exceeded → OPEN "
                f"(blocking calls for {self.timeout_seconds}s)"
            )

            self._increment_stat("circuit_opens")

        except Exception as e:
            logger.error(f"Error opening circuit: {e}")

    def _increment_stat(self, stat_name: str) -> None:
        """Increment a statistic counter"""
        try:
            key = f"{self.stats_key}:{stat_name}"
            self.redis.incr(key)
            # Keep stats for 7 days
            self.redis.expire(key, 7 * 24 * 60 * 60)
        except Exception as e:
            logger.debug(f"Error incrementing stat {stat_name}: {e}")

    def _get_stats(self) -> Dict[str, int]:
        """Get all statistics"""
        try:
            stat_keys = self.redis.keys(f"{self.stats_key}:*")
            stats = {}

            for key in stat_keys:
                key_str = key.decode('utf-8') if isinstance(key, bytes) else key
                stat_name = key_str.split(':')[-1]
                value = int(self.redis.get(key) or 0)
                stats[stat_name] = value

            return stats

        except Exception as e:
            logger.debug(f"Error reading stats: {e}")
            return {}


class InMemoryCircuitBreaker:
    """
    In-memory fallback circuit breaker for when Redis is unavailable.

    WARNING: This is NOT suitable for distributed deployments.
    Each application instance maintains its own state.
    Use only as fallback or in single-instance development environments.

    PCI Compliance Note:
    Production deployments MUST use RedisCircuitBreaker for proper
    high availability and audit trail requirements.
    """

    def __init__(
        self,
        service_name: str = "stripe_api",
        failure_threshold: int = 5,
        timeout_seconds: int = 60
    ):
        """Initialize in-memory circuit breaker"""
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds

        # In-memory state
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.opened_at = None
        self.half_open_calls = 0

        # Statistics
        self.stats = {
            "total_calls": 0,
            "successful_calls": 0,
            "failed_calls": 0,
            "rejected_calls": 0,
            "circuit_opens": 0,
            "recoveries": 0,
            "manual_resets": 0
        }

        logger.warning(
            f"[CIRCUIT BREAKER] Using in-memory fallback for {service_name} "
            f"- NOT suitable for production distributed deployments"
        )

    def record_success(self) -> None:
        """Record successful call"""
        self.failure_count = 0

        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.CLOSED
            self.half_open_calls = 0
            logger.info(
                f"[CIRCUIT BREAKER] {self.service_name}: "
                f"Recovered → CLOSED"
            )
            self.stats["recoveries"] += 1

        self.stats["total_calls"] += 1
        self.stats["successful_calls"] += 1

    def record_failure(self, error: Optional[Exception] = None) -> None:
        """Record failed call"""
        self.failure_count += 1

        error_type = type(error).__name__ if error else "Unknown"
        logger.warning(
            f"[CIRCUIT BREAKER] {self.service_name}: "
            f"Failure ({self.failure_count}/{self.failure_threshold}) "
            f"Error: {error_type}"
        )

        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            self.opened_at = time.time()
            logger.error(
                f"[CIRCUIT BREAKER] {self.service_name}: → OPEN"
            )
            self.stats["circuit_opens"] += 1

        self.stats["total_calls"] += 1
        self.stats["failed_calls"] += 1

    def can_call(self) -> bool:
        """Check if call is allowed"""
        if self.state == CircuitState.CLOSED:
            return True

        elif self.state == CircuitState.OPEN:
            if self.opened_at and time.time() - self.opened_at >= self.timeout_seconds:
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                logger.info(
                    f"[CIRCUIT BREAKER] {self.service_name}: → HALF_OPEN"
                )
                return True
            self.stats["rejected_calls"] += 1
            return False

        elif self.state == CircuitState.HALF_OPEN:
            if self.half_open_calls < 1:
                self.half_open_calls += 1
                return True
            self.stats["rejected_calls"] += 1
            return False

        return True

    def get_status(self) -> Dict[str, Any]:
        """Get current status"""
        status = {
            "service": self.service_name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "timeout_seconds": self.timeout_seconds,
            "is_available": self.state == CircuitState.CLOSED,
            "statistics": self.stats.copy()
        }

        if self.state == CircuitState.OPEN and self.opened_at:
            elapsed = time.time() - self.opened_at
            remaining = max(0, self.timeout_seconds - elapsed)
            status["retry_in_seconds"] = int(remaining)

        return status

    def reset(self) -> None:
        """Manually reset circuit"""
        logger.warning(
            f"[CIRCUIT BREAKER] {self.service_name}: Manual reset"
        )
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.opened_at = None
        self.half_open_calls = 0
        self.stats["manual_resets"] += 1


# ==========================================
# FACTORY FUNCTION
# ==========================================

def get_circuit_breaker(
    service_name: str = "stripe_api",
    failure_threshold: int = 5,
    timeout_seconds: int = 60
):
    """
    Get circuit breaker instance with Redis fallback to in-memory.

    Automatically detects Redis availability and chooses appropriate
    implementation. Production deployments should ensure Redis is
    always available for PCI compliance.

    Args:
        service_name: Unique name for this circuit breaker
        failure_threshold: Failures before opening circuit
        timeout_seconds: Timeout before retry attempt

    Returns:
        RedisCircuitBreaker if Redis available, else InMemoryCircuitBreaker

    PCI Compliance:
    - Production MUST use Redis for distributed state
    - In-memory fallback logs warning for audit review
    """
    try:
        import redis

        # Try to connect to Redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")

        redis_client = redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2
        )

        # Test connection
        redis_client.ping()

        logger.info(
            f"[CIRCUIT BREAKER] Using Redis for distributed state: {service_name}"
        )

        return RedisCircuitBreaker(
            redis_client=redis_client,
            service_name=service_name,
            failure_threshold=failure_threshold,
            timeout_seconds=timeout_seconds
        )

    except Exception as e:
        logger.warning(
            f"[CIRCUIT BREAKER] Redis unavailable ({e}), "
            f"falling back to in-memory circuit breaker. "
            f"WARNING: Not suitable for production distributed deployments!"
        )

        return InMemoryCircuitBreaker(
            service_name=service_name,
            failure_threshold=failure_threshold,
            timeout_seconds=timeout_seconds
        )


# ==========================================
# TESTING
# ==========================================

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)

    print("\n=== Circuit Breaker Test ===\n")

    # Test with automatic Redis detection
    breaker = get_circuit_breaker(
        service_name="test_service",
        failure_threshold=3,
        timeout_seconds=5
    )

    print("Initial status:", breaker.get_status())

    # Simulate successful calls
    print("\n--- Testing successful calls ---")
    for i in range(5):
        assert breaker.can_call(), "Should allow call"
        breaker.record_success()
        print(f"✓ Call {i+1} succeeded")

    # Simulate failures
    print("\n--- Testing failure handling ---")
    for i in range(5):
        if breaker.can_call():
            breaker.record_failure(Exception(f"Test error {i+1}"))
            print(f"✗ Call {i+1} failed")
        else:
            print(f"⊗ Call {i+1} rejected (circuit open)")

    print("\nStatus after failures:", breaker.get_status())

    # Wait for timeout
    print("\n--- Waiting for timeout ---")
    time.sleep(6)

    # Test recovery
    print("\n--- Testing recovery ---")
    if breaker.can_call():
        breaker.record_success()
        print("✓ Recovery call succeeded")

    print("\nFinal status:", breaker.get_status())
    print("\n✅ Circuit breaker test complete")
