import { createClient } from 'redis';
import { createLogger } from './lib';

const log = createLogger('nika:sessions');

export interface SessionStore {
  get(userId: string): Promise<string | null>;
  set(userId: string, sessionId: string): Promise<void>;
  close(): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, { value: string; expiresAt: number }>();
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  async get(userId: string): Promise<string | null> {
    const entry = this.sessions.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.sessions.delete(userId);
      return null;
    }
    return entry.value;
  }

  async set(userId: string, sessionId: string): Promise<void> {
    this.sessions.set(userId, { value: sessionId, expiresAt: Date.now() + this.ttlMs });
  }

  async close(): Promise<void> {
    this.sessions.clear();
  }
}

export interface RedisSessionStoreConfig {
  redisUrl: string;
  keyPrefix: string;
  ttlSeconds: number;
}

export class RedisSessionStore implements SessionStore {
  private redisUrl: string;
  private keyPrefix: string;
  private ttlSeconds: number;
  private client: ReturnType<typeof createClient> | null = null;
  private connectPromise: Promise<void> | null = null;
  private closed = false;

  constructor(config: RedisSessionStoreConfig) {
    this.redisUrl = config.redisUrl;
    this.keyPrefix = config.keyPrefix.replace(/:+$/, '');
    this.ttlSeconds = config.ttlSeconds;
  }

  private async getClient(): Promise<ReturnType<typeof createClient> | null> {
    if (this.closed) return null;
    if (this.client) return this.client;
    if (!this.connectPromise) {
      this.connectPromise = this.connect();
    }
    try {
      await this.connectPromise;
      return this.client;
    } catch {
      return null;
    }
  }

  private async connect(): Promise<void> {
    const client = createClient({ url: this.redisUrl });
    client.on('error', (error) => {
      log.warn('Redis session store error', { error: String(error) });
    });

    await client.connect();
    this.client = client;
    log.info('Redis session store connected');
  }

  private key(userId: string): string {
    return `${this.keyPrefix}:x:${userId}`;
  }

  async get(userId: string): Promise<string | null> {
    const client = await this.getClient();
    if (!client) return null;
    try {
      const value = await client.get(this.key(userId));
      return value || null;
    } catch (error) {
      log.warn('Redis session get failed', { error: String(error) });
      return null;
    }
  }

  async set(userId: string, sessionId: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    try {
      await client.set(this.key(userId), sessionId, { EX: this.ttlSeconds });
    } catch (error) {
      log.warn('Redis session set failed', { error: String(error) });
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    const client = this.client;
    this.client = null;
    if (!client) return;

    try {
      await client.quit();
    } catch (error) {
      log.warn('Redis session store quit failed', { error: String(error) });
    }
  }
}
