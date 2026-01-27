// MCP Routes - OAuth + Streamable HTTP transport

import { Router, json, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { KamiyoOAuthProvider } from './oauth/provider.js';
import { createMCPServer, McpAuthInfo } from './server.js';
import { createMcpSession, updateMcpSessionActivity, deleteMcpSession, cleanupOldMcpSessions } from '../db.js';
import { logger } from '../logger.js';
import { mcpSessionsActive, mcpRequestsTotal, mcpRequestLatency } from '../metrics.js';

const SESSION_TTL_HOURS = 24;
const MAX_SESSIONS_PER_CLIENT = 10;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: Server;
  clientId: string;
  createdAt: number;
  lastActivity: number;
}

const sessions = new Map<string, SessionEntry>();

// Rate limiting per client
const clientRequests = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // per minute per client

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const entry = clientRequests.get(clientId);

  if (!entry || entry.resetAt < now) {
    clientRequests.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

function cleanupStaleSessions(): void {
  const now = Date.now();
  const staleThreshold = now - SESSION_TTL_HOURS * 60 * 60 * 1000;
  let cleaned = 0;

  for (const [sessionId, entry] of sessions) {
    if (entry.lastActivity < staleThreshold) {
      entry.transport.close().catch(() => {});
      sessions.delete(sessionId);
      deleteMcpSession(sessionId);
      cleaned++;
    }
  }

  // Also clean DB sessions
  const dbCleaned = cleanupOldMcpSessions(SESSION_TTL_HOURS);

  // Update session gauge
  mcpSessionsActive.set(sessions.size);

  if (cleaned > 0 || dbCleaned > 0) {
    logger.debug('MCP session cleanup', { memory: cleaned, db: dbCleaned });
  }
}

function countClientSessions(clientId: string): number {
  let count = 0;
  for (const entry of sessions.values()) {
    if (entry.clientId === clientId) count++;
  }
  return count;
}

// Start cleanup interval
let cleanupTimer: NodeJS.Timeout | null = null;

export function startMcpCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupStaleSessions, CLEANUP_INTERVAL_MS);
  logger.info('MCP session cleanup started');
}

export function stopMcpCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export async function shutdownMcpSessions(): Promise<void> {
  stopMcpCleanup();

  const sessionCount = sessions.size;
  if (sessionCount === 0) {
    return;
  }

  logger.info('Closing MCP sessions', { count: sessionCount });

  const closePromises: Promise<void>[] = [];
  for (const [sessionId, entry] of sessions) {
    closePromises.push(
      entry.transport.close().catch((err) => {
        logger.debug('Error closing MCP session', { sessionId, error: String(err) });
      })
    );
    deleteMcpSession(sessionId);
  }

  await Promise.all(closePromises);
  sessions.clear();
  logger.info('MCP sessions closed');
}

// Auto-start cleanup
startMcpCleanup();

function mcpBearerAuth(provider: KamiyoOAuthProvider, resourceMetadataUrl: string) {
  return async (req: Request & { mcpAuth?: McpAuthInfo }, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({ error: 'missing auth header' });
      return;
    }

    try {
      const authInfo = await provider.verifyAccessToken(authHeader.slice(7));
      req.mcpAuth = authInfo;
      next();
    } catch (err: any) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token"`);
      res.status(401).json({ error: 'invalid token' });
    }
  };
}

