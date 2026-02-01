import WebSocket from 'ws';
import type {
  ChannelMessage,
  ChannelClientConfig,
  ServerMessage,
  ClientPayload,
} from './types.js';

type MessageHandler = (msg: ChannelMessage) => void;
type JoinHandler = (nullifier: string) => void;
type LeaveHandler = (nullifier: string) => void;
type ErrorHandler = (error: string) => void;
type HistoryHandler = (messages: ChannelMessage[]) => void;

const DEFAULT_RECONNECT_INTERVAL = 3000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

export class ChannelClient {
  private config: ChannelClientConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private manualDisconnect = false;

  private onMessage: MessageHandler | null = null;
  private onJoin: JoinHandler | null = null;
  private onLeave: LeaveHandler | null = null;
  private onError: ErrorHandler | null = null;
  private onHistory: HistoryHandler | null = null;
  private onConnect: (() => void) | null = null;
  private onDisconnect: (() => void) | null = null;

  constructor(config: ChannelClientConfig) {
    this.config = {
      reconnect: true,
      reconnectIntervalMs: DEFAULT_RECONNECT_INTERVAL,
      maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
      ...config,
    };
  }

  async connect(): Promise<void> {
    if (this.ws || this.isConnecting) return;

    this.manualDisconnect = false;
    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.on('open', () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.sendJoin();
          this.onConnect?.();
          resolve();
        });

        this.ws.on('message', (raw) => this.handleMessage(raw));

        this.ws.on('close', () => {
          this.ws = null;
          this.isConnecting = false;
          this.onDisconnect?.();

          if (!this.manualDisconnect && this.config.reconnect) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (err) => {
          this.isConnecting = false;
          if (this.reconnectAttempts === 0) {
            reject(err);
          }
          this.onError?.(err.message);
        });
      } catch (err) {
        this.isConnecting = false;
        reject(err);
      }
    });
  }

  disconnect(): void {
    this.manualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.sendPayload({ type: 'leave' });
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  send(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onError?.('Not connected');
      return;
    }

    this.sendPayload({ type: 'message', content });
  }

  on(event: 'message', handler: MessageHandler): void;
  on(event: 'join', handler: JoinHandler): void;
  on(event: 'leave', handler: LeaveHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'history', handler: HistoryHandler): void;
  on(event: 'connect', handler: () => void): void;
  on(event: 'disconnect', handler: () => void): void;
  on(
    event: 'message' | 'join' | 'leave' | 'error' | 'history' | 'connect' | 'disconnect',
    handler: MessageHandler | JoinHandler | LeaveHandler | ErrorHandler | HistoryHandler | (() => void)
  ): void {
    switch (event) {
      case 'message':
        this.onMessage = handler as MessageHandler;
        break;
      case 'join':
        this.onJoin = handler as JoinHandler;
        break;
      case 'leave':
        this.onLeave = handler as LeaveHandler;
        break;
      case 'error':
        this.onError = handler as ErrorHandler;
        break;
      case 'history':
        this.onHistory = handler as HistoryHandler;
        break;
      case 'connect':
        this.onConnect = handler as () => void;
        break;
      case 'disconnect':
        this.onDisconnect = handler as () => void;
        break;
    }
  }

  off(event: string): void {
    switch (event) {
      case 'message':
        this.onMessage = null;
        break;
      case 'join':
        this.onJoin = null;
        break;
      case 'leave':
        this.onLeave = null;
        break;
      case 'error':
        this.onError = null;
        break;
      case 'history':
        this.onHistory = null;
        break;
      case 'connect':
        this.onConnect = null;
        break;
      case 'disconnect':
        this.onDisconnect = null;
        break;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private sendJoin(): void {
    this.sendPayload({ type: 'join', token: this.config.token });
  }

  private sendPayload(payload: ClientPayload): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private handleMessage(raw: Buffer | ArrayBuffer | Buffer[]): void {
    let message: ServerMessage;

    try {
      message = JSON.parse(raw.toString()) as ServerMessage;
    } catch {
      this.onError?.('Invalid server message');
      return;
    }

    switch (message.type) {
      case 'message':
        this.onMessage?.(message.data as ChannelMessage);
        break;
      case 'join':
        this.onJoin?.((message.data as { nullifier: string }).nullifier);
        break;
      case 'leave':
        this.onLeave?.((message.data as { nullifier: string }).nullifier);
        break;
      case 'error':
        this.onError?.((message.data as { error: string }).error);
        break;
      case 'history':
        this.onHistory?.(message.data as ChannelMessage[]);
        break;
    }
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.config.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;

    if (this.reconnectAttempts >= maxAttempts) {
      this.onError?.('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const interval = this.config.reconnectIntervalMs ?? DEFAULT_RECONNECT_INTERVAL;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, interval);
  }
}
