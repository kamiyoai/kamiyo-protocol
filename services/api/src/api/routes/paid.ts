// x402 Payment-gated endpoints for non-holders
// Pay-per-request via USDC on Base, Solana, or other chains

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
import { createPayAIFacilitator, PayAIFacilitator, PayAINetwork } from '@kamiyo/x402-client';
import { getContext, formatContextForPrompt } from '../../crypto-context';
import { logger } from '../../logger';

const router: IRouter = Router();

// Payment configuration
const MERCHANT_WALLET = process.env.X402_MERCHANT_WALLET || '';
const CHAT_PRICE_USD = 0.01; // $0.01 per chat request
const MARKET_PRICE_USD = 0.005; // $0.005 per market data request

// Supported networks for payment
const SUPPORTED_NETWORKS: PayAINetwork[] = [
  'base',
  'solana',
  'polygon',
  'arbitrum',
];

let facilitator: PayAIFacilitator | null = null;
let anthropicClient: Anthropic | null = null;

export function initX402(anthropic?: Anthropic): void {
  if (!MERCHANT_WALLET) {
    logger.warn('X402_MERCHANT_WALLET not set - paid endpoints disabled');
    return;
  }

  facilitator = createPayAIFacilitator(MERCHANT_WALLET, {
    defaultNetwork: 'base',
    onVerified: (result) => {
      logger.info('x402 payment verified', {
        valid: result.valid,
        payer: result.payer?.slice(0, 10),
        network: result.network,
        amount: result.amount,
      });
    },
    onSettled: (result) => {
      logger.info('x402 payment settled', {
        success: result.success,
        tx: result.tx?.slice(0, 16),
        network: result.network,
      });
    },
    onError: (error) => {
      logger.error('x402 payment error', { code: error.code, message: error.message });
    },
  });

  if (anthropic) {
    anthropicClient = anthropic;
  }

  logger.info('x402 payment gateway initialized', {
    merchant: MERCHANT_WALLET.slice(0, 10) + '...',
    networks: SUPPORTED_NETWORKS.join(', '),
  });
}

export function setAnthropicClient(client: Anthropic): void {
  anthropicClient = client;
}

export function isX402Available(): boolean {
  return facilitator !== null;
}

// x402 middleware - validates payment header or returns 402
async function x402Middleware(
  priceUsd: number,
  description: string
) {
  return async (req: Request, res: Response, next: () => void): Promise<void> => {
    if (!facilitator) {
      res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Payment gateway not configured' },
      });
      return;
    }

    const paymentHeader = req.headers['x-payment'] as string | undefined;

    if (!paymentHeader) {
      // Return 402 with payment requirements
      const body = facilitator.response402(
        req.path,
        priceUsd,
        description,
        SUPPORTED_NETWORKS
      );
      const headers = facilitator.headers402(
        req.path,
        priceUsd,
        description,
        'base'
      );
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      res.status(402).json(body);
      return;
    }

    // Verify and settle payment
    const reqs = facilitator.requirements(
      req.path,
      priceUsd,
      description,
      SUPPORTED_NETWORKS
    );

    for (const requirement of reqs) {
      try {
        const { verify, settle } = await facilitator.verifyAndSettle(
          paymentHeader,
          requirement
        );
        if (verify.valid && settle?.success) {
          // Attach payment info to request
          (req as any).x402 = {
            payer: verify.payer,
            network: verify.network,
            amount: verify.amount,
            tx: settle.tx,
          };
          next();
          return;
        }
      } catch {
        continue;
      }
    }

    // Payment failed - return 402
    const body = facilitator.response402(
      req.path,
      priceUsd,
      description,
      SUPPORTED_NETWORKS
    );
    res.status(402).json(body);
  };
}

const SYSTEM_PROMPT = `You are KAMIYO, a crypto-native AI with real-time market intelligence.

Core traits:
- Direct, concise, no fluff
- Deep crypto/DeFi knowledge
- Data-driven analysis
- No emojis unless requested

You have access to real-time prices (BTC, ETH, KAMIYO) and market sentiment.
When discussing markets, use the data provided. Never fabricate numbers.
For trading questions, provide analysis not financial advice.`;

