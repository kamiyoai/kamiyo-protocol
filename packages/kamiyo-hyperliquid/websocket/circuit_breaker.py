"""
Circuit Breaker Pattern for WebSocket Resilience
Prevents cascade failures by stopping reconnection attempts when system is unhealthy
"""

import time
from enum import Enum
from typing import Optional


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Failing, stop attempts
    HALF_OPEN = "half_open"  # Testing if recovered


class CircuitBreaker:
    """
    Circuit breaker for WebSocket connection management

    Prevents:
    - Infinite reconnection loops
    - Resource exhaustion
    - Overwhelming external services
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        success_threshold: int = 2
    ):
        """
        Args:
            failure_threshold: Failures before opening circuit
            recovery_timeout: Seconds before attempting recovery
            success_threshold: Successes needed to close circuit
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[float] = None
        self.opened_at: Optional[float] = None

    def record_success(self):
        """Record successful operation"""
        self.failure_count = 0

        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1

            if self.success_count >= self.success_threshold:
                self._close_circuit()

        elif self.state == CircuitState.OPEN:
            # Should not happen, but reset if it does
            self._close_circuit()

    def record_failure(self):
        """Record failed operation"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        self.success_count = 0

        if self.state == CircuitState.HALF_OPEN:
            self._open_circuit()
        elif self.failure_count >= self.failure_threshold:
            self._open_circuit()

    def can_attempt(self) -> bool:
        """Check if operation attempt is allowed"""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self._half_open_circuit()
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            return True

        return False

    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt recovery"""
        if not self.opened_at:
            return True

        elapsed = time.time() - self.opened_at
        return elapsed >= self.recovery_timeout

    def _open_circuit(self):
        """Open circuit - stop attempts"""
        self.state = CircuitState.OPEN
        self.opened_at = time.time()
        self.success_count = 0

    def _close_circuit(self):
        """Close circuit - resume normal operation"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.opened_at = None

    def _half_open_circuit(self):
        """Half-open circuit - test if recovered"""
        self.state = CircuitState.HALF_OPEN
        self.failure_count = 0
        self.success_count = 0

    def get_state(self) -> dict:
        """Get circuit breaker state"""
        return {
            'state': self.state.value,
            'failure_count': self.failure_count,
            'success_count': self.success_count,
            'opened_at': self.opened_at,
            'last_failure': self.last_failure_time
        }

    def reset(self):
        """Manually reset circuit breaker"""
        self._close_circuit()
