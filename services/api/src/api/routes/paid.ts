// Payment-gated endpoints: x402 (USDC) or prepaid credits ($KAMIYO)

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
import { createPayAIFacilitator, PayAIFacilitator, PayAINetwork } from '@kamiyo/x402-client';
import { getContext, formatContextForPrompt } from '../../crypto-context';
import { emitFairscaleFusionEvent } from '../../fairscale-fusion-emitter';
import { logger } from '../../logger';
import { getCreditBalance, deductCredits, getCreditBalanceUsd, usdToCredits, isDailySpendCapExceeded, incrementDailyApiSpend, getDailySpendStatus } from '../../db';
import { getBurnService, type BurnRecord } from '../../burn-service';
import { COMPANION_X402_NETWORKS, getX402Capability } from '../../core-capabilities';
import {
  buildCompanyTicketId,
  defaultGoalIdForUnit,
  recordCompanyTicketEvent,
  upsertCompanyTicket,
} from '../../company';
import { recordRevenueEvent } from '../../revenue-events';

const router: IRouter = Router();

const CHAT_PRICE_USD = 0.01;
const MARKET_PRICE_USD = 0.005;
const SUPPORTED_NETWORKS: PayAINetwork[] = [...COMPANION_X402_NETWORKS];

let facilitator: PayAIFacilitator | null = null;
let anthropicClient: Anthropic | null = null;

interface PaidCreditsContext {
  wallet: string;
  amountUsd: number;
  remainingUsd: number;
}

interface PaidX402Context {
  payer?: string;
  network?: string;
  amount?: string;
  tx?: string;
}

interface PaidRequest extends Request {
  credits?: PaidCreditsContext;
  x402?: PaidX402Context;
  burn?: BurnRecord | null;
}

function asPaidRequest(req: Request): PaidRequest {
  return req as PaidRequest;
}

export function initX402(anthropic?: Anthropic): void {
  const capability = getX402Capability();
  facilitator = null;

  if (!capability.enabled || !capability.merchantWallet) {
    if (anthropic) {
      anthropicClient = anthropic;
    }
    return;
  }

  facilitator = createPayAIFacilitator(capability.merchantWallet, {
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
    merchant: capability.merchantWallet.slice(0, 10) + '...',
    networks: SUPPORTED_NETWORKS.join(', '),
  });
}

export function setAnthropicClient(client: Anthropic): void {
  anthropicClient = client;
}

export function isX402Available(): boolean {
  return facilitator !== null;
}

async function emitPaidFusionEvent(
  req: Request,
  serviceId: string,
  proofHash: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { credits, x402 } = asPaidRequest(req);
  const wallet = typeof credits?.wallet === 'string' && credits.wallet
    ? credits.wallet
    : typeof x402?.payer === 'string'
      ? x402.payer
      : '';

  if (!wallet) {
    return;
  }

  await emitFairscaleFusionEvent({
    wallet,
    serviceId,
    qualityScore: 100,
    refundPct: 0,
    timestampMs: Date.now(),
    proofHash,
    metadata: {
      paymentMethod: credits ? 'credits' : 'x402',
      amountUsd: credits?.amountUsd,
      remainingUsd: credits?.remainingUsd,
      network: x402?.network,
      tx: x402?.tx,
      ...metadata,
    },
  });
}

