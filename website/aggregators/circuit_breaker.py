# -*- coding: utf-8 -*-
"""
Kamiyo Circuit Breaker Pattern
Prevents cascading failures in aggregator execution

Circuit States:
1. CLOSED: Normal operation, requests pass through
2. OPEN: Failing, requests immediately fail (fast-fail)
3. HALF_OPEN: Testing recovery, limited requests pass through

Thresholds:
- Failure threshold: 5 failures → OPEN
- Timeout threshold: 30 seconds
- Recovery timeout: 60 seconds in OPEN before HALF_OPEN

Prevents wasting time on consistently failing sources
"""

import time
import logging
from typing import Dict, Optional, Callable, Any, Awaitable
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
import asyncio

from monitoring.aggregator_metrics import (
    track_circuit_breaker_state_change,
    track_circuit_breaker_open_time
)

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = 'closed'  # Normal operation
    OPEN = 'open'  # Failing, reject requests
    HALF_OPEN = 'half_open'  # Testing recovery


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker"""

    # Failure threshold (number of failures to open circuit)
    failure_threshold: int = 5

    # Timeout threshold (seconds, treat timeout as failure)
    timeout_threshold: float = 30.0

    # Recovery timeout (seconds in OPEN state before trying HALF_OPEN)
    recovery_timeout: float = 60.0

    # Success threshold in HALF_OPEN (successes needed to close circuit)
    success_threshold: int = 2

    # Window size for tracking failures (seconds)
    window_size: float = 300.0  # 5 minutes


@dataclass
class CircuitMetrics:
    """Metrics for circuit breaker"""

    # Counters
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    timeout_requests: int = 0
    rejected_requests: int = 0

    # State transitions
    state_transitions: int = 0
    last_state_change: Optional[datetime] = None

    # Time spent in each state
    time_in_closed: float = 0.0
    time_in_open: float = 0.0
    time_in_half_open: float = 0.0

    # Current state
    current_state: CircuitState = CircuitState.CLOSED

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'total_requests': self.total_requests,
            'successful_requests': self.successful_requests,
            'failed_requests': self.failed_requests,
            'timeout_requests': self.timeout_requests,
            'rejected_requests': self.rejected_requests,
            'state_transitions': self.state_transitions,
            'last_state_change': (
                self.last_state_change.isoformat()
                if self.last_state_change else None
            ),
            'time_in_closed': self.time_in_closed,
            'time_in_open': self.time_in_open,
            'time_in_half_open': self.time_in_half_open,
            'current_state': self.current_state.value,
            'success_rate': (
                self.successful_requests / self.total_requests
                if self.total_requests > 0 else 0.0
            )
        }


class CircuitBreaker:
    """
    Circuit breaker for aggregator protection

    Tracks failures and opens circuit to prevent wasting resources
    on consistently failing sources
    """

    def __init__(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None
    ):
        """
        Initialize circuit breaker

        Args:
            name: Name of protected resource (e.g., "rekt_news")
            config: Circuit breaker configuration
        """
        self.name = name
        self.config = config or CircuitBreakerConfig()

        # State
        self.state = CircuitState.CLOSED
        self.state_entered_at = time.time()

        # Failure tracking (within window)
        self.failures: list = []  # List of (timestamp, reason) tuples
        self.successes_in_half_open = 0

        # Metrics
        self.metrics = CircuitMetrics()

        logger.info(f"Circuit breaker initialized: {name}")

    def _clean_old_failures(self):
        """Remove failures outside the tracking window"""
        cutoff = time.time() - self.config.window_size
        self.failures = [
            (ts, reason) for ts, reason in self.failures
            if ts > cutoff
        ]

    def _get_failure_count(self) -> int:
        """Get number of failures in window"""
        self._clean_old_failures()
        return len(self.failures)

    def _record_failure(self, reason: str = 'error'):
        """
        Record a failure

        Args:
            reason: Failure reason ('error', 'timeout')
        """
        self.failures.append((time.time(), reason))
        self.metrics.failed_requests += 1

        if reason == 'timeout':
            self.metrics.timeout_requests += 1

    def _record_success(self):
        """Record a success"""
        self.metrics.successful_requests += 1

        if self.state == CircuitState.HALF_OPEN:
            self.successes_in_half_open += 1

    def _transition_to(self, new_state: CircuitState):
        """
        Transition to new state

        Args:
            new_state: New circuit state
        """
        if new_state == self.state:
            return

        # Track time in previous state
        time_in_state = time.time() - self.state_entered_at

        if self.state == CircuitState.CLOSED:
            self.metrics.time_in_closed += time_in_state
        elif self.state == CircuitState.OPEN:
            self.metrics.time_in_open += time_in_state
            track_circuit_breaker_open_time(self.name, time_in_state)
        elif self.state == CircuitState.HALF_OPEN:
            self.metrics.time_in_half_open += time_in_state

        # Transition to new state
        old_state = self.state
        self.state = new_state
        self.state_entered_at = time.time()
        self.metrics.state_transitions += 1
        self.metrics.last_state_change = datetime.utcnow()
        self.metrics.current_state = new_state

        # Track state change
        track_circuit_breaker_state_change(self.name, old_state.value, new_state.value)

        logger.warning(
            f"Circuit breaker {self.name}: {old_state.value} → {new_state.value}"
        )

    def _should_open(self) -> bool:
        """
        Check if circuit should open

        Returns:
            True if circuit should open
        """
        failure_count = self._get_failure_count()
        return failure_count >= self.config.failure_threshold

    def _should_attempt_reset(self) -> bool:
        """
        Check if circuit should attempt reset (OPEN → HALF_OPEN)

        Returns:
            True if should attempt reset
        """
        time_in_open = time.time() - self.state_entered_at
        return time_in_open >= self.config.recovery_timeout

    def _should_close(self) -> bool:
        """
        Check if circuit should close (HALF_OPEN → CLOSED)

        Returns:
            True if circuit should close
        """
        return self.successes_in_half_open >= self.config.success_threshold

    async def call(
        self,
        func: Callable[[], Awaitable[Any]],
        timeout: Optional[float] = None
    ) -> Any:
        """
        Call function through circuit breaker

        Args:
            func: Async function to call
            timeout: Optional timeout (uses config default if None)

        Returns:
            Function result

        Raises:
            CircuitOpenError: If circuit is open
            Exception: If function fails
        """
        # Update metrics
        self.metrics.total_requests += 1

        # State machine logic
        if self.state == CircuitState.OPEN:
            # Check if we should attempt reset
            if self._should_attempt_reset():
                self._transition_to(CircuitState.HALF_OPEN)
                self.successes_in_half_open = 0
            else:
                # Reject request (fast-fail)
                self.metrics.rejected_requests += 1
                raise CircuitOpenError(
                    f"Circuit breaker {self.name} is OPEN "
                    f"(will retry in {self.config.recovery_timeout - (time.time() - self.state_entered_at):.0f}s)"
                )

        # Execute function
        timeout_value = timeout or self.config.timeout_threshold

        try:
            # Execute with timeout
            result = await asyncio.wait_for(func(), timeout=timeout_value)

            # Record success
            self._record_success()

            # State transitions on success
            if self.state == CircuitState.HALF_OPEN:
                if self._should_close():
                    self._transition_to(CircuitState.CLOSED)
                    # Clear failures on successful recovery
                    self.failures = []

            return result

        except asyncio.TimeoutError:
            # Record timeout as failure
            self._record_failure('timeout')

            # Transition to OPEN if threshold reached
            if self.state == CircuitState.CLOSED:
                if self._should_open():
                    self._transition_to(CircuitState.OPEN)
            elif self.state == CircuitState.HALF_OPEN:
                # Failed during recovery, back to OPEN
                self._transition_to(CircuitState.OPEN)

            raise

        except Exception as e:
            # Record error as failure
            self._record_failure('error')

            # Transition to OPEN if threshold reached
            if self.state == CircuitState.CLOSED:
                if self._should_open():
                    self._transition_to(CircuitState.OPEN)
            elif self.state == CircuitState.HALF_OPEN:
                # Failed during recovery, back to OPEN
                self._transition_to(CircuitState.OPEN)

            raise

    def is_open(self) -> bool:
        """
        Check if circuit is open

        Returns:
            True if circuit is open
        """
        return self.state == CircuitState.OPEN

    def is_closed(self) -> bool:
        """
        Check if circuit is closed

        Returns:
            True if circuit is closed
        """
        return self.state == CircuitState.CLOSED

    def is_half_open(self) -> bool:
        """
        Check if circuit is half-open

        Returns:
            True if circuit is half-open
        """
        return self.state == CircuitState.HALF_OPEN

    def get_metrics(self) -> Dict[str, Any]:
        """
        Get circuit breaker metrics

        Returns:
            Metrics dictionary
        """
        return self.metrics.to_dict()

    def reset(self):
        """Reset circuit breaker to CLOSED state"""
        self._transition_to(CircuitState.CLOSED)
        self.failures = []
        self.successes_in_half_open = 0
        logger.info(f"Circuit breaker {self.name} reset")


class CircuitOpenError(Exception):
    """Exception raised when circuit is open"""
    pass


class CircuitBreakerRegistry:
    """
    Registry for managing multiple circuit breakers

    One circuit breaker per aggregation source
    """

    def __init__(self, default_config: Optional[CircuitBreakerConfig] = None):
        """
        Initialize registry

        Args:
            default_config: Default configuration for new circuit breakers
        """
        self.default_config = default_config or CircuitBreakerConfig()
        self.breakers: Dict[str, CircuitBreaker] = {}

    def get_breaker(self, name: str, config: Optional[CircuitBreakerConfig] = None) -> CircuitBreaker:
        """
        Get or create circuit breaker

        Args:
            name: Breaker name
            config: Optional configuration (uses default if None)

        Returns:
            Circuit breaker instance
        """
        if name not in self.breakers:
            breaker_config = config or self.default_config
            self.breakers[name] = CircuitBreaker(name, breaker_config)

        return self.breakers[name]

    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """
        Get metrics for all circuit breakers

        Returns:
            Dictionary of {name: metrics}
        """
        return {
            name: breaker.get_metrics()
            for name, breaker in self.breakers.items()
        }

    def get_open_breakers(self) -> list:
        """
        Get names of open circuit breakers

        Returns:
            List of breaker names
        """
        return [
            name for name, breaker in self.breakers.items()
            if breaker.is_open()
        ]

    def reset_all(self):
        """Reset all circuit breakers"""
        for breaker in self.breakers.values():
            breaker.reset()


# Global registry
_registry = CircuitBreakerRegistry()


def get_circuit_breaker(name: str, config: Optional[CircuitBreakerConfig] = None) -> CircuitBreaker:
    """
    Get circuit breaker from global registry

    Args:
        name: Breaker name
        config: Optional configuration

    Returns:
        Circuit breaker instance
    """
    return _registry.get_breaker(name, config)


def get_all_circuit_breakers() -> Dict[str, CircuitBreaker]:
    """
    Get all circuit breakers from global registry

    Returns:
        Dictionary of circuit breakers
    """
    return _registry.breakers


def get_circuit_breaker_metrics() -> Dict[str, Dict[str, Any]]:
    """
    Get metrics for all circuit breakers

    Returns:
        Dictionary of metrics
    """
    return _registry.get_all_metrics()
