// Chat completion endpoint

import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
import { getContext, formatContextForPrompt } from '../../crypto-context';
import { getTrendingContext, formatTrendingForPrompt } from '../../trend-engine';
import { logger } from '../../logger';

const router = Router();

// Shared Anthropic client - set in index.ts
let anthropicClient: Anthropic | null = null;

export function setAnthropicClient(client: Anthropic): void {
  anthropicClient = client;
}

const SYSTEM_PROMPT = `You are KAMIYO, a crypto-native AI assistant. You have access to real-time market data and trends.

Personality:
- Direct and concise
- Crypto-savvy, understand DeFi, NFTs, trading
- No emojis unless explicitly requested
- Technical but accessible

When discussing prices or market data, use the context provided. Don't make up numbers.`;

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
  };
}

// POST /api/v1/chat
router.post('/', async (req: Request, res: Response) => {
  if (!anthropicClient) {
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Chat service not initialized' },
    });
    return;
  }

  const body = req.body as ChatRequest;

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Messages array is required' },
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
  }

  try {
    // Build context
    let contextStr = '';
    let contextData: Record<string, unknown> = {};

    if (body.context?.includeCrypto !== false) {
      const cryptoCtx = await getContext();
      contextStr += formatContextForPrompt(cryptoCtx) + '\n\n';
      contextData = {
        btcPrice: cryptoCtx.btcPrice,
        ethPrice: cryptoCtx.ethPrice,
        kamiyoPrice: cryptoCtx.kamiyo?.priceUsd,
        sentiment: cryptoCtx.marketSentiment,
      };
    }

    if (body.context?.includeTrends) {
      const trendCtx = await getTrendingContext();
      if (trendCtx) {
        contextStr += formatTrendingForPrompt(trendCtx);
      }
    }

    const systemPrompt = SYSTEM_PROMPT + (contextStr ? `\n\n${contextStr}` : '');

    // Streaming response
    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = anthropicClient.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: body.messages.map(m => ({ role: m.role, content: m.content })),
      });

      stream.on('text', (text) => {
        res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
      });

      stream.on('error', (err) => {
        logger.error('Stream error', { error: String(err) });
        res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
        res.end();
      });

      stream.on('end', () => {
        res.write('data: [DONE]\n\n');
        res.end();
      });

      // Handle client disconnect
      req.on('close', () => {
        stream.abort();
      });

      return;
    }

    // Non-streaming response
    const response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: body.messages.map(m => ({ role: m.role, content: m.content })),
    });

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

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
    });
  } catch (err) {
    logger.error('Chat completion failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Chat completion failed' },
    });
  }
});

export default router;
