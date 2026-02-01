import type { ChannelMessage } from './types.js';

const DEFAULT_MAX_HISTORY = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class MessageStore {
  private messages: Map<string, ChannelMessage[]> = new Map();
  private maxHistorySize: number;

  constructor(config: { maxHistorySize?: number } = {}) {
    this.maxHistorySize = config.maxHistorySize ?? DEFAULT_MAX_HISTORY;
  }

  saveMessage(msg: ChannelMessage): void {
    if (!msg.channelId || !msg.id) return;

    let channelMessages = this.messages.get(msg.channelId);
    if (!channelMessages) {
      channelMessages = [];
      this.messages.set(msg.channelId, channelMessages);
    }

    channelMessages.push(msg);

    if (channelMessages.length > this.maxHistorySize) {
      channelMessages.shift();
    }
  }

  getHistory(
    channelId: string,
    limit?: number,
    before?: number
  ): ChannelMessage[] {
    const channelMessages = this.messages.get(channelId);
    if (!channelMessages) return [];

    let filtered = channelMessages;
    if (before !== undefined) {
      filtered = channelMessages.filter((m) => m.timestamp < before);
    }

    const effectiveLimit = limit ?? 50;
    return filtered.slice(-effectiveLimit);
  }

  pruneOld(maxAgeDays: number): number {
    const cutoff = Date.now() - maxAgeDays * MS_PER_DAY;
    let pruned = 0;

    for (const [channelId, messages] of this.messages.entries()) {
      const before = messages.length;
      const remaining = messages.filter((m) => m.timestamp >= cutoff);
      pruned += before - remaining.length;

      if (remaining.length === 0) {
        this.messages.delete(channelId);
      } else {
        this.messages.set(channelId, remaining);
      }
    }

    return pruned;
  }

  getChannelCount(): number {
    return this.messages.size;
  }

  getMessageCount(channelId?: string): number {
    if (channelId) {
      return this.messages.get(channelId)?.length ?? 0;
    }

    let total = 0;
    for (const messages of this.messages.values()) {
      total += messages.length;
    }
    return total;
  }

  clear(channelId?: string): void {
    if (channelId) {
      this.messages.delete(channelId);
    } else {
      this.messages.clear();
    }
  }
}
