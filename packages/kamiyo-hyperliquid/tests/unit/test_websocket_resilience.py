"""
Tests for WebSocket Resilience Components
"""

import pytest
import asyncio
from datetime import datetime, timezone

from websocket.circuit_breaker import CircuitBreaker, CircuitState
from websocket.message_buffer import MessageBuffer


class TestCircuitBreaker:
    """Test circuit breaker pattern"""

    def test_init(self):
        """Test circuit breaker initialization"""
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=30)

        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 0
        assert cb.success_count == 0

    def test_record_success_in_closed_state(self):
        """Test success recording when circuit is closed"""
        cb = CircuitBreaker()
        cb.record_success()

        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 0

    def test_circuit_opens_after_threshold(self):
        """Test circuit opens after failure threshold"""
        cb = CircuitBreaker(failure_threshold=3)

        for _ in range(3):
            cb.record_failure()

        assert cb.state == CircuitState.OPEN
        assert cb.failure_count == 3

    def test_cannot_attempt_when_open(self):
        """Test attempt blocking when circuit is open"""
        cb = CircuitBreaker(failure_threshold=2, recovery_timeout=60)

        cb.record_failure()
        cb.record_failure()

        assert cb.state == CircuitState.OPEN
        assert not cb.can_attempt()

    def test_half_open_after_recovery_timeout(self):
        """Test circuit transitions to half-open after timeout"""
        import time

        cb = CircuitBreaker(failure_threshold=2, recovery_timeout=1)

        cb.record_failure()
        cb.record_failure()

        assert cb.state == CircuitState.OPEN

        time.sleep(1.1)

        assert cb.can_attempt()
        assert cb.state == CircuitState.HALF_OPEN

    def test_closes_after_success_threshold_in_half_open(self):
        """Test circuit closes after success threshold in half-open"""
        cb = CircuitBreaker(
            failure_threshold=2,
            recovery_timeout=0,
            success_threshold=2
        )

        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        assert cb.can_attempt()
        assert cb.state == CircuitState.HALF_OPEN

        cb.record_success()
        assert cb.state == CircuitState.HALF_OPEN

        cb.record_success()
        assert cb.state == CircuitState.CLOSED

    def test_reopens_on_failure_in_half_open(self):
        """Test circuit reopens on failure in half-open state"""
        cb = CircuitBreaker(
            failure_threshold=2,
            recovery_timeout=0,
            success_threshold=2
        )

        cb.record_failure()
        cb.record_failure()
        cb.can_attempt()  # Transition to half-open

        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_get_state(self):
        """Test get state returns correct information"""
        cb = CircuitBreaker()

        state = cb.get_state()

        assert 'state' in state
        assert 'failure_count' in state
        assert 'success_count' in state

    def test_reset(self):
        """Test manual reset"""
        cb = CircuitBreaker(failure_threshold=2)

        cb.record_failure()
        cb.record_failure()

        assert cb.state == CircuitState.OPEN

        cb.reset()

        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 0


class TestMessageBuffer:
    """Test message buffer"""

    @pytest.mark.asyncio
    async def test_init(self):
        """Test buffer initialization"""
        buffer = MessageBuffer(maxsize=100)

        assert buffer.maxsize == 100
        assert await buffer.size() == 0

    @pytest.mark.asyncio
    async def test_add_message(self):
        """Test adding messages"""
        buffer = MessageBuffer()

        result = await buffer.add({"test": "message"})

        assert result is True
        assert await buffer.size() == 1

    @pytest.mark.asyncio
    async def test_get_message(self):
        """Test retrieving messages"""
        buffer = MessageBuffer()

        await buffer.add({"id": 1})
        message = await buffer.get()

        assert message == {"id": 1}
        assert await buffer.size() == 0

    @pytest.mark.asyncio
    async def test_fifo_order(self):
        """Test FIFO ordering"""
        buffer = MessageBuffer()

        await buffer.add({"id": 1})
        await buffer.add({"id": 2})
        await buffer.add({"id": 3})

        assert (await buffer.get())["id"] == 1
        assert (await buffer.get())["id"] == 2
        assert (await buffer.get())["id"] == 3

    @pytest.mark.asyncio
    async def test_max_size_enforcement(self):
        """Test buffer enforces max size"""
        buffer = MessageBuffer(maxsize=3)

        await buffer.add({"id": 1})
        await buffer.add({"id": 2})
        await buffer.add({"id": 3})

        result = await buffer.add({"id": 4})

        assert result is False
        assert await buffer.size() == 3
        assert buffer.dropped_count == 1

    @pytest.mark.asyncio
    async def test_get_batch(self):
        """Test batch retrieval"""
        buffer = MessageBuffer()

        for i in range(10):
            await buffer.add({"id": i})

        batch = await buffer.get_batch(size=5)

        assert len(batch) == 5
        assert batch[0]["id"] == 0
        assert batch[4]["id"] == 4
        assert await buffer.size() == 5

    @pytest.mark.asyncio
    async def test_get_batch_limited_by_available(self):
        """Test batch size limited by available messages"""
        buffer = MessageBuffer()

        await buffer.add({"id": 1})
        await buffer.add({"id": 2})

        batch = await buffer.get_batch(size=10)

        assert len(batch) == 2

    @pytest.mark.asyncio
    async def test_clear(self):
        """Test buffer clear"""
        buffer = MessageBuffer()

        for i in range(5):
            await buffer.add({"id": i})

        await buffer.clear()

        assert await buffer.size() == 0

    @pytest.mark.asyncio
    async def test_get_stats(self):
        """Test statistics"""
        buffer = MessageBuffer(maxsize=10)

        for i in range(5):
            await buffer.add({"id": i})

        stats = buffer.get_stats()

        assert stats['size'] == 5
        assert stats['maxsize'] == 10
        assert stats['utilization'] == 0.5

    @pytest.mark.asyncio
    async def test_thread_safety(self):
        """Test concurrent access"""
        buffer = MessageBuffer()

        async def add_messages():
            for i in range(100):
                await buffer.add({"id": i})

        async def read_messages():
            for _ in range(100):
                await buffer.get()
                await asyncio.sleep(0.001)

        await asyncio.gather(
            add_messages(),
            read_messages()
        )

        assert await buffer.size() == 0
