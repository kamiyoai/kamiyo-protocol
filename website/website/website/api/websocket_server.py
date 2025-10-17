"""
WebSocket Server for Real-time Exploit Updates
Broadcasts new exploits to connected clients with filtering and rate limiting
"""

import asyncio
import json
import time
from typing import Dict, Set, Optional
from dataclasses import dataclass
from datetime import datetime

from fastapi import WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.websockets import WebSocketState
import logging

logger = logging.getLogger(__name__)


@dataclass
class WebSocketClient:
    """Represents a connected WebSocket client"""
    websocket: WebSocket
    client_id: str
    user_id: Optional[str]
    tier: str
    chains_filter: Set[str]
    min_amount_filter: float
    connected_at: float
    last_heartbeat: float
    message_count: int

    def matches_filters(self, exploit: dict) -> bool:
        """Check if exploit matches client's filters"""
        # Check chain filter
        if self.chains_filter and exploit.get('chain') not in self.chains_filter:
            return False

        # Check amount filter
        if exploit.get('amount_usd', 0) < self.min_amount_filter:
            return False

        return True


class WebSocketManager:
    """Manages WebSocket connections and message broadcasting"""

    def __init__(self):
        self.active_connections: Dict[str, WebSocketClient] = {}
        self.rate_limits = {
            'FREE': 10,      # 10 messages per minute
            'STARTER': 30,   # 30 messages per minute
            'PRO': 100,      # 100 messages per minute
            'ENTERPRISE': -1 # Unlimited
        }
        self.heartbeat_interval = 60  # seconds
        self.heartbeat_task: Optional[asyncio.Task] = None

    async def connect(
        self,
        websocket: WebSocket,
        client_id: str,
        user_id: Optional[str] = None,
        tier: str = 'FREE',
        chains: Optional[str] = None,
        min_amount: float = 0.0
    ):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()

        # Parse chains filter
        chains_filter = set(chains.split(',')) if chains else set()

        # Create client object
        client = WebSocketClient(
            websocket=websocket,
            client_id=client_id,
            user_id=user_id,
            tier=tier,
            chains_filter=chains_filter,
            min_amount_filter=min_amount,
            connected_at=time.time(),
            last_heartbeat=time.time(),
            message_count=0
        )

        self.active_connections[client_id] = client

        logger.info(f"WebSocket client connected: {client_id} (tier: {tier})")

        # Send welcome message
        await self.send_personal_message(
            client_id,
            {
                'type': 'status',
                'data': {
                    'message': 'Connected to Kamiyo real-time updates',
                    'tier': tier,
                    'filters': {
                        'chains': list(chains_filter),
                        'min_amount': min_amount
                    }
                },
                'timestamp': datetime.utcnow().isoformat()
            }
        )

    def disconnect(self, client_id: str):
        """Remove a WebSocket connection"""
        if client_id in self.active_connections:
            client = self.active_connections[client_id]
            duration = time.time() - client.connected_at
            logger.info(
                f"WebSocket client disconnected: {client_id} "
                f"(duration: {duration:.1f}s, messages: {client.message_count})"
            )
            del self.active_connections[client_id]

    async def send_personal_message(self, client_id: str, message: dict):
        """Send message to specific client"""
        if client_id not in self.active_connections:
            return

        client = self.active_connections[client_id]

        if client.websocket.client_state == WebSocketState.CONNECTED:
            try:
                await client.websocket.send_json(message)
                client.message_count += 1
            except Exception as e:
                logger.error(f"Failed to send message to {client_id}: {e}")
                self.disconnect(client_id)

    async def broadcast_exploit(self, exploit: dict):
        """Broadcast new exploit to all connected clients (with filtering)"""
        disconnected_clients = []

        for client_id, client in self.active_connections.items():
            # Check if client should receive this exploit
            if not client.matches_filters(exploit):
                continue

            # Check rate limit
            if not self._check_rate_limit(client):
                logger.warning(f"Rate limit exceeded for client {client_id}")
                continue

            # Send exploit
            message = {
                'type': 'exploit',
                'data': exploit,
                'timestamp': datetime.utcnow().isoformat()
            }

            if client.websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await client.websocket.send_json(message)
                    client.message_count += 1
                except Exception as e:
                    logger.error(f"Failed to broadcast to {client_id}: {e}")
                    disconnected_clients.append(client_id)
            else:
                disconnected_clients.append(client_id)

        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect(client_id)

    def _check_rate_limit(self, client: WebSocketClient) -> bool:
        """Check if client is within rate limit"""
        rate_limit = self.rate_limits.get(client.tier, 10)

        # Unlimited for enterprise
        if rate_limit == -1:
            return True

        # Simple rate limiting: messages per minute
        # In production, use a sliding window or token bucket
        elapsed = time.time() - client.connected_at
        messages_per_minute = (client.message_count / elapsed) * 60

        return messages_per_minute < rate_limit

    async def send_heartbeat(self):
        """Send heartbeat to all connected clients"""
        disconnected_clients = []

        for client_id, client in self.active_connections.items():
            # Check if client is still responsive
            if time.time() - client.last_heartbeat > 120:  # 2 minutes timeout
                logger.warning(f"Client {client_id} heartbeat timeout")
                disconnected_clients.append(client_id)
                continue

            message = {
                'type': 'heartbeat',
                'timestamp': datetime.utcnow().isoformat()
            }

            if client.websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await client.websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to send heartbeat to {client_id}: {e}")
                    disconnected_clients.append(client_id)
            else:
                disconnected_clients.append(client_id)

        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect(client_id)

    async def handle_client_message(self, client_id: str, message: dict):
        """Handle messages from client"""
        if client_id not in self.active_connections:
            return

        client = self.active_connections[client_id]
        msg_type = message.get('type')

        if msg_type == 'heartbeat_ack':
            # Update last heartbeat time
            client.last_heartbeat = time.time()

        elif msg_type == 'update_filters':
            # Update client filters
            data = message.get('data', {})
            if 'chains' in data:
                client.chains_filter = set(data['chains'])
            if 'min_amount' in data:
                client.min_amount_filter = data['min_amount']

            logger.info(f"Updated filters for client {client_id}")

            # Acknowledge
            await self.send_personal_message(
                client_id,
                {
                    'type': 'status',
                    'data': {'message': 'Filters updated'},
                    'timestamp': datetime.utcnow().isoformat()
                }
            )

    async def start_heartbeat_task(self):
        """Start background task for heartbeat"""
        async def heartbeat_loop():
            while True:
                await asyncio.sleep(self.heartbeat_interval)
                await self.send_heartbeat()

        if not self.heartbeat_task or self.heartbeat_task.done():
            self.heartbeat_task = asyncio.create_task(heartbeat_loop())
            logger.info("Heartbeat task started")

    def stop_heartbeat_task(self):
        """Stop heartbeat task"""
        if self.heartbeat_task and not self.heartbeat_task.done():
            self.heartbeat_task.cancel()
            logger.info("Heartbeat task stopped")

    def get_stats(self) -> dict:
        """Get WebSocket statistics"""
        total_messages = sum(c.message_count for c in self.active_connections.values())
        tier_counts = {}

        for client in self.active_connections.values():
            tier_counts[client.tier] = tier_counts.get(client.tier, 0) + 1

        return {
            'active_connections': len(self.active_connections),
            'total_messages_sent': total_messages,
            'connections_by_tier': tier_counts,
            'uptime': time.time() - min(
                (c.connected_at for c in self.active_connections.values()),
                default=time.time()
            )
        }


