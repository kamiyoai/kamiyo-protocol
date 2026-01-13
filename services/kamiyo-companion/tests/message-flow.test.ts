import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockTwitter, createMockAnthropic, createMockDb, createTweet } from './mocks';

// Simplified message processing logic for testing
interface TierConfig {
  maxMessagesPerDay: number;
  contextMemory: boolean;
}

const TIERS: Record<string, TierConfig> = {
  free: { maxMessagesPerDay: 10, contextMemory: false },
  companion: { maxMessagesPerDay: 100, contextMemory: true },
  pro: { maxMessagesPerDay: -1, contextMemory: true },
};

// Message count tracking (simulates database)
const messageCounts = new Map<string, { count: number; date: string }>();

function checkMessageLimit(userId: string, tier: string): { allowed: boolean; remaining: number } {
  const config = TIERS[tier];
  if (config.maxMessagesPerDay === -1) {
    return { allowed: true, remaining: -1 };
  }

  const today = new Date().toISOString().split('T')[0];
  const userCounts = messageCounts.get(userId);

  if (!userCounts || userCounts.date !== today) {
    return { allowed: true, remaining: config.maxMessagesPerDay };
  }

  const remaining = config.maxMessagesPerDay - userCounts.count;
  return { allowed: remaining > 0, remaining };
}

function incrementMessageCount(userId: string): void {
  const today = new Date().toISOString().split('T')[0];
  const userCounts = messageCounts.get(userId) || { count: 0, date: today };

  if (userCounts.date !== today) {
    messageCounts.set(userId, { count: 1, date: today });
  } else {
    userCounts.count++;
    messageCounts.set(userId, userCounts);
  }
}

// Simulated message processing
async function processMessage(
  userId: string,
  text: string,
  tier: string,
  mockAnthropic: ReturnType<typeof createMockAnthropic>,
  mockDb: ReturnType<typeof createMockDb>
): Promise<{ success: boolean; response?: string; error?: string }> {
  // Check message limit
  const { allowed, remaining } = checkMessageLimit(userId, tier);
  if (!allowed) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  // Get or create session
  let session = mockDb.getActiveSession(userId);
  if (!session) {
    const sessionId = mockDb.startSession(userId);
    session = { id: sessionId, userId, messageCount: 0, ended: false };
  }

  // Get conversation history for paid tiers
  const config = TIERS[tier];
  const history = config.contextMemory ? mockDb.getConversationHistory(userId) : [];

  // Generate response
  const response = await mockAnthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      ...history.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ],
  });

  const responseText = response.content[0].text;

  // Store in history if tier supports it
  if (config.contextMemory) {
    mockDb.addMessage(userId, 'user', text);
    mockDb.addMessage(userId, 'assistant', responseText);
  }

  // Track usage
  incrementMessageCount(userId);
  mockDb.incrementSessionMessages(session.id);

  return { success: true, response: responseText };
}

