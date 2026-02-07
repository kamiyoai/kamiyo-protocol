/**
 * ZK-gated channel routes.
 *
 * Note: This file currently uses in-memory mock data. It is meant to exercise the
 * join/token flow and WebSocket integration, not to be a production data store.
 */

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { randomBytes } from 'crypto';
import { logger } from '../../logger';
import { getChannelServer } from '../../channels/ws-server';

const router: IRouter = Router();

/**
 * Channel tier requirements (0-4 mapping to reputation thresholds).
 * Keep this aligned with the tiering used by the ZK reputation system.
 */
type ChannelTier = 0 | 1 | 2 | 3 | 4;

interface Channel {
  id: string;
  name: string;
  description: string;
  requiredTier: ChannelTier;
  memberCount: number;
  isPrivate: boolean;
  createdAt: number;
}

interface ChannelMessage {
  id: string;
  channelId: string;
  sender: string;
  content: string;
  timestamp: number;
}

/**
 * Mock channel data.
 * Replace with persistent storage once the channel registry is finalized.
 */
const CHANNELS: Map<string, Channel> = new Map([
  ['general', {
    id: 'general',
    name: 'General',
    description: 'Open discussion channel for all members',
    requiredTier: 0,
    memberCount: 1247,
    isPrivate: false,
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
  }],
  ['trading', {
    id: 'trading',
    name: 'Trading Signals',
    description: 'Trading discussions and market analysis',
    requiredTier: 1,
    memberCount: 523,
    isPrivate: false,
    createdAt: Date.now() - 25 * 24 * 60 * 60 * 1000,
  }],
  ['alpha', {
    id: 'alpha',
    name: 'Alpha Leaks',
    description: 'Verified alpha and early opportunities',
    requiredTier: 2,
    memberCount: 189,
    isPrivate: true,
    createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
  }],
  ['whale-chat', {
    id: 'whale-chat',
    name: 'Whale Chat',
    description: 'High-tier member discussions',
    requiredTier: 3,
    memberCount: 47,
    isPrivate: true,
    createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
  }],
  ['inner-circle', {
    id: 'inner-circle',
    name: 'Inner Circle',
    description: 'Platinum members only',
    requiredTier: 4,
    memberCount: 12,
    isPrivate: true,
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
  }],
]);

/**
 * Mock message history.
 * This is only used by the REST read endpoint; real-time messages come via WS.
 */
const MOCK_MESSAGES: ChannelMessage[] = [
  { id: 'msg-001', channelId: 'general', sender: 'anon-a1b2', content: 'gm everyone', timestamp: Date.now() - 3600000 },
  { id: 'msg-002', channelId: 'general', sender: 'anon-c3d4', content: 'market looking bullish today', timestamp: Date.now() - 3000000 },
  { id: 'msg-003', channelId: 'general', sender: 'anon-e5f6', content: 'any updates on the protocol?', timestamp: Date.now() - 2400000 },
  { id: 'msg-004', channelId: 'trading', sender: 'anon-g7h8', content: 'watching BTC closely at 52k', timestamp: Date.now() - 1800000 },
  { id: 'msg-005', channelId: 'trading', sender: 'anon-i9j0', content: 'ETH/BTC ratio looking interesting', timestamp: Date.now() - 1200000 },
  { id: 'msg-006', channelId: 'alpha', sender: 'anon-k1l2', content: 'new listing incoming...', timestamp: Date.now() - 600000 },
];

/**
 * Tier name mapping (aligned with trust graph tiers).
 * These are display labels only; authorization is based on the numeric tier.
 */
const TIER_NAMES: Record<ChannelTier, string> = {
  0: 'Ghost', // unverified
  1: 'Scout', // emerging reputation
  2: 'Architect', // established trust
  3: 'Sentinel', // high trust
  4: 'Oracle', // highest trust
};

interface JoinChannelBody {
  proof: {
    nullifierHash: string;
    tier: number;
    proofBytes: string;
  };
}

