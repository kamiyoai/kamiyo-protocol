# -*- coding: utf-8 -*-
"""
Kamiyo API Streaming Responses
Implements streaming for large datasets and real-time updates

Features:
- Streaming JSON responses (newline-delimited JSON)
- Server-Sent Events (SSE) for real-time updates
- Chunked transfer encoding
- CSV export streaming
- Memory-efficient iteration
- Backpressure handling

Performance targets:
- Support 10,000+ item responses without memory issues
- <10ms per chunk processing time
- Real-time SSE updates with <100ms latency
"""

import asyncio
import json
import csv
import logging
from typing import AsyncIterator, Dict, Any, List, Optional, Callable
from io import StringIO
from datetime import datetime

from fastapi import Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

logger = logging.getLogger(__name__)


class StreamingConfig:
    """Configuration for streaming responses"""

    # Chunk size for JSON streaming (number of items)
    JSON_CHUNK_SIZE: int = 100

    # Buffer size for CSV streaming (number of rows)
    CSV_CHUNK_SIZE: int = 500

    # SSE keepalive interval (seconds)
    SSE_KEEPALIVE_INTERVAL: int = 30

    # Maximum items per stream
    MAX_STREAM_ITEMS: int = 100000

    # Connection timeout (seconds)
    CONNECTION_TIMEOUT: int = 300  # 5 minutes


class JSONStreamer:
    """
    Streams JSON responses using newline-delimited JSON (NDJSON)

    Format:
        {"id": 1, "name": "item1"}
        {"id": 2, "name": "item2"}
        {"id": 3, "name": "item3"}

    Memory-efficient for large datasets
    """

    def __init__(
        self,
        data_iterator: AsyncIterator[Dict[str, Any]],
        chunk_size: int = StreamingConfig.JSON_CHUNK_SIZE
    ):
        """
        Initialize JSON streamer

        Args:
            data_iterator: Async iterator yielding data items
            chunk_size: Number of items per chunk
        """
        self.data_iterator = data_iterator
        self.chunk_size = chunk_size
        self.items_streamed = 0

    async def stream(self) -> AsyncIterator[str]:
        """
        Stream JSON data

        Yields:
            JSON strings (one per line)
        """
        try:
            async for item in self.data_iterator:
                # Convert to JSON
                json_line = json.dumps(item) + '\n'
                yield json_line

                self.items_streamed += 1

                # Check limit
                if self.items_streamed >= StreamingConfig.MAX_STREAM_ITEMS:
                    logger.warning(f"Reached max stream items: {StreamingConfig.MAX_STREAM_ITEMS}")
                    break

        except Exception as e:
            logger.error(f"Error streaming JSON: {e}")
            # Send error as last item
            error_item = {
                'error': True,
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }
            yield json.dumps(error_item) + '\n'

    def create_response(self) -> StreamingResponse:
        """
        Create FastAPI streaming response

        Returns:
            StreamingResponse with NDJSON content
        """
        return StreamingResponse(
            self.stream(),
            media_type='application/x-ndjson',
            headers={
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-cache'
            }
        )


class ArrayJSONStreamer:
    """
    Streams JSON array incrementally

    Format:
        [
        {"id": 1},
        {"id": 2},
        ...
        ]

    Proper JSON array format (not NDJSON)
    """

    def __init__(
        self,
        data_iterator: AsyncIterator[Dict[str, Any]],
        chunk_size: int = StreamingConfig.JSON_CHUNK_SIZE
    ):
        """
        Initialize array JSON streamer

        Args:
            data_iterator: Async iterator yielding data items
            chunk_size: Number of items per chunk
        """
        self.data_iterator = data_iterator
        self.chunk_size = chunk_size
        self.items_streamed = 0

    async def stream(self) -> AsyncIterator[str]:
        """
        Stream JSON array

        Yields:
            JSON array chunks
        """
        try:
            # Start array
            yield '[\n'

            first_item = True

            async for item in self.data_iterator:
                # Add comma separator (except for first item)
                if not first_item:
                    yield ',\n'
                else:
                    first_item = False

                # Convert to JSON
                json_str = json.dumps(item, indent=2)
                yield json_str

                self.items_streamed += 1

                # Check limit
                if self.items_streamed >= StreamingConfig.MAX_STREAM_ITEMS:
                    logger.warning(f"Reached max stream items: {StreamingConfig.MAX_STREAM_ITEMS}")
                    break

            # End array
            yield '\n]'

        except Exception as e:
            logger.error(f"Error streaming JSON array: {e}")
            # Close array on error
            yield '\n]'

    def create_response(self) -> StreamingResponse:
        """
        Create FastAPI streaming response

        Returns:
            StreamingResponse with JSON array
        """
        return StreamingResponse(
            self.stream(),
            media_type='application/json',
            headers={
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-cache'
            }
        )


