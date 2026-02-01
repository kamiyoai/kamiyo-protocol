// Enhanced Chat completion endpoint
// Hybrid Anthropic/Grok with memory, caching, signals, and ZK reputation

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
import { getContext, formatContextForPrompt } from '../../crypto-context';
import { getTrendingContext, formatTrendingForPrompt } from '../../trend-engine';
import { searchWithTools, searchXHandles, isGrokToolsAvailable } from '../../grok-tools';
import { logger } from '../../logger';
import db, { isDailySpendCapExceeded, incrementDailyApiSpend, getDailySpendStatus } from '../../db';

const router: IRouter = Router();

let anthropicClient: Anthropic | null = null;

export function setAnthropicClient(client: Anthropic): void {
  anthropicClient = client;
}

// Conversation memory table for API users (by wallet)
const initApiConversations = db.prepare(`
  CREATE TABLE IF NOT EXISTS api_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);
try { initApiConversations.run(); } catch { /* table exists */ }

const initApiConversationsIndex = db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_api_conversations_wallet ON api_conversations(wallet)
`);
try { initApiConversationsIndex.run(); } catch { /* index exists */ }

// Memory operations
function getApiConversationHistory(wallet: string, limit = 10): Array<{ role: string; content: string }> {
  return db.prepare(`
    SELECT role, content FROM api_conversations
    WHERE wallet = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(wallet, limit).reverse() as Array<{ role: string; content: string }>;
}

function addApiMessage(wallet: string, role: string, content: string): void {
  db.prepare('INSERT INTO api_conversations (wallet, role, content) VALUES (?, ?, ?)').run(wallet, role, content);
  // Prune old messages (keep last 50)
  db.prepare(`
    DELETE FROM api_conversations WHERE wallet = ? AND id NOT IN (
      SELECT id FROM api_conversations WHERE wallet = ? ORDER BY created_at DESC LIMIT 50
    )
  `).run(wallet, wallet);
}

function clearApiConversationHistory(wallet: string): void {
  db.prepare('DELETE FROM api_conversations WHERE wallet = ?').run(wallet);
}

// Cached crypto context (prompt caching)
interface CachedContext {
  content: string;
  data: Record<string, unknown>;
  fetchedAt: number;
}
let cachedCryptoContext: CachedContext | null = null;
const CONTEXT_CACHE_TTL = 60 * 1000; // 1 minute

async function getCachedCryptoContext(): Promise<CachedContext> {
  if (cachedCryptoContext && (Date.now() - cachedCryptoContext.fetchedAt) < CONTEXT_CACHE_TTL) {
    return cachedCryptoContext;
  }

  const ctx = await getContext();
  const content = formatContextForPrompt(ctx);
  const data = {
    btcPrice: ctx.btcPrice,
    ethPrice: ctx.ethPrice,
    kamiyoPrice: ctx.kamiyo?.priceUsd,
    kamiyoChange24h: ctx.kamiyo?.priceChange24h,
    kamiyoVolume: ctx.kamiyo?.volume24h,
    kamiyoMcap: ctx.kamiyo?.marketCap,
    sentiment: ctx.marketSentiment,
  };

  cachedCryptoContext = { content, data, fetchedAt: Date.now() };
  return cachedCryptoContext;
}

// Proprietary market signals
interface MarketSignals {
  momentum: 'bullish' | 'bearish' | 'neutral';
  volatility: 'high' | 'medium' | 'low';
  whaleActivity: 'accumulating' | 'distributing' | 'neutral';
  trendStrength: number; // 0-100
}

async function getMarketSignals(cryptoCtx: CachedContext): Promise<MarketSignals> {
  const btcPrice = cryptoCtx.data.btcPrice as number || 0;
  const sentiment = cryptoCtx.data.sentiment as string || 'neutral';
  const fearGreed = cryptoCtx.data.fearGreedIndex as number || 50;

  // Simple signal derivation (would be more sophisticated in production)
  let momentum: MarketSignals['momentum'] = 'neutral';
  if (fearGreed > 60) momentum = 'bullish';
  else if (fearGreed < 40) momentum = 'bearish';

  let volatility: MarketSignals['volatility'] = 'medium';
  // Would calculate from price history in production

  let whaleActivity: MarketSignals['whaleActivity'] = 'neutral';
  // Would analyze on-chain data in production

  const trendStrength = Math.abs(fearGreed - 50) * 2;

  return { momentum, volatility, whaleActivity, trendStrength };
}

function formatSignalsForPrompt(signals: MarketSignals): string {
  return `
## Market Signals (Proprietary)
- Momentum: ${signals.momentum.toUpperCase()}
- Volatility: ${signals.volatility}
- Whale Activity: ${signals.whaleActivity}
- Trend Strength: ${signals.trendStrength}/100
`;
}

// ZK Reputation integration
interface ReputationContext {
  tier: number;
  tierName: string;
  verified: boolean;
}

function getReputationContext(req: Request): ReputationContext {
  // Extract from JWT payload (set by auth middleware)
  const auth = req.auth;
  const tier = (auth as any)?.reputationTier || 0;
  const tierNames = ['Default', 'Bronze', 'Silver', 'Gold', 'Platinum'];

  return {
    tier,
    tierName: tierNames[tier] || 'Default',
    verified: !!(auth as any)?.reputationProof,
  };
}

function formatReputationForPrompt(rep: ReputationContext): string {
  if (!rep.verified) return '';
  return `
## User Reputation
- Tier: ${rep.tierName} (Level ${rep.tier})
- ZK Verified: Yes
`;
}

const SYSTEM_PROMPT = `You are KAMIYO, a crypto-native AI with real-time market intelligence.

Core traits:
- Direct, concise, no fluff
- Deep crypto/DeFi knowledge
- Data-driven analysis
- No emojis unless requested

You have access to:
- Real-time prices (BTC, ETH, KAMIYO)
- Market sentiment and fear/greed index
- Proprietary trading signals
- X/Twitter trending topics
- User's ZK-verified reputation tier

When discussing markets, use the data provided. Never fabricate numbers.
For trading questions, provide analysis not financial advice.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  stream?: boolean;
  context?: {
    includeCrypto?: boolean;
    includeTrends?: boolean;
    includeSignals?: boolean;
    includeXSearch?: boolean;
    xSearchQuery?: string;
    xHandles?: string[];
  };
  clearHistory?: boolean;
}

const MAX_MESSAGE_LENGTH = 10000; // Max characters per message
const MAX_MESSAGES = 20; // Max messages per request

// POST /api/v1/chat
router.post('/', async (req: Request, res: Response) => {
  // Check daily spend cap before processing
  if (isDailySpendCapExceeded()) {
    const status = getDailySpendStatus();
    logger.warn('Daily spend cap exceeded', status);
    res.status(503).json({
      error: {
        code: 'SPEND_CAP_EXCEEDED',
        message: 'Daily API spend cap reached. Service will resume tomorrow.',
        details: {
          spentToday: `$${status.spendUsd.toFixed(2)}`,
          dailyCap: `$${status.capUsd.toFixed(2)}`,
          requestsToday: status.requestCount,
        },
      },
    });
    return;
  }

  // Validate content-type
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    res.status(415).json({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' },
    });
    return;
  }

  if (!anthropicClient) {
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Chat service not initialized' },
    });
    return;
  }

  const body = req.body as ChatRequest;
  const wallet = req.auth?.wallet;

  if (!wallet) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Wallet not found in token' },
    });
    return;
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Messages array is required' },
    });
    return;
  }

  // Limit number of messages
  if (body.messages.length > MAX_MESSAGES) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: `Maximum ${MAX_MESSAGES} messages per request` },
    });
    return;
  }

  // Validate messages
  for (const msg of body.messages) {
    if (!msg.role || !msg.content) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'Each message must have role and content' },
      });
      return;
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'Role must be user or assistant' },
      });
      return;
    }
    // Validate message length
    if (typeof msg.content !== 'string' || msg.content.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: `Message content must be a string under ${MAX_MESSAGE_LENGTH} characters` },
      });
      return;
    }
  }

  // Clear history if requested
  if (body.clearHistory) {
    clearApiConversationHistory(wallet);
  }

  try {
    // Build context pieces
    const contextParts: string[] = [];
    const contextData: Record<string, unknown> = {};

    // 1. Crypto context (cached)
    if (body.context?.includeCrypto !== false) {
      const cryptoCtx = await getCachedCryptoContext();
      contextParts.push(cryptoCtx.content);
      Object.assign(contextData, cryptoCtx.data);

      // 2. Proprietary market signals
      if (body.context?.includeSignals !== false) {
        const signals = await getMarketSignals(cryptoCtx);
        contextParts.push(formatSignalsForPrompt(signals));
        contextData.signals = signals;
      }
    }

    // 3. Trending topics from Grok/X
    if (body.context?.includeTrends) {
      const trendCtx = await getTrendingContext();
      if (trendCtx) {
        contextParts.push(formatTrendingForPrompt(trendCtx));
        contextData.trending = trendCtx.topics;
      }
    }

    // 4. Real-time X search via Grok
    if (body.context?.includeXSearch && isGrokToolsAvailable()) {
      const query = body.context.xSearchQuery || body.messages[body.messages.length - 1].content;

      if (body.context.xHandles && body.context.xHandles.length > 0) {
        // Search specific handles
        const xContent = await searchXHandles(body.context.xHandles, 4);
        if (xContent) {
          contextParts.push(`\n## Recent from ${body.context.xHandles.map(h => '@' + h).join(', ')}\n${xContent}`);
          contextData.xSearch = { type: 'handles', handles: body.context.xHandles };
        }
      } else {
        // General search
        const searchResult = await searchWithTools(query);
        if (searchResult?.content) {
          contextParts.push(`\n## X Search Results\n${searchResult.content}`);
          contextData.xSearch = { type: 'query', query };
        }
      }
    }

    // 5. ZK Reputation context
    const repContext = getReputationContext(req);
    if (repContext.verified) {
      contextParts.push(formatReputationForPrompt(repContext));
      contextData.reputation = repContext;
    }

    // Build full system prompt
    const systemPrompt = SYSTEM_PROMPT + (contextParts.length > 0 ? '\n\n' + contextParts.join('\n') : '');

    // Get conversation history (memory)
    const history = getApiConversationHistory(wallet, 10);

    // Combine history with new messages
    const allMessages = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ...body.messages,
    ];

    // Store user's latest message
    const lastUserMsg = body.messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      addApiMessage(wallet, 'user', lastUserMsg.content);
    }

    // Streaming response
    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullResponse = '';

      const stream = anthropicClient.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: allMessages.map(m => ({ role: m.role, content: m.content })),
      });

      stream.on('text', (text) => {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
      });

      stream.on('error', (err) => {
        logger.error('Stream error', { error: String(err) });
        res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
        res.end();
      });

      stream.on('message', (message) => {
        // Track API cost when message completes
        if (message.usage) {
          const inputCostMicro = Math.ceil((message.usage.input_tokens / 1_000_000) * 3 * 1_000_000);
          const outputCostMicro = Math.ceil((message.usage.output_tokens / 1_000_000) * 15 * 1_000_000);
          incrementDailyApiSpend(inputCostMicro + outputCostMicro);
        }
      });

      stream.on('end', () => {
        // Store assistant response in memory
        if (fullResponse) {
          addApiMessage(wallet, 'assistant', fullResponse);
        }
        res.write(`data: ${JSON.stringify({ context: contextData })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });

      req.on('close', () => {
        stream.abort();
      });

      return;
    }

    // Non-streaming response
    const response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: allMessages.map(m => ({ role: m.role, content: m.content })),
    });

    // Track actual API cost based on token usage
    // Claude Sonnet 4 pricing: $3/M input, $15/M output
    const inputCostMicro = Math.ceil((response.usage.input_tokens / 1_000_000) * 3 * 1_000_000);
    const outputCostMicro = Math.ceil((response.usage.output_tokens / 1_000_000) * 15 * 1_000_000);
    const totalCostMicro = inputCostMicro + outputCostMicro;
    incrementDailyApiSpend(totalCostMicro);

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Store assistant response in memory
    addApiMessage(wallet, 'assistant', content);

    res.json({
      id: `chat_${randomBytes(8).toString('hex')}`,
      message: {
        role: 'assistant',
        content,
      },
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      context: contextData,
      memory: {
        historyLength: history.length + 1,
        wallet: wallet.slice(0, 8) + '...',
      },
    });
  } catch (err) {
    logger.error('Chat completion failed', { error: String(err), wallet: wallet?.slice(0, 8) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Chat completion failed' },
    });
  }
});

// DELETE /api/v1/chat/history - Clear conversation history
router.delete('/history', async (req: Request, res: Response) => {
  const wallet = req.auth?.wallet;
  if (!wallet) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Wallet not found' } });
    return;
  }

  clearApiConversationHistory(wallet);
  res.json({ success: true, message: 'Conversation history cleared' });
});

// GET /api/v1/chat/history - Get conversation history
router.get('/history', async (req: Request, res: Response) => {
  const wallet = req.auth?.wallet;
  if (!wallet) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Wallet not found' } });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const history = getApiConversationHistory(wallet, limit);

  res.json({
    messages: history,
    count: history.length,
  });
});

export default router;