// POST /api/paid/chat - Pay-per-request chat
router.post('/chat', async (req: Request, res: Response) => {
  // First check x402 payment
  const middleware = await x402Middleware(CHAT_PRICE_USD, 'KAMIYO AI Chat - single request');
  await new Promise<void>((resolve) => middleware(req, res, resolve));

  // If 402 was returned, stop
  if (res.headersSent) return;

  if (!anthropicClient) {
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Chat service not initialized' },
    });
    return;
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Messages array is required' },
    });
    return;
  }

  // Validate messages
  for (const msg of messages) {
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
    // Get crypto context
    const cryptoCtx = await getContext();
    const contextStr = formatContextForPrompt(cryptoCtx);
    const systemPrompt = SYSTEM_PROMPT + '\n\n' + contextStr;

    const response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const x402 = (req as any).x402 || {};

    res.json({
      id: `paid_${randomBytes(8).toString('hex')}`,
      message: {
        role: 'assistant',
        content,
      },
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      payment: {
        payer: x402.payer?.slice(0, 10) + '...',
        network: x402.network,
        tx: x402.tx,
        priceUsd: CHAT_PRICE_USD,
      },
    });
  } catch (err) {
    logger.error('Paid chat completion failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Chat completion failed' },
    });
  }
});

// GET /api/paid/market - Pay-per-request market data
router.get('/market', async (req: Request, res: Response) => {
  const middleware = await x402Middleware(MARKET_PRICE_USD, 'KAMIYO Market Data');
  await new Promise<void>((resolve) => middleware(req, res, resolve));

  if (res.headersSent) return;

  try {
    const ctx = await getContext();
    const x402 = (req as any).x402 || {};

    res.json({
      btc: {
        price: ctx.btcPrice,
      },
      eth: {
        price: ctx.ethPrice,
      },
      kamiyo: ctx.kamiyo ? {
        price: ctx.kamiyo.priceUsd,
        change24h: ctx.kamiyo.priceChange24h,
        volume24h: ctx.kamiyo.volume24h,
        marketCap: ctx.kamiyo.marketCap,
        liquidity: ctx.kamiyo.liquidity,
      } : null,
      sentiment: ctx.marketSentiment,
      trending: ctx.trending,
      headlines: ctx.headlines,
      timestamp: Date.now(),
      payment: {
        payer: x402.payer?.slice(0, 10) + '...',
        network: x402.network,
        tx: x402.tx,
        priceUsd: MARKET_PRICE_USD,
      },
    });
  } catch (err) {
    logger.error('Paid market data failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch market data' },
    });
  }
});

// GET /api/paid/pricing - Show pricing and payment options
router.get('/pricing', (_req: Request, res: Response) => {
  if (!facilitator) {
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Payment gateway not configured' },
    });
    return;
  }

  res.json({
    endpoints: {
      '/api/paid/chat': {
        method: 'POST',
        priceUsd: CHAT_PRICE_USD,
        description: 'AI chat with real-time crypto context',
      },
      '/api/paid/market': {
        method: 'GET',
        priceUsd: MARKET_PRICE_USD,
        description: 'Real-time market data (BTC, ETH, KAMIYO, sentiment)',
      },
    },
    payment: {
      protocol: 'x402',
      asset: 'USDC',
      networks: SUPPORTED_NETWORKS.map(n => ({
        name: n,
        chainId: PayAIFacilitator.getChainId(n),
        usdc: PayAIFacilitator.getUsdcAddress(n),
      })),
      facilitator: PayAIFacilitator.URL,
    },
    merchant: MERCHANT_WALLET ? MERCHANT_WALLET.slice(0, 10) + '...' : 'not configured',
    alternative: {
      description: 'Token holders get free access',
      requirement: 'Hold $KAMIYO tokens',
      endpoint: '/api/auth/challenge',
    },
  });
});

// GET /api/paid/health - Check x402 payment gateway status
router.get('/health', async (_req: Request, res: Response) => {
  if (!facilitator) {
    res.json({
      status: 'disabled',
      reason: 'X402_MERCHANT_WALLET not configured',
    });
    return;
  }

  const health = await facilitator.health();

  res.json({
    status: health.ok ? 'ok' : 'degraded',
    latencyMs: health.latency,
    networks: health.networks,
    facilitator: PayAIFacilitator.URL,
  });
});

export default router;