class CSVStreamer:
    """
    Streams CSV responses for data export

    Memory-efficient for large datasets
    """

    def __init__(
        self,
        data_iterator: AsyncIterator[Dict[str, Any]],
        fields: Optional[List[str]] = None,
        chunk_size: int = StreamingConfig.CSV_CHUNK_SIZE
    ):
        """
        Initialize CSV streamer

        Args:
            data_iterator: Async iterator yielding data items
            fields: Field names (headers). If None, inferred from first item
            chunk_size: Number of rows per chunk
        """
        self.data_iterator = data_iterator
        self.fields = fields
        self.chunk_size = chunk_size
        self.items_streamed = 0

    async def stream(self) -> AsyncIterator[str]:
        """
        Stream CSV data

        Yields:
            CSV chunks
        """
        try:
            buffer = StringIO()
            writer = None
            first_item = True

            async for item in self.data_iterator:
                # Initialize writer on first item
                if first_item:
                    if self.fields is None:
                        self.fields = list(item.keys())

                    writer = csv.DictWriter(buffer, fieldnames=self.fields)
                    writer.writeheader()

                    # Yield header
                    yield buffer.getvalue()
                    buffer = StringIO()
                    first_item = False

                # Write row
                writer = csv.DictWriter(buffer, fieldnames=self.fields)
                writer.writerow(item)

                self.items_streamed += 1

                # Yield chunk when buffer reaches size
                if self.items_streamed % self.chunk_size == 0:
                    yield buffer.getvalue()
                    buffer = StringIO()

                # Check limit
                if self.items_streamed >= StreamingConfig.MAX_STREAM_ITEMS:
                    logger.warning(f"Reached max stream items: {StreamingConfig.MAX_STREAM_ITEMS}")
                    break

            # Yield remaining buffer
            if buffer.tell() > 0:
                yield buffer.getvalue()

        except Exception as e:
            logger.error(f"Error streaming CSV: {e}")
            # No error handling for CSV (partial data already sent)

    def create_response(self, filename: str = 'export.csv') -> StreamingResponse:
        """
        Create FastAPI streaming response

        Args:
            filename: Filename for download

        Returns:
            StreamingResponse with CSV content
        """
        return StreamingResponse(
            self.stream(),
            media_type='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-cache'
            }
        )


class SSEStreamer:
    """
    Server-Sent Events (SSE) for real-time updates

    SSE format:
        event: message
        data: {"id": 1, "type": "exploit"}

        event: message
        data: {"id": 2, "type": "exploit"}

    Features:
    - Automatic reconnection
    - Event types
    - Keepalive pings
    """

    def __init__(
        self,
        event_source: AsyncIterator[Dict[str, Any]],
        event_type: str = 'message',
        keepalive_interval: int = StreamingConfig.SSE_KEEPALIVE_INTERVAL
    ):
        """
        Initialize SSE streamer

        Args:
            event_source: Async iterator yielding events
            event_type: Default event type
            keepalive_interval: Interval for keepalive pings (seconds)
        """
        self.event_source = event_source
        self.event_type = event_type
        self.keepalive_interval = keepalive_interval
        self.events_sent = 0

    async def stream(self) -> AsyncIterator[str]:
        """
        Stream SSE events

        Yields:
            SSE formatted strings
        """
        try:
            last_keepalive = asyncio.get_event_loop().time()

            async for event_data in self.event_source:
                # Format SSE event
                event_str = self._format_sse_event(event_data)
                yield event_str

                self.events_sent += 1

                # Send keepalive ping if needed
                current_time = asyncio.get_event_loop().time()
                if current_time - last_keepalive > self.keepalive_interval:
                    yield self._format_keepalive()
                    last_keepalive = current_time

        except asyncio.CancelledError:
            logger.info("SSE stream cancelled by client")
        except Exception as e:
            logger.error(f"Error streaming SSE: {e}")
            # Send error event
            error_event = {
                'error': True,
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }
            yield self._format_sse_event(error_event, event_type='error')

    def _format_sse_event(
        self,
        data: Dict[str, Any],
        event_type: Optional[str] = None,
        event_id: Optional[str] = None
    ) -> str:
        """
        Format data as SSE event

        Args:
            data: Event data
            event_type: Event type (overrides default)
            event_id: Optional event ID for reconnection

        Returns:
            SSE formatted string
        """
        lines = []

        # Event type
        if event_type or self.event_type:
            lines.append(f"event: {event_type or self.event_type}")

        # Event ID
        if event_id:
            lines.append(f"id: {event_id}")

        # Event data
        data_str = json.dumps(data)
        lines.append(f"data: {data_str}")

        # SSE requires double newline
        return '\n'.join(lines) + '\n\n'

    def _format_keepalive(self) -> str:
        """
        Format keepalive ping

        Returns:
            SSE keepalive string
        """
        return ': keepalive\n\n'

    def create_response(self) -> StreamingResponse:
        """
        Create FastAPI streaming response

        Returns:
            StreamingResponse with SSE content
        """
        return StreamingResponse(
            self.stream(),
            media_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',  # Disable nginx buffering
                'Connection': 'keep-alive'
            }
        )