export function createMCPRoutes(): Router {
  const router = Router();
  const provider = new KamiyoOAuthProvider();

  const baseUrlStr = process.env.API_BASE_URL;
  if (!baseUrlStr) {
    logger.warn('API_BASE_URL not set, using default');
  }
  const baseUrl = new URL(baseUrlStr || 'https://kamiyo-protocol-4c70.onrender.com');
  const mcpUrl = new URL('/mcp', baseUrl);

  router.use(
    mcpAuthRouter({
      provider,
      issuerUrl: baseUrl,
      baseUrl,
      resourceServerUrl: mcpUrl,
      resourceName: 'KAMIYO MCP Server',
      scopesSupported: ['mcp:tools', 'mcp:tools:escrow', 'mcp:tools:x402'],
      serviceDocumentationUrl: new URL('https://github.com/kamiyo-ai/kamiyo-protocol/tree/main/packages/kamiyo-mcp'),
    })
  );

  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpUrl);

  // Health check
  router.get('/mcp/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      sessions: sessions.size,
      uptime: process.uptime(),
    });
  });

  router.all(
    '/mcp',
    json(),
    mcpBearerAuth(provider, resourceMetadataUrl),
    async (req: Request & { mcpAuth?: McpAuthInfo }, res: Response) => {
      const mcpAuth = req.mcpAuth;
      if (!mcpAuth) {
        res.status(401).json({ error: 'not authenticated' });
        return;
      }

      // Rate limiting
      if (!checkRateLimit(mcpAuth.clientId)) {
        mcpRequestsTotal.inc({ method: req.method, status: '429' });
        res.status(429).json({ error: 'rate limit exceeded' });
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const requestStart = Date.now();

      try {
        if (req.method === 'DELETE') {
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!;
            await session.transport.close();
            sessions.delete(sessionId);
            deleteMcpSession(sessionId);
            mcpSessionsActive.set(sessions.size);
          }
          mcpRequestsTotal.inc({ method: 'DELETE', status: '204' });
          res.status(204).end();
          return;
        }

        let session = sessionId ? sessions.get(sessionId) : undefined;

        if (!session && req.method === 'POST') {
          // Check session limit
          if (countClientSessions(mcpAuth.clientId) >= MAX_SESSIONS_PER_CLIENT) {
            res.status(429).json({ error: 'too many sessions' });
            return;
          }

          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          const server = createMCPServer(mcpAuth);
          await server.connect(transport);

          const newSessionId = transport.sessionId;
          if (newSessionId) {
            const now = Date.now();
            session = {
              transport,
              server,
              clientId: mcpAuth.clientId,
              createdAt: now,
              lastActivity: now,
            };
            sessions.set(newSessionId, session);

            createMcpSession({
              session_id: newSessionId,
              client_id: mcpAuth.clientId,
              user_wallet: (mcpAuth.extra?.wallet as string) || null,
            });

            mcpSessionsActive.set(sessions.size);

            transport.onclose = () => {
              sessions.delete(newSessionId);
              deleteMcpSession(newSessionId);
              mcpSessionsActive.set(sessions.size);
            };
          }
        }

        if (!session) {
          if (req.method === 'GET' && !sessionId) {
            mcpRequestsTotal.inc({ method: 'GET', status: '400' });
            res.status(400).json({ error: 'session id required for SSE' });
            return;
          }
          mcpRequestsTotal.inc({ method: req.method, status: '404' });
          res.status(404).json({ error: 'session not found' });
          return;
        }

        // Update activity
        session.lastActivity = Date.now();
        if (session.transport.sessionId) {
          updateMcpSessionActivity(session.transport.sessionId);
        }

        const mcpReq = req as any;
        mcpReq.auth = mcpAuth;
        await session.transport.handleRequest(mcpReq, res, req.body);

        // Record success metrics
        const latencySeconds = (Date.now() - requestStart) / 1000;
        mcpRequestsTotal.inc({ method: req.method, status: '200' });
        mcpRequestLatency.observe({ method: req.method }, latencySeconds);
      } catch (err: any) {
        logger.error('MCP request error', { error: err.message, clientId: mcpAuth.clientId });
        mcpRequestsTotal.inc({ method: req.method, status: '500' });
        if (!res.headersSent) {
          res.status(500).json({ error: 'internal error' });
        }
      }
    }
  );

  return router;
}

export { KamiyoOAuthProvider } from './oauth/provider.js';
export { KamiyoOAuthClientsStore } from './oauth/clients-store.js';
export { createMCPServer } from './server.js';
