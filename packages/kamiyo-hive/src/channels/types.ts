import type { WebSocket } from 'ws';

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderNullifier: string;
  content: string;
  timestamp: number;
}

export interface ChannelMember {
  nullifier: string;
  joinedAt: number;
  ws?: WebSocket;
}

export interface ChannelAccessToken {
  channelId: string;
  nullifier: string;
  proof: string;
  expiresAt: number;
}

export interface SendMessagePayload {
  type: 'message';
  content: string;
}

export interface JoinPayload {
  type: 'join';
  token: string;
}

export interface LeavePayload {
  type: 'leave';
}

export type ClientPayload = SendMessagePayload | JoinPayload | LeavePayload;

export interface ServerMessage {
  type: 'message' | 'join' | 'leave' | 'error' | 'history';
  data: ChannelMessage | ChannelMessage[] | { nullifier: string } | { error: string };
}

export interface ChannelServerConfig {
  port: number;
  host?: string;
  maxHistorySize?: number;
  pruneIntervalMs?: number;
  maxMessageAgeDays?: number;
}

export interface ChannelClientConfig {
  url: string;
  token: string;
  reconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
}
