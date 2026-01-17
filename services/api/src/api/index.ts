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
import mitamaRoutes from './routes/mitama';
import paidRoutes, { initX402, setAnthropicClient as setPaidAnthropicClient } from './routes/paid';
import creditsRoutes, { initCreditsRoutes } from './routes/credits';
import { registry } from '../metrics';

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
});

const BLINDFOLD_ORIGINS = [
  'https://blindfoldfinance.com',
  'https://www.blindfoldfinance.com',
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

  // CORS - allow Blindfold origins + general access
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (BLINDFOLD_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, true);
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Health check (no auth)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'kamiyo-companion' });
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

  // Mitama ZK signal routes (public - demo purposes)
  app.use('/api/mitama', mitamaRoutes);

  // x402 payment-gated routes (public - pay-per-request for non-holders)
  app.use('/api/paid', paidRoutes);

  // Prepaid credits routes (public - alternative to x402)
  app.use('/api/credits', creditsRoutes);

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
