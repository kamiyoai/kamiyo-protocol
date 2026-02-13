// KAMIYO Consolidated API Server

import express, { Express } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';
import { authMiddleware, rateLimitMiddleware, tierMiddleware, errorHandler } from './middleware';
import authRoutes from './routes/auth';
import chatRoutes, { setAnthropicClient } from './routes/chat';
import tokensRoutes from './routes/tokens';
import marketRoutes from './routes/market';
import reputationRoutes from './routes/reputation';
import verifyRoutes from './routes/verify';
import blacklistRoutes from './routes/blacklist';
import swarmteamsRoutes from './routes/hive';
import kamiyoTokenRoutes from './routes/kamiyo-token';
import paidRoutes, { initX402, setAnthropicClient as setPaidAnthropicClient } from './routes/paid';
import creditsRoutes, { initCreditsRoutes } from './routes/credits';
import linkWalletRoutes from './routes/link-wallet';
import swarmTeamRoutes from './routes/hive-teams';
import blindfoldCallbackRoutes from './routes/blindfold-callback';
import buybackRoutes from './routes/buyback';
import channelsRoutes from './routes/channels';
import trustGraphRoutes from './routes/trust-graph';
import meishiRoutes from './routes/meishi';
import meishiDkgRoutes from './routes/meishi-dkg';
import paranetRoutes from './routes/paranet';
import babyagiRoutes from './routes/babyagi';
import { registry } from '../metrics';
import { createMCPRoutes } from '../mcp/index.js';
import { resolveSolanaRpcUrl } from '../solana';

async function checkSolanaRpc(url: string): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
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
let lastRpcCheck: { url: string; at: number; result: { ok: boolean; latencyMs?: number; error?: string } } | null =
  null;

async function checkSolanaRpcCached(url: string): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
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
  keyGenerator: (req) => req.ip || 'unknown',
  skip: (req) => req.method === 'OPTIONS', // Don't rate limit CORS preflight
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
  keyGenerator: (req) => req.ip || 'unknown',
  skip: (req) => req.method === 'OPTIONS', // Don't rate limit CORS preflight
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
  keyGenerator: (req) => req.ip || 'unknown',
  skip: (req) => req.method === 'OPTIONS',
});

// Blindfold callback rate limiter (IP-based)
const blindfoldCallbackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 callbacks per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many callback requests.',
    },
  },
  keyGenerator: (req) => req.ip || 'unknown',
  skip: (req) => req.method === 'OPTIONS', // Don't rate limit CORS preflight
});

// Per-team callback rate limiter
const perTeamCallbackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 callbacks per team per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many callback requests for this team.',
    },
  },
  keyGenerator: (req) => {
    const poolId = (req.query.pool_id as string) || req.body?.pool_id || 'unknown';
    return `team:${poolId}`;
  },
  skip: (req) => req.method === 'OPTIONS', // Don't rate limit CORS preflight
});

const BLINDFOLD_ORIGINS = [
  'https://blindfoldfinance.com',
  'https://www.blindfoldfinance.com',
];

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://app.kamiyo.ai',
  'https://kamiyo.ai',
  'https://www.kamiyo.ai',
  'https://companion.kamiyo.ai',
  ...BLINDFOLD_ORIGINS,
];

export interface ApiServerConfig {
  anthropic?: Anthropic;
  port?: number;
}

