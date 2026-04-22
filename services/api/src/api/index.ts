// Companion API server with Kizuna core routes and retained legacy integrations.

import express, { Express } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';
import { errorHandler } from './middleware';
import { setAnthropicClient } from './routes/chat';
import { initX402, setAnthropicClient as setPaidAnthropicClient } from './routes/paid';
import { initCreditsRoutes } from './routes/credits';
import internalRevenueRouter from './routes/internal-revenue';
import agentPerformanceRouter from './routes/agent-performance';
import agentLearningRouter from './routes/agent-learning';
import variantsRouter from './routes/variants';
import companyRouter from './routes/company';
import { registry } from '../metrics';
import { createMCPRoutes } from '../mcp/index.js';
import { resolveSolanaRpcUrl } from '../solana';
import { getCompanionRuntimeState, type CompanionRuntimeState } from '../runtime-profile';
import { getCreditsCapability, getMcpCapability, getX402Capability } from '../core-capabilities';
import {
  createApiRouteGroupCollectionForRuntime,
  createEdgeRouteGroups,
  mountApiRouteGroupCollection,
  mountEdgeRouteGroups,
} from './route-groups';

async function checkSolanaRpc(
  url: string
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, latencyMs: Date.now() - startedAt, error: `http_${res.status}` };
    }

    const data = (await res.json()) as { result?: unknown };
    if (data.result === 'ok') {
      return { ok: true, latencyMs: Date.now() - startedAt };
    }

    return { ok: false, latencyMs: Date.now() - startedAt, error: 'unhealthy' };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err instanceof Error ? err.message : 'unknown_error' };
  }
}

const READY_CHECK_CACHE_MS = 15000;
let lastRpcCheck: {
  url: string;
  at: number;
  result: { ok: boolean; latencyMs?: number; error?: string };
} | null = null;

async function checkSolanaRpcCached(
  url: string
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const now = Date.now();
  if (lastRpcCheck && lastRpcCheck.url === url && now - lastRpcCheck.at < READY_CHECK_CACHE_MS) {
    return lastRpcCheck.result;
  }

  const result = await checkSolanaRpc(url);
  lastRpcCheck = { url, at: now, result };
  return result;
}

// Rate limiter for auth endpoints (IP-based)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
  keyGenerator: req => req.ip || 'unknown',
  skip: req => req.method === 'OPTIONS', // Don't rate limit CORS preflight
});

// Stricter rate limiter for verify/refresh endpoints
const apiKeyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 API key generations per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many API key generation attempts. Please try again later.',
    },
  },
  keyGenerator: req => req.ip || 'unknown',
  skip: req => req.method === 'OPTIONS', // Don't rate limit CORS preflight
});

// Rate limiter for public read endpoints that can trigger expensive RPC/graph operations.
const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down.',
    },
  },
  keyGenerator: req => req.ip || 'unknown',
  skip: req => req.method === 'OPTIONS',
});

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://app.kamiyo.ai',
  'https://kamiyo.ai',
  'https://www.kamiyo.ai',
  'https://companion.kamiyo.ai',
];

export interface ApiServerConfig {
  anthropic?: Anthropic;
  port?: number;
  runtime?: CompanionRuntimeState;
}

