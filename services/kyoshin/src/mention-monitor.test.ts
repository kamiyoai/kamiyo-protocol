import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetMentions, mockCreateXTools } = vi.hoisted(() => {
  const getMentions = vi.fn();
  const createXTools = vi.fn(() => [
    {
      name: 'get_mentions',
      handler: getMentions,
    },
  ]);
  return {
    mockGetMentions: getMentions,
    mockCreateXTools: createXTools,
  };
});

vi.mock('@kamiyo/agents', () => ({
  createXTools: mockCreateXTools,
}));

import { MentionMonitor } from './mention-monitor';

describe('MentionMonitor', () => {
  let tempDir: string;
  const activeMonitors: MentionMonitor[] = [];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kyoshin-mentions-'));
    mockGetMentions.mockReset();
    mockCreateXTools.mockClear();
  });

  afterEach(async () => {
    for (const monitor of activeMonitors.splice(0, activeMonitors.length)) {
      monitor.stop();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createMonitor(
    stateFilePath: string,
    onMention: (
      mentionId: string,
      mentionText: string,
      authorUsername: string,
      authorId: string | null
    ) => Promise<void>,
    conversationCooldownMs = 24 * 60 * 60 * 1000,
    maxMentionRetries = 3
  ): MentionMonitor {
    const monitor = new MentionMonitor({
      twitter: {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessSecret: 'test-access-secret',
      },
      checkIntervalMs: 60 * 60 * 1000,
      maxRepliesPerCycle: 10,
      maxMentionRetries,
      replyDelayMs: 0,
      startupDelayMs: 0,
      stateFilePath,
      conversationCooldownMs,
      onMention,
    });
    monitor.on('error', () => {});
    activeMonitors.push(monitor);
    return monitor;
  }

  it('persists processed mentions and does not re-reply after restart', async () => {
    const stateFilePath = path.join(tempDir, 'mention-state.json');
    const onMention = vi.fn(async () => {});

    mockGetMentions
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '1000000000000000000',
              text: 'older mention',
              authorId: 'author-a',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '1000000000000000001',
              text: 'new mention',
              authorId: 'author-a',
              conversationId: '2000000000000000000',
            },
          ],
        },
      });

    const firstMonitor = createMonitor(stateFilePath, onMention);
    await firstMonitor.start();
    firstMonitor.stop();

    expect(onMention).toHaveBeenCalledTimes(1);
    expect(onMention).toHaveBeenCalledWith('1000000000000000001', 'new mention', 'author-a', 'author-a');

    mockGetMentions.mockResolvedValueOnce({
      success: true,
      data: {
        mentions: [
          {
            id: '1000000000000000001',
            text: 'new mention',
            authorId: 'author-a',
            conversationId: '2000000000000000000',
          },
        ],
      },
    });

    const secondMonitor = createMonitor(stateFilePath, onMention);
    await secondMonitor.start();
    secondMonitor.stop();

    expect(onMention).toHaveBeenCalledTimes(1);
  });

  it('replies at most twice per conversation during cooldown', async () => {
    const stateFilePath = path.join(tempDir, 'conversation-state.json');
    const onMention = vi.fn(async () => {});

    mockGetMentions
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '3000000000000000000',
              text: 'prime',
              authorId: 'author-a',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '3000000000000000003',
              text: 'third ping',
              authorId: 'author-a',
              conversationId: '4000000000000000000',
            },
            {
              id: '3000000000000000002',
              text: 'second ping',
              authorId: 'author-a',
              conversationId: '4000000000000000000',
            },
            {
              id: '3000000000000000001',
              text: 'first ping',
              authorId: 'author-a',
              conversationId: '4000000000000000000',
            },
          ],
        },
      });

    const monitor = createMonitor(stateFilePath, onMention, 24 * 60 * 60 * 1000);
    await monitor.start();
    monitor.stop();

    expect(onMention).toHaveBeenCalledTimes(2);
    expect(onMention).toHaveBeenCalledWith('3000000000000000001', 'first ping', 'author-a', 'author-a');
    expect(onMention).toHaveBeenCalledWith('3000000000000000002', 'second ping', 'author-a', 'author-a');
  });

  it('never replies to blocked authors', async () => {
    const stateFilePath = path.join(tempDir, 'blocked-author-state.json');
    const onMention = vi.fn(async () => {});

    mockGetMentions
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '6000000000000000000',
              text: 'prime',
              authorId: 'author-a',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '6000000000000000001',
              text: 'ping',
              authorId: 'author-b',
              authorUsername: 'ChatDKG',
              conversationId: '7000000000000000000',
            },
          ],
        },
      });

    const monitor = createMonitor(stateFilePath, onMention);
    await monitor.start();
    monitor.stop();

    expect(onMention).toHaveBeenCalledTimes(0);
  });

  it('retries failed mentions without skipping newer ones', async () => {
    const stateFilePath = path.join(tempDir, 'retry-state.json');
    const onMention = vi.fn(async (mentionId: string) => {
      if (mentionId === '5000000000000000001' && onMention.mock.calls.length === 1) {
        throw new Error('transient failure');
      }
    });

    mockGetMentions
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '5000000000000000000',
              text: 'prime',
              authorId: 'author-a',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '5000000000000000002',
              text: 'newer mention',
              authorId: 'author-a',
            },
            {
              id: '5000000000000000001',
              text: 'older mention',
              authorId: 'author-a',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          mentions: [
            {
              id: '5000000000000000002',
              text: 'newer mention',
              authorId: 'author-a',
            },
            {
              id: '5000000000000000001',
              text: 'older mention',
              authorId: 'author-a',
            },
          ],
        },
      });

    const monitor = createMonitor(stateFilePath, onMention);
    await monitor.start();
    await (monitor as unknown as { checkMentions: () => Promise<void> }).checkMentions();
    monitor.stop();

    expect(onMention).toHaveBeenCalledTimes(3);
    expect(onMention.mock.calls[0]?.[0]).toBe('5000000000000000001');
    expect(onMention.mock.calls[1]?.[0]).toBe('5000000000000000001');
    expect(onMention.mock.calls[2]?.[0]).toBe('5000000000000000002');
  });
});
