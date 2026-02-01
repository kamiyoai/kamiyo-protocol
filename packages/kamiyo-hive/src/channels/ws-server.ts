import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { MessageStore } from './message-store.js';
import type {
  ChannelMessage,
  ChannelMember,
  ChannelAccessToken,
  ClientPayload,
  ServerMessage,
  ChannelServerConfig,
} from './types.js';

const DEFAULT_PORT = 8080;
const DEFAULT_PRUNE_INTERVAL = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_AGE_DAYS = 7;

type TokenVerifier = (token: string) => Promise<ChannelAccessToken | null>;

export class ChannelServer {
  private wss: WebSocketServer | null = null;
  private rooms: Map<string, Set<WebSocket>> = new Map();
  private members: Map<WebSocket, ChannelMember> = new Map();
  private store: MessageStore;
  private verifyToken: TokenVerifier;
  private config: ChannelServerConfig;
  private pruneInterval: NodeJS.Timeout | null = null;

  constructor(
    config: ChannelServerConfig,
    verifyToken: TokenVerifier,
    store?: MessageStore
  ) {
    this.config = config;
    this.verifyToken = verifyToken;
    this.store = store ?? new MessageStore({ maxHistorySize: config.maxHistorySize });
  }

  start(): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({
      port: this.config.port ?? DEFAULT_PORT,
      host: this.config.host,
    });

    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.wss.on('error', (err) => {
      console.error('[ChannelServer] Error:', err.message);
    });

    const pruneMs = this.config.pruneIntervalMs ?? DEFAULT_PRUNE_INTERVAL;
    const maxAge = this.config.maxMessageAgeDays ?? DEFAULT_MAX_AGE_DAYS;
    this.pruneInterval = setInterval(() => {
      this.store.pruneOld(maxAge);
    }, pruneMs);
  }

  stop(): void {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }

    if (this.wss) {
      for (const ws of this.members.keys()) {
        ws.close(1001, 'Server shutting down');
      }
      this.wss.close();
      this.wss = null;
    }

    this.rooms.clear();
    this.members.clear();
  }

  private handleConnection(ws: WebSocket): void {
    ws.on('message', (raw) => this.handleMessage(ws, raw));
    ws.on('close', () => this.handleDisconnect(ws));
    ws.on('error', (err) => {
      console.error('[ChannelServer] Client error:', err.message);
    });
  }

  private async handleMessage(ws: WebSocket, raw: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    let payload: ClientPayload;

    try {
      const str = raw.toString();
      payload = JSON.parse(str) as ClientPayload;
    } catch {
      this.sendError(ws, 'Invalid JSON');
      return;
    }

    switch (payload.type) {
      case 'join':
        await this.handleJoin(ws, payload.token);
        break;
      case 'message':
        this.handleClientMessage(ws, payload.content);
        break;
      case 'leave':
        this.handleLeave(ws);
        break;
      default:
        this.sendError(ws, 'Unknown message type');
    }
  }

  private async handleJoin(ws: WebSocket, token: string): Promise<void> {
    const access = await this.verifyToken(token);
    if (!access) {
      this.sendError(ws, 'Invalid or expired token');
      ws.close(4001, 'Unauthorized');
      return;
    }

    if (access.expiresAt < Date.now()) {
      this.sendError(ws, 'Token expired');
      ws.close(4001, 'Unauthorized');
      return;
    }

    const member: ChannelMember = {
      nullifier: access.nullifier,
      joinedAt: Date.now(),
      ws,
    };

    this.members.set(ws, member);

    let room = this.rooms.get(access.channelId);
    if (!room) {
      room = new Set();
      this.rooms.set(access.channelId, room);
    }
    room.add(ws);

    const history = this.store.getHistory(access.channelId, 50);
    this.send(ws, { type: 'history', data: history });

    this.broadcast(access.channelId, {
      type: 'join',
      data: { nullifier: access.nullifier },
    }, ws);
  }

  private handleClientMessage(ws: WebSocket, content: string): void {
    const member = this.members.get(ws);
    if (!member) {
      this.sendError(ws, 'Not joined to a channel');
      return;
    }

    const channelId = this.getChannelForSocket(ws);
    if (!channelId) {
      this.sendError(ws, 'Not in a channel');
      return;
    }

    const msg: ChannelMessage = {
      id: randomUUID(),
      channelId,
      senderNullifier: member.nullifier,
      content,
      timestamp: Date.now(),
    };

    this.store.saveMessage(msg);
    this.broadcast(channelId, { type: 'message', data: msg });
  }

  private handleLeave(ws: WebSocket): void {
    this.handleDisconnect(ws);
  }

  private handleDisconnect(ws: WebSocket): void {
    const member = this.members.get(ws);
    if (!member) return;

    const channelId = this.getChannelForSocket(ws);

    this.members.delete(ws);

    for (const [id, room] of this.rooms.entries()) {
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(id);
      }
    }

    if (channelId) {
      this.broadcast(channelId, {
        type: 'leave',
        data: { nullifier: member.nullifier },
      });
    }
  }

  private getChannelForSocket(ws: WebSocket): string | null {
    for (const [channelId, room] of this.rooms.entries()) {
      if (room.has(ws)) return channelId;
    }
    return null;
  }

  broadcast(channelId: string, message: ServerMessage, exclude?: WebSocket): void {
    const room = this.rooms.get(channelId);
    if (!room) return;

    const data = JSON.stringify(message);
    for (const ws of room) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, { type: 'error', data: { error } });
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getMemberCount(channelId?: string): number {
    if (channelId) {
      return this.rooms.get(channelId)?.size ?? 0;
    }
    return this.members.size;
  }

  getStore(): MessageStore {
    return this.store;
  }
}
