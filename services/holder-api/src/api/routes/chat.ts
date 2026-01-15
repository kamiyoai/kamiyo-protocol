import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
import { getContext, formatContextForPrompt } from '../../crypto-context.js';
import { getTrendingContext, formatTrendingForPrompt } from '../../trend-engine.js';
import { searchWithTools, searchXHandles, isGrokToolsAvailable } from '../../grok-tools.js';
import { logger } from '../../logger.js';
import {
  getApiConversationHistory,
  addApiMessage,
  clearApiConversationHistory,
} from '../../db.js';

const router: IRouter = Router();

let anthropicClient: Anthropic | null = null;

export function setAnthropicClient(client: Anthropic): void {
  anthropicClient = client;
}

interface CachedContext {
  content: string;
  data: Record<string, unknown>;
  fetchedAt: number;
}
let cachedCryptoContext: CachedContext | null = null;
const CONTEXT_CACHE_TTL = 60 * 1000;

async function getCachedCryptoContext(): Promise<CachedContext> {
  if (cachedCryptoContext && Date.now() - cachedCryptoContext.fetchedAt < CONTEXT_CACHE_TTL) {
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

interface MarketSignals {
  momentum: 'bullish' | 'bearish' | 'neutral';
  volatility: 'high' | 'medium' | 'low';
  whaleActivity: 'accumulating' | 'distributing' | 'neutral';
  trendStrength: number;
}

async function getMarketSignals(cryptoCtx: CachedContext): Promise<MarketSignals> {
  const sentiment = (cryptoCtx.data.sentiment as string) || 'neutral';

  let momentum: MarketSignals['momentum'] = 'neutral';
  if (sentiment === 'greed') momentum = 'bullish';
  else if (sentiment === 'fear') momentum = 'bearish';

  const volatility: MarketSignals['volatility'] = 'medium';
  const whaleActivity: MarketSignals['whaleActivity'] = 'neutral';
  const trendStrength = momentum === 'neutral' ? 25 : 50;

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

const SYSTEM_PROMPT = `You are a crypto-native AI with real-time market intelligence.

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

router.post('/', async (req: Request, res: Response) => {
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
  }

  if (body.clearHistory) {
    clearApiConversationHistory(wallet);
  }

  try {
    const contextParts: string[] = [];
    const contextData: Record<string, unknown> = {};

    if (body.context?.includeCrypto !== false) {
      const cryptoCtx = await getCachedCryptoContext();
      contextParts.push(cryptoCtx.content);
      Object.assign(contextData, cryptoCtx.data);

      if (body.context?.includeSignals !== false) {
        const signals = await getMarketSignals(cryptoCtx);
        contextParts.push(formatSignalsForPrompt(signals));
        contextData.signals = signals;
      }
    }

    if (body.context?.includeTrends) {
      const trendCtx = await getTrendingContext();
      if (trendCtx) {
        contextParts.push(formatTrendingForPrompt(trendCtx));
        contextData.trending = trendCtx.topics;
      }
    }

    if (body.context?.includeXSearch && isGrokToolsAvailable()) {
      const query =
        body.context.xSearchQuery || body.messages[body.messages.length - 1].content;

      if (body.context.xHandles && body.context.xHandles.length > 0) {
        const xContent = await searchXHandles(body.context.xHandles, 4);
        if (xContent) {
          contextParts.push(
            `\n## Recent from ${body.context.xHandles.map((h) => '@' + h).join(', ')}\n${xContent}`
          );
          contextData.xSearch = { type: 'handles', handles: body.context.xHandles };
        }
      } else {
        const searchResult = await searchWithTools(query);
        if (searchResult?.content) {
          contextParts.push(`\n## X Search Results\n${searchResult.content}`);
          contextData.xSearch = { type: 'query', query };
        }
      }
    }

    const systemPrompt =
      SYSTEM_PROMPT + (contextParts.length > 0 ? '\n\n' + contextParts.join('\n') : '');

    const history = getApiConversationHistory(wallet, 10);

    const allMessages = [
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ...body.messages,
    ];

    const lastUserMsg = body.messages.filter((m) => m.role === 'user').pop();
    if (lastUserMsg) {
      addApiMessage(wallet, 'user', lastUserMsg.content);
    }

    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullResponse = '';

      const stream = anthropicClient.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
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

      stream.on('end', () => {
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

    const response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
    });

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

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

router.delete('/history', async (req: Request, res: Response) => {
  const wallet = req.auth?.wallet;
  if (!wallet) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Wallet not found' } });
    return;
  }

  clearApiConversationHistory(wallet);
  res.json({ success: true, message: 'Conversation history cleared' });
});

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
