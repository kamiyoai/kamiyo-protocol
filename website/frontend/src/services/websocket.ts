/**
 * WebSocket Service
 * Manages WebSocket connection for real-time exploit updates
 */

import { WebSocketMessage } from '@/types';

type MessageHandler = (message: WebSocketMessage) => void;
type ConnectionHandler = (connected: boolean) => void;
type ErrorHandler = (error: string) => void;

interface WebSocketServiceConfig {
  url: string;
  token?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private config: WebSocketServiceConfig;
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isIntentionallyClosed = false;
  private messageQueue: WebSocketMessage[] = [];

  constructor(config: WebSocketServiceConfig) {
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 60000,
      ...config,
    };
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    this.isIntentionallyClosed = false;
    const url = this.config.token
      ? `${this.config.url}?token=${this.config.token}`
      : this.config.url;

    try {
      console.log('[WebSocket] Connecting to', this.config.url);
      this.ws = new WebSocket(url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.handleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    console.log('[WebSocket] Disconnecting');
    this.isIntentionallyClosed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send message to server
   */
  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Not connected, queuing message');
      this.messageQueue.push(message);
    }
  }

  /**
   * Subscribe to messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Subscribe to errors
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    console.log('[WebSocket] Connected');
    this.reconnectAttempts = 0;
    this.notifyConnectionChange(true);
    this.startHeartbeat();

    // Send queued messages
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      console.log('[WebSocket] Message received:', message.type);

      // Handle heartbeat
      if (message.type === 'heartbeat') {
        this.send({ type: 'heartbeat_ack' });
        return;
      }

      // Notify handlers
      this.messageHandlers.forEach((handler) => handler(message));
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(event: Event): void {
    console.error('[WebSocket] Error:', event);
    this.notifyError('WebSocket connection error');
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    console.log('[WebSocket] Closed:', event.code, event.reason);
    this.clearTimers();
    this.notifyConnectionChange(false);

    if (!this.isIntentionallyClosed) {
      this.handleReconnect();
    }
  }

  /**
   * Attempt to reconnect
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      console.error('[WebSocket] Max reconnection attempts reached');
      this.notifyError('Failed to reconnect after multiple attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval || 5000;

    console.log(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'heartbeat' });
      }
    }, this.config.heartbeatInterval || 60000);
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Notify connection handlers
   */
  private notifyConnectionChange(connected: boolean): void {
    this.connectionHandlers.forEach((handler) => handler(connected));
  }

  /**
   * Notify error handlers
   */
  private notifyError(error: string): void {
    this.errorHandlers.forEach((handler) => handler(error));
  }
}

// Singleton instance
let wsInstance: WebSocketService | null = null;

export const getWebSocketService = (token?: string): WebSocketService => {
  if (!wsInstance) {
    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
        window.location.host +
        '/ws';

    wsInstance = new WebSocketService({
      url: wsUrl,
      token,
    });
  }
  return wsInstance;
};

export default WebSocketService;