// POST /api/channels/:id/join
router.post('/:id/join', async (req: Request, res: Response) => {
  const channelId = req.params.id;
  const body = req.body as JoinChannelBody;

  // Validate channel exists
  const channel = CHANNELS.get(channelId);
  if (!channel) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Channel not found' },
    });
    return;
  }

  // Validate proof structure
  if (!body.proof || typeof body.proof.nullifierHash !== 'string' ||
      typeof body.proof.tier !== 'number' || typeof body.proof.proofBytes !== 'string') {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid proof structure. Required: { nullifierHash, tier, proofBytes }',
      },
    });
    return;
  }

  // Validate tier requirement
  if (body.proof.tier < channel.requiredTier) {
    res.status(403).json({
      error: {
        code: 'INSUFFICIENT_TIER',
        message: `Channel requires ${TIER_NAMES[channel.requiredTier]} tier (${channel.requiredTier}), proof shows tier ${body.proof.tier}`,
      },
    });
    return;
  }

  // Basic sanity check. Production should verify the ZK proof.
  if (body.proof.proofBytes.length < 32) {
    res.status(400).json({
      error: { code: 'INVALID_PROOF', message: 'Proof bytes too short' },
    });
    return;
  }

  try {
    const accessToken = randomBytes(32).toString('hex');

    const channelServer = getChannelServer();
    channelServer.registerToken(
      accessToken,
      channelId,
      body.proof.nullifierHash,
      body.proof.tier
    );

    const wsHost = process.env.WS_HOST || 'ws.kamiyo.ai';
    const wsUrl = `wss://${wsHost}/ws/channels?token=${accessToken}`;

    logger.info('Channel join successful', {
      channelId,
      tier: body.proof.tier,
      nullifier: body.proof.nullifierHash.slice(0, 16) + '...',
    });

    res.json({
      success: true,
      wsUrl,
      accessToken,
      channel: {
        id: channel.id,
        name: channel.name,
        memberCount: channel.memberCount + channelServer.getStats().connections,
      },
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h access
    });
  } catch (err) {
    logger.error('Channel join failed', { error: String(err), channelId });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to join channel' },
    });
  }
});

// GET /api/channels/:id/messages
router.get('/:id/messages', async (req: Request, res: Response) => {
  const channelId = req.params.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
  const before = req.query.before ? parseInt(req.query.before as string) : Date.now();

  // Validate channel exists
  const channel = CHANNELS.get(channelId);
  if (!channel) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Channel not found' },
    });
    return;
  }

  try {
    // Filter messages for this channel
    const channelMessages = MOCK_MESSAGES
      .filter(m => m.channelId === channelId && m.timestamp < before)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    const hasMore = channelMessages.length === limit;
    const oldestTimestamp = channelMessages.length > 0
      ? channelMessages[channelMessages.length - 1].timestamp
      : null;

    res.json({
      messages: channelMessages,
      pagination: {
        limit,
        hasMore,
        before: oldestTimestamp,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch messages', { error: String(err), channelId });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch messages' },
    });
  }
});

// GET /api/channels
router.get('/', async (_req: Request, res: Response) => {
  try {
    const channels = Array.from(CHANNELS.values()).map(channel => ({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      requiredTier: channel.requiredTier,
      requiredTierName: TIER_NAMES[channel.requiredTier],
      memberCount: channel.memberCount,
      isPrivate: channel.isPrivate,
    }));

    res.json({
      channels,
      total: channels.length,
    });
  } catch (err) {
    logger.error('Failed to list channels', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list channels' },
    });
  }
});

// GET /api/channels/:id
router.get('/:id', async (req: Request, res: Response) => {
  const channelId = req.params.id;

  const channel = CHANNELS.get(channelId);
  if (!channel) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Channel not found' },
    });
    return;
  }

  res.json({
    id: channel.id,
    name: channel.name,
    description: channel.description,
    requiredTier: channel.requiredTier,
    requiredTierName: TIER_NAMES[channel.requiredTier],
    memberCount: channel.memberCount,
    isPrivate: channel.isPrivate,
    createdAt: channel.createdAt,
  });
});

export default router;