export function createApiServer(config: ApiServerConfig = {}): Express {
  const app = express();
  const runtime = config.runtime ?? getCompanionRuntimeState();
  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (origin.startsWith('http://localhost:')) return callback(null, true);
      if (process.env.NODE_ENV === 'development') return callback(null, true);
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'payment-signature',
      'x-payment',
      'X-Payment',
      'x-wallet',
      'X-Wallet',
    ],
    credentials: true,
  } satisfies Parameters<typeof cors>[0];

  // Set Anthropic client for chat routes if provided
  if (config.anthropic) {
    setAnthropicClient(config.anthropic);
    setPaidAnthropicClient(config.anthropic);
  }

  // Initialize x402 payment gateway
  initX402(config.anthropic);

  // Initialize credits system
  initCreditsRoutes();

  // CORS - allow known origins + localhost for development
  app.use(cors(corsOptions));

  // Handle preflight requests explicitly before rate limiters
  app.options('*', cors(corsOptions));

  app.use(express.json({ limit: '1mb' }));

  // Health check (no auth)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'kamiyo-companion' });
  });

  // Readiness check (no auth)
  app.get('/ready', async (_req, res) => {
    const solanaUrl = resolveSolanaRpcUrl();
    const solana = await checkSolanaRpcCached(solanaUrl);
    if (!solana.ok) {
      res.status(503).json({ status: 'not_ready', dependencies: { solana } });
      return;
    }
    res.json({ status: 'ready', dependencies: { solana } });
  });

  // Version/provenance endpoint (no auth)
  app.get('/version', (_req, res) => {
    res.json({
      service: 'kamiyo-companion',
      node: process.version,
      git: {
        commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || null,
        branch: process.env.RENDER_GIT_BRANCH || null,
      },
      meishi: {
        programId: process.env.MEISHI_PROGRAM_ID || null,
        rpcUrl: process.env.SOLANA_RPC_URL || null,
      },
      runtime: {
        profile: runtime.profile,
        routeSurface: runtime.routeSurface,
        backgroundOwnerships: runtime.backgroundOwnerships,
        routeOwnerships: runtime.routeOwnerships,
      },
      capabilities: {
        credits: getCreditsCapability(),
        x402: getX402Capability(),
        mcp: getMcpCapability(),
      },
    });
  });

  // Prometheus metrics
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    } catch (err) {
      res.status(500).end(String(err));
    }
  });

  mountEdgeRouteGroups(app, createEdgeRouteGroups(authRateLimiter, apiKeyRateLimiter));
  mountApiRouteGroupCollection(
    app,
    createApiRouteGroupCollectionForRuntime(publicReadLimiter, runtime),
    runtime
  );
  app.use('/api', companyRouter);
  app.use('/api/internal/revenue-events', internalRevenueRouter);
  app.use('/api', agentPerformanceRouter);
  app.use('/api', agentLearningRouter);
  app.use('/api', variantsRouter);

  // MCP routes (OAuth + Streamable HTTP transport)
  app.use(createMCPRoutes());

  // OpenAPI spec
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  // Error handler
  app.use(errorHandler);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    });
  });

  return app;
}

