// KAMIYO Companion API Server

import express, { Express } from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';
import { authMiddleware, rateLimitMiddleware, tierMiddleware, errorHandler } from './middleware';
import authRoutes from './routes/auth';
import chatRoutes, { setAnthropicClient } from './routes/chat';
import tokensRoutes from './routes/tokens';
import marketRoutes from './routes/market';
import reputationRoutes from './routes/reputation';

export interface ApiServerConfig {
  anthropic: Anthropic;
  port?: number;
}

export function createApiServer(config: ApiServerConfig): Express {
  const app = express();

  // Set Anthropic client for chat routes
  setAnthropicClient(config.anthropic);

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Health check (no auth)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'kamiyo-companion-api' });
  });

  // Auth routes (no auth required)
  app.use('/api/auth', authRoutes);

  // Protected routes
  app.use('/api/v1/chat', authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), chatRoutes);
  app.use('/api/v1/tokens', authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), tokensRoutes);
  app.use('/api/v1/market', authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), marketRoutes);
  app.use('/api/v1/reputation', authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), reputationRoutes);

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

export function startApiServer(config: ApiServerConfig): void {
  const port = config.port || parseInt(process.env.API_PORT || '3001', 10);
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
    description: 'API for 1M+ $KAMIYO token holders',
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
        summary: 'Chat completion',
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
                  context: {
                    type: 'object',
                    properties: {
                      includeCrypto: { type: 'boolean', default: true },
                      includeTrends: { type: 'boolean', default: false },
                    },
                  },
                },
                required: ['messages'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Chat completion response' },
          429: { description: 'Rate limit exceeded' },
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
