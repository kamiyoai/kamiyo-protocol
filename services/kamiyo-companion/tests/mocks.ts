import { vi } from 'vitest';

// Mock Twitter API
export function createMockTwitter() {
  const replies: Array<{ text: string; replyTo: string }> = [];

  return {
    v2: {
      me: vi.fn().mockResolvedValue({
        data: { id: '123456', username: 'KamiyoAI' },
      }),
      reply: vi.fn().mockImplementation(async (text: string, replyTo: string) => {
        replies.push({ text, replyTo });
        return { data: { id: `reply_${Date.now()}` } };
      }),
      userMentionTimeline: vi.fn().mockResolvedValue({
        data: { data: [] },
      }),
    },
    _replies: replies,
    _clearReplies: () => { replies.length = 0; },
  };
}

// Mock Anthropic API
export function createMockAnthropic() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          { type: 'text', text: "I'm here to help. What's the first small step?" },
        ],
      }),
    },
  };
}

// Mock Solana Connection
export function createMockConnection() {
  return {
    getSlot: vi.fn().mockResolvedValue(123456789),
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: 'mock_blockhash_abc123',
      lastValidBlockHeight: 100000,
    }),
    getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
      value: [],
    }),
    getParsedTransaction: vi.fn().mockResolvedValue({
      meta: { err: null },
      transaction: {
        message: {
          instructions: [
            {
              parsed: {
                type: 'transfer',
                info: {
                  destination: 'F7ZxVjxGvirpvkbcF8HUMofR81TkjHqKKS6ABxQYeEtV',
                  lamports: 500000000,
                },
              },
            },
          ],
        },
      },
    }),
  };
}

// Mock database for testing (in-memory)
export function createMockDb() {
  const users = new Map<string, { id: string; tier: string; wallet: string | null }>();
  const messages = new Map<string, Array<{ role: string; content: string }>>();
  const sessions = new Map<number, { userId: string; messageCount: number; ended: boolean }>();
  let sessionId = 0;

  return {
    getOrCreateUser: vi.fn((id: string) => {
      if (!users.has(id)) {
        users.set(id, { id, tier: 'free', wallet: null });
      }
      return users.get(id);
    }),
    updateUserWallet: vi.fn((userId: string, wallet: string) => {
      const user = users.get(userId);
      if (user) user.wallet = wallet;
    }),
    updateUserTier: vi.fn((userId: string, tier: string) => {
      const user = users.get(userId);
      if (user) user.tier = tier;
    }),
    getConversationHistory: vi.fn((userId: string) => {
      return messages.get(userId) || [];
    }),
    addMessage: vi.fn((userId: string, role: string, content: string) => {
      if (!messages.has(userId)) messages.set(userId, []);
      messages.get(userId)!.push({ role, content });
    }),
    clearConversationHistory: vi.fn((userId: string) => {
      messages.delete(userId);
    }),
    startSession: vi.fn((userId: string) => {
      const id = ++sessionId;
      sessions.set(id, { userId, messageCount: 0, ended: false });
      return id;
    }),
    endSession: vi.fn((id: number) => {
      const session = sessions.get(id);
      if (session) session.ended = true;
    }),
    getActiveSession: vi.fn((userId: string) => {
      for (const [id, session] of sessions) {
        if (session.userId === userId && !session.ended) {
          return { id, ...session };
        }
      }
      return null;
    }),
    incrementSessionMessages: vi.fn((id: number) => {
      const session = sessions.get(id);
      if (session) session.messageCount++;
    }),
    getActiveEscrowByUser: vi.fn(() => null),
    getActiveEscrowByWallet: vi.fn(() => null),
    _users: users,
    _messages: messages,
    _sessions: sessions,
    _reset: () => {
      users.clear();
      messages.clear();
      sessions.clear();
      sessionId = 0;
    },
  };
}

// Test tweet factory
export function createTweet(overrides: Partial<{
  id: string;
  text: string;
  author_id: string;
}> = {}) {
  return {
    id: overrides.id || `tweet_${Date.now()}`,
    text: overrides.text || '@KamiyoAI Hello!',
    author_id: overrides.author_id || 'user_123',
  };
}