export function startApiServer(config: ApiServerConfig = {}): void {
  const port = config.port || parseInt(process.env.PORT || '3000', 10);
  const app = createApiServer(config);

  app.listen(port, () => {
    logger.info('API server started', { port });
  });
}

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'KAMIYO Companion API',
    version: '1.0.0',
    description:
      'Companion API for Kizuna credits, payment support, and retained KAMIYO integrations.',
  },
  servers: [
    { url: 'https://api.kamiyo.ai', description: 'Production' },
    { url: 'http://localhost:3001', description: 'Local' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/auth/challenge': {
      get: {
        summary: 'Get authentication challenge',
        parameters: [{ name: 'wallet', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Challenge generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    challenge: { type: 'string' },
                    expiresAt: { type: 'number' },
                  },
                },
              },
            },
          },
        },
        security: [],
      },
    },
    '/api/auth/verify': {
      post: {
        summary: 'Verify signature and get API key',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  wallet: { type: 'string' },
                  signature: { type: 'string' },
                },
                required: ['wallet', 'signature'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'API key generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    apiKey: { type: 'string' },
                    tier: { type: 'string' },
                    balance: { type: 'number' },
                    expiresAt: { type: 'number' },
                  },
                },
              },
            },
          },
          403: { description: 'Insufficient token balance' },
        },
        security: [],
      },
    },
    '/api/v1/chat': {
      post: {
        summary: 'Chat completion with memory, market signals, and X search',
        description:
          'Hybrid Anthropic/Grok chat with conversation memory, real-time crypto context, proprietary signals, and X/Twitter search',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  messages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string' },
                      },
                    },
                  },
                  stream: { type: 'boolean', default: false },
                  clearHistory: {
                    type: 'boolean',
                    default: false,
                    description: 'Clear conversation memory before this request',
                  },
                  context: {
                    type: 'object',
                    properties: {
                      includeCrypto: {
                        type: 'boolean',
                        default: true,
                        description: 'Include BTC/ETH/KAMIYO prices',
                      },
                      includeSignals: {
                        type: 'boolean',
                        default: true,
                        description: 'Include proprietary market signals',
                      },
                      includeTrends: {
                        type: 'boolean',
                        default: false,
                        description: 'Include X/Twitter trending topics',
                      },
                      includeXSearch: {
                        type: 'boolean',
                        default: false,
                        description: 'Search X for relevant content',
                      },
                      xSearchQuery: {
                        type: 'string',
                        description: 'Custom X search query (defaults to last message)',
                      },
                      xHandles: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'X handles to search (without @)',
                      },
                    },
                  },
                },
                required: ['messages'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Chat completion with context and memory info',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    message: {
                      type: 'object',
                      properties: { role: { type: 'string' }, content: { type: 'string' } },
                    },
                    usage: {
                      type: 'object',
                      properties: {
                        promptTokens: { type: 'number' },
                        completionTokens: { type: 'number' },
                      },
                    },
                    context: {
                      type: 'object',
                      description: 'Market data, signals, and search results used',
                    },
                    memory: { type: 'object', properties: { historyLength: { type: 'number' } } },
                  },
                },
              },
            },
          },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/chat/history': {
      get: {
        summary: 'Get conversation history',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'number', default: 20, maximum: 50 } },
        ],
        responses: {
          200: { description: 'Conversation messages' },
        },
      },
      delete: {
        summary: 'Clear conversation history',
        responses: {
          200: { description: 'History cleared' },
        },
      },
    },
    '/api/v1/tokens/{query}': {
      get: {
        summary: 'Look up token by name, symbol, or address',
        parameters: [{ name: 'query', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Token data' },
          404: { description: 'Token not found' },
        },
      },
    },
    '/api/v1/market': {
      get: {
        summary: 'Get market context',
        responses: {
          200: { description: 'Market data including BTC, ETH, KAMIYO, trending, headlines' },
        },
      },
    },
    '/api/v1/reputation/proof': {
      post: {
        summary: 'Generate ZK reputation proof',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  score: { type: 'number', minimum: 0, maximum: 100 },
                  threshold: { type: 'number', minimum: 0, maximum: 100 },
                },
                required: ['score', 'threshold'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Groth16 proof' },
        },
      },
    },
    '/api/fusion/fairscale/events': {
      post: {
        summary: 'Ingest signed FairScale fusion event',
        description:
          'Accepts HMAC-signed quality/settlement events for reliability scoring. Requires x-kamiyo-signature header.',
        parameters: [
          {
            name: 'x-kamiyo-signature',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'x-kamiyo-key-id',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  eventId: { type: 'string' },
                  partner: { type: 'string', example: 'fairscale' },
                  wallet: { type: 'string' },
                  serviceId: { type: 'string' },
                  qualityScore: { type: 'number', minimum: 0, maximum: 100 },
                  refundPct: { type: 'number', minimum: 0, maximum: 100 },
                  timestampMs: { type: 'number' },
                  proofHash: { type: 'string' },
                  metadata: { type: 'object' },
                },
                required: [
                  'wallet',
                  'serviceId',
                  'qualityScore',
                  'refundPct',
                  'timestampMs',
                  'proofHash',
                ],
              },
            },
          },
        },
        responses: {
          202: { description: 'Event accepted' },
          200: { description: 'Idempotent replay acknowledged' },
          401: { description: 'Signature invalid or missing' },
        },
        security: [],
      },
      get: {
        summary: 'Fetch FairScale fusion events feed',
        parameters: [
          { name: 'partner', in: 'query', schema: { type: 'string', default: 'fairscale' } },
          { name: 'wallet', in: 'query', schema: { type: 'string' } },
          { name: 'since_ms', in: 'query', schema: { type: 'number' } },
          { name: 'limit', in: 'query', schema: { type: 'number', default: 100, maximum: 500 } },
        ],
        responses: {
          200: { description: 'Event feed' },
        },
        security: [],
      },
    },
    '/api/fusion/fairscale/reliability/{wallet}': {
      get: {
        summary: 'Get reliability metrics for a wallet',
        parameters: [
          { name: 'wallet', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'window_days',
            in: 'query',
            schema: { type: 'number', default: 30, maximum: 365 },
          },
          {
            name: 'service_limit',
            in: 'query',
            schema: { type: 'number', default: 10, maximum: 25 },
          },
        ],
        responses: {
          200: { description: 'Reliability metrics and service breakdown' },
        },
        security: [],
      },
    },
  },
};
