// ZK-gated channel WebSocket server
// Verifies ZK proofs on connection and broadcasts messages to channel members

import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { randomBytes } from 'crypto';
import type { Server as HttpServer } from 'http';

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderNullifier: string;  // ZK nullifier (anonymized sender)
  content: string;
  timestamp: number;
}

interface Connection {
  ws: WebSocket;
  channelId: string;
  nullifier: string;
  joinedAt: number;
}

interface AccessToken {
  channelId: string;
  nullifier: string;
  tier: number;
  expiresAt: number;
}

export class ChannelServer {
  private wss: WebSocketServer | null = null;
  private connections = new Map<WebSocket, Connection>();
  private channels = new Map<string, Set<WebSocket>>();
  private accessTokens = new Map<string, AccessToken>();
  private messageHistory = new Map<string, ChannelMessage[]>();
  private maxHistoryPerChannel = 100;

  constructor(private options: { path?: string } = {}) {}

  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({
      server,
      path: this.options.path || '/ws/channels',
    });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token || !this.verifyToken(token, ws)) {
        ws.close(4001, 'Invalid or expired token');
        return;
      }

      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnect(ws));
      ws.on('error', (err) => console.error('[ChannelWS] Error:', err.message));
    });

    console.log('[ChannelWS] Server attached');
  }

  // Register an access token (called by HTTP join endpoint)
  registerToken(token: string, channelId: string, nullifier: string, tier: number, ttlMs = 24 * 60 * 60 * 1000): void {
    this.accessTokens.set(token, {
      channelId,
      nullifier,
      tier,
      expiresAt: Date.now() + ttlMs,
    });

    // Auto-cleanup expired tokens
    setTimeout(() => this.accessTokens.delete(token), ttlMs + 1000);
  }

  private verifyToken(token: string, ws: WebSocket): boolean {
    const access = this.accessTokens.get(token);
    if (!access) return false;
    if (Date.now() > access.expiresAt) {
      this.accessTokens.delete(token);
      return false;
    }

    // Register connection
    const conn: Connection = {
      ws,
      channelId: access.channelId,
      nullifier: access.nullifier,
      joinedAt: Date.now(),
    };
    this.connections.set(ws, conn);

    // Add to channel room
    if (!this.channels.has(access.channelId)) {
      this.channels.set(access.channelId, new Set());
    }
    this.channels.get(access.channelId)!.add(ws);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      channelId: access.channelId,
      memberCount: this.channels.get(access.channelId)!.size,
    }));

    // Send recent history
    const history = this.messageHistory.get(access.channelId) || [];
    if (history.length > 0) {
      ws.send(JSON.stringify({
        type: 'history',
        messages: history.slice(-20),
      }));
    }

    // Invalidate token (single use)
    this.accessTokens.delete(token);

    return true;
  }

  private handleMessage(ws: WebSocket, data: RawData): void {
    const conn = this.connections.get(ws);
    if (!conn) return;

    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'message' && typeof msg.content === 'string') {
        const content = msg.content.trim().slice(0, 2000);
        if (!content) return;

        const channelMsg: ChannelMessage = {
          id: randomBytes(8).toString('hex'),
          channelId: conn.channelId,
          senderNullifier: conn.nullifier.slice(0, 8),
          content,
          timestamp: Date.now(),
        };

        // Store in history
        if (!this.messageHistory.has(conn.channelId)) {
          this.messageHistory.set(conn.channelId, []);
        }
        const history = this.messageHistory.get(conn.channelId)!;
        history.push(channelMsg);
        if (history.length > this.maxHistoryPerChannel) {
          history.shift();
        }

        // Broadcast to channel
        this.broadcast(conn.channelId, {
          type: 'message',
          message: channelMsg,
        });
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    const conn = this.connections.get(ws);
    if (!conn) return;

    // Remove from channel
    const room = this.channels.get(conn.channelId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        this.channels.delete(conn.channelId);
      }
    }

    this.connections.delete(ws);
  }

  private broadcast(channelId: string, payload: object): void {
    const room = this.channels.get(channelId);
    if (!room) return;

    const data = JSON.stringify(payload);
    for (const ws of room) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  getStats(): { channels: number; connections: number; tokens: number } {
    return {
      channels: this.channels.size,
      connections: this.connections.size,
      tokens: this.accessTokens.size,
    };
  }

  close(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.connections.clear();
    this.channels.clear();
    this.accessTokens.clear();
  }
}

// Singleton instance for use across the app
let channelServer: ChannelServer | null = null;

export function getChannelServer(): ChannelServer {
  if (!channelServer) {
    channelServer = new ChannelServer();
  }
  return channelServer;
}