# Global manager instance
ws_manager = WebSocketManager()


async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    chains: Optional[str] = Query(None),
    min_amount: float = Query(0.0)
):
    """
    WebSocket endpoint for real-time exploit updates

    Query params:
    - token: API key for authentication (REQUIRED for Pro tier and above)
    - chains: Comma-separated list of chains to filter (optional)
    - min_amount: Minimum exploit amount in USD (optional)

    WebSocket access requires Pro tier or higher.
    Free tier users do NOT have WebSocket access.
    """
    # Generate client ID
    client_id = f"ws_{int(time.time() * 1000)}"

    # Validate token - WebSocket requires authentication
    user_id = None
    tier = 'free'

    if not token:
        # Reject connection - WebSocket requires Pro tier minimum
        await websocket.close(code=4003, reason="WebSocket access requires Pro tier or higher. Provide API key in 'token' query parameter.")
        logger.warning(f"WebSocket connection rejected: No API key provided")
        return

    # Validate API key
    try:
        from database import get_db
        db = get_db()
        user = db.conn.execute(
            "SELECT id, email, tier FROM users WHERE api_key = ?",
            (token,)
        ).fetchone()

        if not user:
            await websocket.close(code=4001, reason="Invalid API key")
            logger.warning(f"WebSocket connection rejected: Invalid API key")
            return

        user_id = user[0]
        tier = user[2].lower()

        # Verify user has Pro tier or higher (WebSocket is Pro+ feature)
        if tier not in ['pro', 'team', 'enterprise']:
            await websocket.close(code=4003, reason=f"WebSocket access requires Pro tier or higher. Current tier: {tier}")
            logger.warning(f"WebSocket connection rejected: Insufficient tier ({tier})")
            return

        logger.info(f"WebSocket authentication successful: user_id={user_id}, tier={tier}")

    except Exception as e:
        logger.error(f"WebSocket authentication error: {e}")
        await websocket.close(code=4000, reason="Authentication error")
        return

    try:
        # Connect client
        await ws_manager.connect(
            websocket=websocket,
            client_id=client_id,
            user_id=user_id,
            tier=tier,
            chains=chains,
            min_amount=min_amount
        )

        # Start heartbeat task if not running
        await ws_manager.start_heartbeat_task()

        # Listen for messages from client
        while True:
            try:
                data = await websocket.receive_json()
                await ws_manager.handle_client_message(client_id, data)
            except WebSocketDisconnect:
                logger.info(f"Client {client_id} disconnected normally")
                break
            except Exception as e:
                logger.error(f"Error receiving message from {client_id}: {e}")
                break

    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")

    finally:
        ws_manager.disconnect(client_id)


def get_websocket_manager() -> WebSocketManager:
    """Get the global WebSocket manager"""
    return ws_manager
