// MCP Routes - OAuth + Streamable HTTP transport

import { Router, json, Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { KamiyoOAuthProvider } from './oauth/provider.js';
import { createMCPServer, McpAuthInfo } from './server.js';
import {
  createMcpSession,
  updateMcpSessionActivity,
  deleteMcpSession,
  cleanupOldMcpSessions,
  cleanupExpiredMcpOAuthCodes,
  cleanupExpiredMcpOAuthTokens,
} from '../db.js';
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
const clientRequests = new Map<string, { count: number; resetAt: number; lastSeen: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // per minute per client
const RATE_LIMIT_ENTRY_TTL_MS = 10 * 60 * 1000; // 10 minutes

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const entry = clientRequests.get(clientId);

  if (!entry || entry.resetAt < now) {
    clientRequests.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS, lastSeen: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    entry.lastSeen = now;
    return false;
  }

  entry.count++;
  entry.lastSeen = now;
  return true;
}

function getHeaderString(req: Request, header: string): string | undefined {
  const value = req.headers[header.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;
  return undefined;
}

function closeSession(sessionId: string, entry: SessionEntry, reason: string): Promise<void> {
  sessions.delete(sessionId);
  deleteMcpSession(sessionId);
  mcpSessionsActive.set(sessions.size);

  return Promise.allSettled([entry.transport.close(), entry.server.close()]).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') {
        logger.debug('Error closing MCP session', { sessionId, reason, error: String(r.reason) });
      }
    }
  });
}

function cleanupStaleSessions(): void {
  const now = Date.now();
  const staleThreshold = now - SESSION_TTL_HOURS * 60 * 60 * 1000;
  let cleaned = 0;

  for (const [sessionId, entry] of sessions) {
    if (entry.lastActivity < staleThreshold) {
      void closeSession(sessionId, entry, 'stale');
      cleaned++;
    }
  }

  // Also clean DB sessions
  const dbCleaned = cleanupOldMcpSessions(SESSION_TTL_HOURS);

  // Clean OAuth storage
  const expiredCodes = cleanupExpiredMcpOAuthCodes();
  const expiredTokens = cleanupExpiredMcpOAuthTokens();

  // Prune old rate limit entries
  let prunedRateLimits = 0;
  for (const [clientId, entry] of clientRequests) {
    if (entry.lastSeen < now - RATE_LIMIT_ENTRY_TTL_MS) {
      clientRequests.delete(clientId);
      prunedRateLimits++;
    }
  }

  // Update session gauge
  mcpSessionsActive.set(sessions.size);

  if (cleaned > 0 || dbCleaned > 0 || expiredCodes > 0 || expiredTokens > 0 || prunedRateLimits > 0) {
    logger.debug('MCP cleanup', {
      sessionsClosed: cleaned,
      sessionsDeleted: dbCleaned,
      oauthCodesDeleted: expiredCodes,
      oauthTokensDeleted: expiredTokens,
      rateLimitEntriesPruned: prunedRateLimits,
    });
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
    closePromises.push(closeSession(sessionId, entry, 'shutdown'));
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
      provider: provider as Parameters<typeof mcpAuthRouter>[0]['provider'],
      issuerUrl: baseUrl,
      baseUrl,
      resourceServerUrl: mcpUrl,
      resourceName: 'KAMIYO MCP Server',
      scopesSupported: ['mcp:tools', 'mcp:tools:escrow', 'mcp:tools:x402'],
      serviceDocumentationUrl: new URL('https://github.com/kamiyo-ai/kamiyo-protocol/tree/main/packages/kamiyo-mcp'),
    }) as unknown as RequestHandler
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
    json({ limit: '1mb' }),
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

      const sessionId = getHeaderString(req, 'mcp-session-id');
      const requestStart = Date.now();

      try {
        if (req.method === 'DELETE') {
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!;
            if (session.clientId !== mcpAuth.clientId) {
              mcpRequestsTotal.inc({ method: 'DELETE', status: '403' });
              res.status(403).json({ error: 'forbidden' });
              return;
            }
            await closeSession(sessionId, session, 'delete');
          }
          mcpRequestsTotal.inc({ method: 'DELETE', status: '204' });
          res.status(204).end();
          return;
        }

        let session = sessionId ? sessions.get(sessionId) : undefined;
        if (session && session.clientId !== mcpAuth.clientId) {
          mcpRequestsTotal.inc({ method: req.method, status: '403' });
          res.status(403).json({ error: 'forbidden' });
          return;
        }

        if (!session && req.method === 'POST') {
          // Check session limit
          if (countClientSessions(mcpAuth.clientId) >= MAX_SESSIONS_PER_CLIENT) {
            mcpRequestsTotal.inc({ method: 'POST', status: '429' });
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
              const closed = sessions.get(newSessionId);
              if (!closed) return;
              sessions.delete(newSessionId);
              deleteMcpSession(newSessionId);
              mcpSessionsActive.set(sessions.size);
              void closed.server.close().catch((err) => {
                logger.debug('Error closing MCP server', { sessionId: newSessionId, error: String(err) });
              });
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

        // Record metrics
        const latencySeconds = (Date.now() - requestStart) / 1000;
        mcpRequestsTotal.inc({ method: req.method, status: String(res.statusCode) });
        mcpRequestLatency.observe({ method: req.method }, latencySeconds);
      } catch (err: any) {
        logger.error('MCP request error', { error: err instanceof Error ? err.message : String(err), clientId: mcpAuth.clientId });
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