export function createApiServer(config: ApiServerConfig = {}): Express {
  const app = express();

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
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin) return callback(null, true);
        // Allow known origins
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        // Allow localhost for development
        if (origin.startsWith('http://localhost:')) return callback(null, true);
        // Allow all in development mode
        if (process.env.NODE_ENV === 'development') return callback(null, true);
        // Default: allow (permissive for now, can tighten later)
        return callback(null, true);
      },
      methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  // Handle preflight requests explicitly before rate limiters
  app.options('*', cors());

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

  // Blindfold verification routes (no auth required, but IP rate limited)
  app.use('/verify', authRateLimiter, verifyRoutes);
  app.use('/blacklist', authRateLimiter, blacklistRoutes);

  // Companion API auth routes (no auth required, but IP rate limited)
  // Challenge endpoint - moderate rate limiting
  app.use('/api/auth/challenge', authRateLimiter);
  // Verify/refresh endpoints - stricter rate limiting
  app.use('/api/auth/verify', apiKeyRateLimiter);
  app.use('/api/auth/refresh', apiKeyRateLimiter);
  app.use('/api/auth', authRoutes);

  // Protected Companion API routes
  app.use('/api/v1/chat', authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), chatRoutes);
  app.use('/api/v1/tokens', authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), tokensRoutes);
  app.use('/api/v1/market', authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), marketRoutes);
  app.use('/api/v1/reputation', authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), reputationRoutes);

  // Hive ZK signal routes (public - demo purposes)
  app.use('/api/hive', swarmteamsRoutes);

  // $KAMIYO token stats and burn tracking (public)
  app.use('/api/kamiyo', kamiyoTokenRoutes);

  // x402 payment-gated routes (public - pay-per-request for non-holders)
  app.use('/api/paid', paidRoutes);

  // Prepaid credits routes (public - alternative to x402)
  app.use('/api/credits', creditsRoutes);

  // Wallet linking routes (from kamiyo-app dApp)
  app.use('/api/link-wallet', linkWalletRoutes);

  // SwarmTeam management routes (public)
  app.use('/api/hive-teams', swarmTeamRoutes);
  app.use('/api/swarm-teams', swarmTeamRoutes);

  // Blindfold funding callback (public - receives redirects from Blindfold)
  app.use('/api/fund/callback', blindfoldCallbackLimiter, perTeamCallbackLimiter, blindfoldCallbackRoutes);

  // Buyback stats and admin controls (public read, admin write)
  app.use('/api/buyback', buybackRoutes);

  // ZK-gated channels (public - proof verified on join)
  app.use('/api/channels', channelsRoutes);

  // Trust graph visualization (public)
  app.use('/api/trust-graph', publicReadLimiter, trustGraphRoutes);

  // Meishi passports (public reads; on-chain source of truth)
  app.use('/api/meishi', publicReadLimiter, meishiRoutes);

  // Meishi DKG views (public reads; OriginTrail-backed once publishing is enabled)
  app.use('/api/meishi-dkg', publicReadLimiter, meishiDkgRoutes);

  // Agent Paranet - decentralized credit scores (public read, auth for write)
  app.use('/api/paranet', paranetRoutes);

  // BabyAGI bridge routes (public by default; set BABYAGI_BRIDGE_API_KEY to require auth)
  app.use('/babyagi/v1', babyagiRoutes);

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
    description: 'KAMIYO Companion - AI interface to KAMIYO protocol. Token-gated API for holders.',
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
        parameters: [
          { name: 'wallet', in: 'query', required: true, schema: { type: 'string' } },
        ],
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
        description: 'Hybrid Anthropic/Grok chat with conversation memory, real-time crypto context, proprietary signals, and X/Twitter search',
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
                  clearHistory: { type: 'boolean', default: false, description: 'Clear conversation memory before this request' },
                  context: {
                    type: 'object',
                    properties: {
                      includeCrypto: { type: 'boolean', default: true, description: 'Include BTC/ETH/KAMIYO prices' },
                      includeSignals: { type: 'boolean', default: true, description: 'Include proprietary market signals' },
                      includeTrends: { type: 'boolean', default: false, description: 'Include X/Twitter trending topics' },
                      includeXSearch: { type: 'boolean', default: false, description: 'Search X for relevant content' },
                      xSearchQuery: { type: 'string', description: 'Custom X search query (defaults to last message)' },
                      xHandles: { type: 'array', items: { type: 'string' }, description: 'X handles to search (without @)' },
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
                    message: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } },
                    usage: { type: 'object', properties: { promptTokens: { type: 'number' }, completionTokens: { type: 'number' } } },
                    context: { type: 'object', description: 'Market data, signals, and search results used' },
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
        parameters: [
          { name: 'query', in: 'path', required: true, schema: { type: 'string' } },
        ],
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
  },
};
