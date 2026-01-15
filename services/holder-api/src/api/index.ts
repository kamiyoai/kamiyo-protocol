import express, { Express } from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import {
  authMiddleware,
  rateLimitMiddleware,
  tierMiddleware,
  errorHandler,
} from './middleware.js';
import authRoutes from './routes/auth.js';
import chatRoutes, { setAnthropicClient } from './routes/chat.js';
import tokensRoutes from './routes/tokens.js';
import marketRoutes from './routes/market.js';
import reputationRoutes from './routes/reputation.js';
import verifyRoutes from './routes/verify.js';
import blacklistRoutes from './routes/blacklist.js';
import { registry } from '../metrics.js';

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

  if (config.anthropic) {
    setAnthropicClient(config.anthropic);
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        // Allow Blindfold origins
        if (BLINDFOLD_ORIGINS.includes(origin)) return callback(null, true);
        // Allow all other origins for holder API
        return callback(null, true);
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'holder-api' });
  });

  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    } catch (err) {
      res.status(500).end(String(err));
    }
  });

  // Blindfold verification routes (no auth required)
  app.use('/verify', verifyRoutes);
  app.use('/blacklist', blacklistRoutes);

  // Holder API auth routes
  app.use('/api/auth', authRoutes);

  // Protected holder API routes
  app.use(
    '/api/v1/chat',
    authMiddleware,
    rateLimitMiddleware,
    tierMiddleware('pro'),
    chatRoutes
  );
  app.use(
    '/api/v1/tokens',
    authMiddleware,
    rateLimitMiddleware,
    tierMiddleware('pro'),
    tokensRoutes
  );
  app.use(
    '/api/v1/market',
    authMiddleware,
    rateLimitMiddleware,
    tierMiddleware('pro'),
    marketRoutes
  );
  app.use(
    '/api/v1/reputation',
    authMiddleware,
    rateLimitMiddleware,
    tierMiddleware('pro'),
    reputationRoutes
  );

  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.use(errorHandler);

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    });
  });

  return app;
}

export function startApiServer(config: ApiServerConfig = {}): void {
  const port = config.port || parseInt(process.env.PORT || '3001', 10);
  const app = createApiServer(config);

  app.listen(port, () => {
    logger.info('Holder API started', { port });
  });
}

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Holder API',
    version: '1.0.0',
    description: 'Token-gated API for holders',
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
        summary: 'Chat completion with memory and market signals',
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
                  clearHistory: { type: 'boolean', default: false },
                  context: {
                    type: 'object',
                    properties: {
                      includeCrypto: { type: 'boolean', default: true },
                      includeSignals: { type: 'boolean', default: true },
                      includeTrends: { type: 'boolean', default: false },
                      includeXSearch: { type: 'boolean', default: false },
                      xSearchQuery: { type: 'string' },
                      xHandles: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
                required: ['messages'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Chat completion' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/chat/history': {
      get: {
        summary: 'Get conversation history',
        responses: { 200: { description: 'Conversation messages' } },
      },
      delete: {
        summary: 'Clear conversation history',
        responses: { 200: { description: 'History cleared' } },
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
    '/api/v1/market/kamiyo': {
      get: {
        summary: 'Get KAMIYO market data',
        responses: { 200: { description: 'KAMIYO-specific market data' } },
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
        responses: { 200: { description: 'Groth16 proof' } },
      },
    },
    '/api/v1/reputation/verify': {
      post: {
        summary: 'Verify ZK reputation proof',
        responses: { 200: { description: 'Verification result' } },
      },
    },
  },
};