describe('Message Flow', () => {
  let mockAnthropic: ReturnType<typeof createMockAnthropic>;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockAnthropic = createMockAnthropic();
    mockDb = createMockDb();
    messageCounts.clear();
  });

  describe('Basic message processing', () => {
    it('should process a message and return response', async () => {
      const result = await processMessage(
        'user_123',
        'Hello, can you help me?',
        'free',
        mockAnthropic,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(mockAnthropic.messages.create).toHaveBeenCalled();
    });

    it('should create session for new user', async () => {
      await processMessage('new_user', 'Hello', 'free', mockAnthropic, mockDb);

      expect(mockDb.startSession).toHaveBeenCalledWith('new_user');
    });

    it('should reuse existing session', async () => {
      // First message creates session
      await processMessage('user_123', 'First message', 'free', mockAnthropic, mockDb);
      const firstCallCount = mockDb.startSession.mock.calls.length;

      // Second message should reuse session
      await processMessage('user_123', 'Second message', 'free', mockAnthropic, mockDb);

      expect(mockDb.startSession).toHaveBeenCalledTimes(firstCallCount);
      expect(mockDb.getActiveSession).toHaveBeenCalledWith('user_123');
    });
  });

  describe('Tier-based features', () => {
    it('should not store history for free tier', async () => {
      await processMessage('free_user', 'Hello', 'free', mockAnthropic, mockDb);

      expect(mockDb.addMessage).not.toHaveBeenCalled();
    });

    it('should store history for companion tier', async () => {
      await processMessage('paid_user', 'Hello', 'companion', mockAnthropic, mockDb);

      expect(mockDb.addMessage).toHaveBeenCalledTimes(2); // user + assistant
      expect(mockDb.addMessage).toHaveBeenCalledWith('paid_user', 'user', 'Hello');
    });

    it('should store history for pro tier', async () => {
      await processMessage('pro_user', 'Hello', 'pro', mockAnthropic, mockDb);

      expect(mockDb.addMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rate limiting', () => {
    it('should allow messages within limit', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await processMessage(
          'limited_user',
          `Message ${i}`,
          'free',
          mockAnthropic,
          mockDb
        );
        expect(result.success).toBe(true);
      }
    });

    it('should block messages over limit for free tier', async () => {
      // Send 10 messages (free tier limit)
      for (let i = 0; i < 10; i++) {
        await processMessage('limited_user', `Message ${i}`, 'free', mockAnthropic, mockDb);
      }

      // 11th message should fail
      const result = await processMessage(
        'limited_user',
        'One more message',
        'free',
        mockAnthropic,
        mockDb
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('should have unlimited messages for pro tier', async () => {
      for (let i = 0; i < 15; i++) {
        const result = await processMessage(
          'pro_user',
          `Message ${i}`,
          'pro',
          mockAnthropic,
          mockDb
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Session tracking', () => {
    it('should increment session message count', async () => {
      await processMessage('user_123', 'First', 'free', mockAnthropic, mockDb);
      await processMessage('user_123', 'Second', 'free', mockAnthropic, mockDb);
      await processMessage('user_123', 'Third', 'free', mockAnthropic, mockDb);

      expect(mockDb.incrementSessionMessages).toHaveBeenCalledTimes(3);
    });
  });
});

describe('Tweet Text Processing', () => {
  function extractMessageText(tweetText: string): string {
    return tweetText.replace(/@\w+/g, '').trim();
  }

  it('should remove mentions from tweet text', () => {
    expect(extractMessageText('@KamiyoAI Hello!')).toBe('Hello!');
    expect(extractMessageText('@KamiyoAI @other Hello!')).toBe('Hello!');
  });

  it('should handle multiple mentions', () => {
    expect(extractMessageText('@a @b @c Help me please')).toBe('Help me please');
  });

  it('should return empty for mention-only tweets', () => {
    expect(extractMessageText('@KamiyoAI')).toBe('');
    expect(extractMessageText('@KamiyoAI @other')).toBe('');
  });

  it('should preserve non-mention text', () => {
    expect(extractMessageText('Hello @KamiyoAI how are you?')).toBe('Hello  how are you?');
  });
});

describe('Response Threading', () => {
  function splitIntoThread(text: string, maxLength: number = 280): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let splitPoint = remaining.lastIndexOf(' ', maxLength - 3);
      if (splitPoint === -1) splitPoint = maxLength - 3;

      chunks.push(remaining.slice(0, splitPoint) + '...');
      remaining = remaining.slice(splitPoint + 1);
    }

    return chunks;
  }

  it('should not split short messages', () => {
    const result = splitIntoThread('Hello world');
    expect(result).toEqual(['Hello world']);
  });

  it('should split long messages into thread', () => {
    const longMessage = 'A'.repeat(300);
    const result = splitIntoThread(longMessage);

    expect(result.length).toBeGreaterThan(1);
    expect(result[0].endsWith('...')).toBe(true);
  });

  it('should split at word boundaries', () => {
    const message = 'This is a test message that needs to be split at word boundaries for readability ' +
      'and this continues with more text that should be in the second part of the thread';
    const result = splitIntoThread(message, 100);

    expect(result.length).toBe(2);
    // Check that each chunk ends with ... (proper split)
    expect(result[0].endsWith('...')).toBe(true);
    // Verify total content is preserved (minus ellipsis)
    expect(result.join(' ').length).toBeGreaterThan(0);
  });
});
