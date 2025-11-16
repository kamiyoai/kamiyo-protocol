"""
Message Buffer for WebSocket
Queues messages during reconnection to prevent data loss
"""

import asyncio
from collections import deque
from typing import Any, Optional
import logging

logger = logging.getLogger(__name__)


class MessageBuffer:
    """
    Thread-safe message buffer for WebSocket messages

    Prevents message loss during:
    - Reconnections
    - Temporary processing slowdowns
    - Handler failures
    """

    def __init__(self, maxsize: int = 10000):
        """
        Args:
            maxsize: Maximum messages to buffer
        """
        self.maxsize = maxsize
        self.buffer: deque = deque(maxlen=maxsize)
        self.lock = asyncio.Lock()
        self.dropped_count = 0

    async def add(self, message: Any) -> bool:
        """
        Add message to buffer

        Args:
            message: Message to buffer

        Returns:
            True if added, False if dropped
        """
        async with self.lock:
            if len(self.buffer) >= self.maxsize:
                self.dropped_count += 1
                logger.warning(
                    f"Message buffer full ({self.maxsize}), "
                    f"dropped message (total dropped: {self.dropped_count})"
                )
                return False

            self.buffer.append(message)
            return True

    async def get(self) -> Optional[Any]:
        """
        Get next message from buffer

        Returns:
            Message or None if empty
        """
        async with self.lock:
            if self.buffer:
                return self.buffer.popleft()
            return None

    async def get_batch(self, size: int = 100) -> list:
        """
        Get batch of messages

        Args:
            size: Maximum messages to retrieve

        Returns:
            List of messages
        """
        async with self.lock:
            batch_size = min(size, len(self.buffer))
            batch = []

            for _ in range(batch_size):
                if self.buffer:
                    batch.append(self.buffer.popleft())

            return batch

    async def clear(self):
        """Clear all buffered messages"""
        async with self.lock:
            self.buffer.clear()

    async def size(self) -> int:
        """Get current buffer size"""
        async with self.lock:
            return len(self.buffer)

    def get_stats(self) -> dict:
        """Get buffer statistics"""
        return {
            'size': len(self.buffer),
            'maxsize': self.maxsize,
            'dropped_count': self.dropped_count,
            'utilization': len(self.buffer) / self.maxsize
        }
