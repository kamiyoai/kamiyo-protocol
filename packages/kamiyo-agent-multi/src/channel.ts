import { randomUUID } from 'crypto';

export interface ChannelMessage<T = unknown> {
  id: string;
  from: string;
  to: string | null; // null = broadcast
  topic: string;
  payload: T;
  timestamp: number;
  replyTo?: string;
}

export type MessageHandler<T = unknown> = (message: ChannelMessage<T>) => void | Promise<void>;

export class Channel<T = unknown> {
  private subscribers = new Map<string, Set<MessageHandler<T>>>();
  private broadcastHandlers = new Set<MessageHandler<T>>();
  private history: ChannelMessage<T>[] = [];
  private maxHistory: number;

  constructor(
    readonly name: string,
    opts?: { maxHistory?: number }
  ) {
    this.maxHistory = opts?.maxHistory ?? 1000;
  }

  subscribe(agentId: string, handler: MessageHandler<T>): () => void {
    let set = this.subscribers.get(agentId);
    if (!set) {
      set = new Set();
      this.subscribers.set(agentId, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  onBroadcast(handler: MessageHandler<T>): () => void {
    this.broadcastHandlers.add(handler);
    return () => this.broadcastHandlers.delete(handler);
  }

  async send(
    from: string,
    to: string,
    topic: string,
    payload: T,
    replyTo?: string
  ): Promise<ChannelMessage<T>> {
    const msg: ChannelMessage<T> = {
      id: randomUUID(),
      from,
      to,
      topic,
      payload,
      timestamp: Date.now(),
      replyTo,
    };

    this.pushHistory(msg);

    const handlers = this.subscribers.get(to);
    if (handlers) {
      for (const h of [...handlers]) {
        try {
          await h(msg);
        } catch {
          /* handler errors don't break send */
        }
      }
    }
    return msg;
  }

  async broadcast(from: string, topic: string, payload: T): Promise<ChannelMessage<T>> {
    const msg: ChannelMessage<T> = {
      id: randomUUID(),
      from,
      to: null,
      topic,
      payload,
      timestamp: Date.now(),
    };

    this.pushHistory(msg);

    for (const [agentId, handlers] of this.subscribers) {
      if (agentId === from) continue;
      for (const h of [...handlers]) {
        try {
          await h(msg);
        } catch {
          /* handler errors don't break broadcast */
        }
      }
    }
    for (const h of [...this.broadcastHandlers]) {
      try {
        await h(msg);
      } catch {
        /* handler errors don't break broadcast */
      }
    }

    return msg;
  }

  getHistory(opts?: { topic?: string; from?: string; limit?: number }): ChannelMessage<T>[] {
    let result = this.history;
    if (opts?.topic) result = result.filter(m => m.topic === opts.topic);
    if (opts?.from) result = result.filter(m => m.from === opts.from);
    const limit = opts?.limit ?? 50;
    return result.slice(-limit);
  }

  private pushHistory(msg: ChannelMessage<T>): void {
    this.history.push(msg);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  clear(): void {
    this.subscribers.clear();
    this.broadcastHandlers.clear();
    this.history = [];
  }
}