async function paymentMiddleware(
  priceUsd: number,
  description: string,
  endpoint: string
) {
  return async (req: Request, res: Response, next: () => void): Promise<void> => {
    const paidReq = asPaidRequest(req);
    const walletHeader = req.headers['x-wallet'] as string | undefined;

    if (walletHeader) {
      const requiredMicro = usdToCredits(priceUsd);
      const balanceMicro = getCreditBalance(walletHeader);

      if (balanceMicro >= requiredMicro) {
        const deducted = deductCredits(walletHeader, requiredMicro, endpoint, description);
        if (deducted) {
          // Record 1% burn from credit usage
          const burnService = getBurnService();
          const burn = burnService.recordCreditBurn(walletHeader, endpoint, priceUsd);

          paidReq.credits = {
            wallet: walletHeader,
            amountUsd: priceUsd,
            remainingUsd: getCreditBalanceUsd(walletHeader),
          };
          paidReq.burn = burn;

          logger.info('Credits used', {
            wallet: walletHeader.slice(0, 10) + '...',
            amount: priceUsd,
            endpoint,
            burnAmount: burn?.kamiyo_formatted,
          });
          next();
          return;
        }
      }
    }

    if (!facilitator) {
      res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Payment gateway not configured' },
      });
      return;
    }

    const paymentHeader = req.headers['payment-signature'] as string | undefined;

    if (!paymentHeader) {
      const body = facilitator.response402(
        req.path,
        priceUsd,
        description,
        SUPPORTED_NETWORKS
      );
      const headers = facilitator.headers402();
      const responseBody: Record<string, unknown> = { ...body };
      if (walletHeader) {
        responseBody.credits = {
          wallet: walletHeader.slice(0, 10) + '...',
          balanceUsd: getCreditBalanceUsd(walletHeader),
          requiredUsd: priceUsd,
          depositEndpoint: '/api/credits/info',
        };
      }
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      res.status(402).json(responseBody);
      return;
    }

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
          // Record 1% burn from x402 payment
          const burnService = getBurnService();
          const burn = burnService.recordX402Burn(verify.payer, endpoint, priceUsd);
          const companyTicket = upsertCompanyTicket({
            ticketId: buildCompanyTicketId('x402-endpoint', endpoint),
            source: 'x402-endpoint',
            sourceRef: endpoint,
            unitId: 'payments',
            goalId: defaultGoalIdForUnit('payments'),
            title: `${description} revenue lane`,
            description: `Recurring x402 settlement lane for ${endpoint}.`,
            status: 'open',
            priority: 8,
            expectedGrossUsd: priceUsd,
            expectedCostUsd: 0,
            expectedNetUsd: priceUsd,
            confidence: 0.9,
            urgency: 0.8,
            assignedAgentId: verify.payer,
            executionPath: 'x402-direct',
            metadata: {
              endpoint,
              description,
            },
          });

          recordCompanyTicketEvent({
            ticketId: companyTicket.id,
            eventType: 'x402_payment_settled',
            status: 'open',
            source: 'x402',
            sourceRef: settle.tx,
            settlementRef: settle.tx,
            idempotencyKey: `x402:${settle.tx}`,
            payload: {
              endpoint,
              description,
              payer: verify.payer,
              network: verify.network,
              amount: verify.amount,
              grossUsd: priceUsd,
              burnId: burn?.id ?? null,
            },
          });

          recordRevenueEvent({
            eventId: `x402:${settle.tx}`,
            source: 'x402',
            kind: 'x402.payment.settled',
            agentId: verify.payer,
            workId: endpoint,
            gross: priceUsd,
            fees: 0,
            net: priceUsd,
            token: 'USD',
            chain: verify.network || 'base',
            status: 'settled',
            settlementRef: settle.tx,
            metadata: {
              unitId: 'payments',
              ticketId: companyTicket.id,
              goalId: defaultGoalIdForUnit('payments'),
              description,
              payer: verify.payer,
              amount: verify.amount,
              endpoint,
              burnId: burn?.id ?? null,
            },
          });

          paidReq.x402 = {
            payer: verify.payer,
            network: verify.network,
            amount: verify.amount,
            tx: settle.tx,
          };
          paidReq.burn = burn;

          next();
          return;
        }
      } catch {
        continue;
      }
    }

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

router.post('/chat', async (req: Request, res: Response) => {
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

  const middleware = await paymentMiddleware(CHAT_PRICE_USD, 'KAMIYO AI Chat', '/api/paid/chat');
  await new Promise<void>((resolve) => middleware(req, res, resolve));

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

    const { x402, credits } = asPaidRequest(req);
    const responseId = `paid_${randomBytes(8).toString('hex')}`;

    await emitPaidFusionEvent(req, 'api.paid.chat.v1', `paid_chat_${responseId}`, {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    });

    res.json({
      id: responseId,
      message: {
        role: 'assistant',
        content,
      },
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      payment: credits
        ? {
            method: 'credits',
            wallet: credits.wallet.slice(0, 10) + '...',
            amountUsd: credits.amountUsd,
            remainingUsd: credits.remainingUsd,
          }
        : {
            method: 'x402',
            payer: x402?.payer?.slice(0, 10) + '...',
            network: x402?.network,
            tx: x402?.tx,
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

router.get('/market', async (req: Request, res: Response) => {
  const middleware = await paymentMiddleware(MARKET_PRICE_USD, 'KAMIYO Market Data', '/api/paid/market');
  await new Promise<void>((resolve) => middleware(req, res, resolve));

  if (res.headersSent) return;

  try {
    const ctx = await getContext();
    const { x402, credits } = asPaidRequest(req);
    const responseId = `market_${randomBytes(8).toString('hex')}`;

    await emitPaidFusionEvent(req, 'api.paid.market.v1', `paid_market_${responseId}`, {
      timestamp: Date.now(),
      sentiment: ctx.marketSentiment,
    });

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
      payment: credits
        ? {
            method: 'credits',
            wallet: credits.wallet.slice(0, 10) + '...',
            amountUsd: credits.amountUsd,
            remainingUsd: credits.remainingUsd,
          }
        : {
            method: 'x402',
            payer: x402?.payer?.slice(0, 10) + '...',
            network: x402?.network,
            tx: x402?.tx,
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

router.get('/pricing', (_req: Request, res: Response) => {
  const capability = getX402Capability();

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
    merchant: capability.merchantWallet ? capability.merchantWallet.slice(0, 10) + '...' : 'not configured',
    credits: {
      description: 'Prepaid credits (buy with $KAMIYO)',
      rate: '1M $KAMIYO = $10 credits',
      depositEndpoint: '/api/credits/info',
      balanceEndpoint: '/api/credits/balance',
      usage: 'Include X-Wallet header with your wallet address',
    },
    alternative: {
      description: 'Token holders get free access',
      requirement: 'Hold $KAMIYO tokens',
      endpoint: '/api/auth/challenge',
    },
  });
});

router.get('/health', async (_req: Request, res: Response) => {
  if (!facilitator) {
    const capability = getX402Capability();
    res.json({
      status: 'disabled',
      reason: capability.reason,
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