class BackpressureHandler:
    """
    Handles backpressure for streaming responses

    Prevents memory buildup when client is slow
    """

    def __init__(
        self,
        buffer_size: int = 100,
        timeout: float = 60.0
    ):
        """
        Initialize backpressure handler

        Args:
            buffer_size: Maximum buffer size
            timeout: Timeout for buffer writes (seconds)
        """
        self.buffer_size = buffer_size
        self.timeout = timeout
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=buffer_size)

    async def put(self, item: Any):
        """
        Put item into buffer with timeout

        Args:
            item: Item to buffer

        Raises:
            asyncio.TimeoutError: If buffer is full for too long
        """
        try:
            await asyncio.wait_for(
                self.queue.put(item),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            logger.error("Backpressure timeout: client too slow")
            raise

    async def get(self) -> Any:
        """
        Get item from buffer

        Returns:
            Buffered item
        """
        return await self.queue.get()

    def is_full(self) -> bool:
        """
        Check if buffer is full

        Returns:
            True if buffer is full
        """
        return self.queue.full()

    def is_empty(self) -> bool:
        """
        Check if buffer is empty

        Returns:
            True if buffer is empty
        """
        return self.queue.empty()


# Utility functions

async def stream_database_query(
    query_func: Callable,
    batch_size: int = 1000,
    **query_params
) -> AsyncIterator[Dict[str, Any]]:
    """
    Stream database query results in batches

    Args:
        query_func: Function that executes query and returns results
        batch_size: Number of rows per batch
        **query_params: Parameters to pass to query function

    Yields:
        Database rows as dictionaries
    """
    offset = 0

    while True:
        # Fetch batch
        batch = query_func(
            limit=batch_size,
            offset=offset,
            **query_params
        )

        if not batch:
            break

        # Yield items from batch
        for item in batch:
            yield item

        offset += batch_size

        # Prevent runaway queries
        if offset >= StreamingConfig.MAX_STREAM_ITEMS:
            logger.warning(f"Reached max stream items: {StreamingConfig.MAX_STREAM_ITEMS}")
            break


async def create_json_stream(
    items: AsyncIterator[Dict[str, Any]],
    format: str = 'ndjson'
) -> StreamingResponse:
    """
    Create JSON streaming response

    Args:
        items: Async iterator of items
        format: 'ndjson' or 'array'

    Returns:
        StreamingResponse
    """
    if format == 'ndjson':
        streamer = JSONStreamer(items)
    elif format == 'array':
        streamer = ArrayJSONStreamer(items)
    else:
        raise ValueError(f"Invalid format: {format}")

    return streamer.create_response()


async def create_csv_stream(
    items: AsyncIterator[Dict[str, Any]],
    filename: str = 'export.csv',
    fields: Optional[List[str]] = None
) -> StreamingResponse:
    """
    Create CSV streaming response

    Args:
        items: Async iterator of items
        filename: Filename for download
        fields: Field names (headers)

    Returns:
        StreamingResponse
    """
    streamer = CSVStreamer(items, fields=fields)
    return streamer.create_response(filename=filename)


async def create_sse_stream(
    events: AsyncIterator[Dict[str, Any]],
    event_type: str = 'message'
) -> StreamingResponse:
    """
    Create SSE streaming response

    Args:
        events: Async iterator of events
        event_type: Event type

    Returns:
        StreamingResponse
    """
    streamer = SSEStreamer(events, event_type=event_type)
    return streamer.create_response()
