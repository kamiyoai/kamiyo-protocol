/**
 * MCP Routes
 * OAuth endpoints + Streamable HTTP transport
 */

import { Router, json, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { KamiyoOAuthProvider } from './oauth/provider.js';
import { createMCPServer, McpAuthInfo } from './server.js';
import { createMcpSession, updateMcpSessionActivity, deleteMcpSession } from '../db.js';

// Session storage for active MCP transports
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

// Cleanup interval for stale sessions (every 5 minutes)
setInterval(() => {
  // Cleanup handled via explicit close or DB cleanup
}, 5 * 60 * 1000);

// Custom bearer auth middleware that uses mcpAuth instead of auth to avoid type conflicts
function mcpBearerAuth(provider: KamiyoOAuthProvider, resourceMetadataUrl: string) {
  return async (req: Request & { mcpAuth?: McpAuthInfo }, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.setHeader(
        'WWW-Authenticate',
        `Bearer resource_metadata="${resourceMetadataUrl}"`
      );
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const authInfo = await provider.verifyAccessToken(token);
      req.mcpAuth = authInfo;
      next();
    } catch (error: any) {
      res.setHeader(
        'WWW-Authenticate',
        `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token"`
      );
      res.status(401).json({ error: error.message || 'Invalid token' });
    }
  };
}

/**
 * Create MCP routes with OAuth and Streamable HTTP transport
 */
export function createMCPRoutes(): Router {
  const router = Router();
  const provider = new KamiyoOAuthProvider();

  // Base URL from environment or default
  const baseUrlStr = process.env.API_BASE_URL || 'https://kamiyo-protocol-4c70.onrender.com';
  const baseUrl = new URL(baseUrlStr);
  const mcpUrl = new URL('/mcp', baseUrl);

  // Mount OAuth routes (metadata, register, authorize, token, revoke)
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

  // MCP endpoint requires bearer auth
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpUrl);

  // Handle MCP requests (POST for messages, GET for SSE stream)
  router.all(
    '/mcp',
    json(),
    mcpBearerAuth(provider, resourceMetadataUrl),
    async (req: Request & { mcpAuth?: McpAuthInfo }, res: Response) => {
      const mcpAuth = req.mcpAuth;
      if (!mcpAuth) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      try {
        if (req.method === 'DELETE') {
          // Session termination
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!;
            await session.transport.close();
            sessions.delete(sessionId);
            deleteMcpSession(sessionId);
          }
          res.status(204).end();
          return;
        }

        let session = sessionId ? sessions.get(sessionId) : undefined;

        if (!session && req.method === 'POST') {
          // New session - create transport and server
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          const server = createMCPServer(mcpAuth);
          await server.connect(transport);

          const newSessionId = transport.sessionId;
          if (newSessionId) {
            session = { transport, server };
            sessions.set(newSessionId, session);

            // Record session in DB
            createMcpSession({
              session_id: newSessionId,
              client_id: mcpAuth.clientId,
              user_wallet: (mcpAuth.extra?.wallet as string) || null,
            });

            // Cleanup on close
            transport.onclose = () => {
              if (newSessionId) {
                sessions.delete(newSessionId);
                deleteMcpSession(newSessionId);
              }
            };
          }
        }

        if (!session) {
          if (req.method === 'GET' && !sessionId) {
            // GET without session - not allowed for SSE
            res.status(400).json({ error: 'Mcp-Session-Id header required for SSE stream' });
            return;
          }
          res.status(404).json({ error: 'Session not found' });
          return;
        }

        // Update session activity
        if (session.transport.sessionId) {
          updateMcpSessionActivity(session.transport.sessionId);
        }

        // Handle request through transport
        // Cast to any to satisfy SDK's expected req.auth type
        const mcpReq = req as any;
        mcpReq.auth = mcpAuth;
        await session.transport.handleRequest(mcpReq, res, req.body);
      } catch (error: any) {
        console.error('[MCP] Request error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: error.message || 'Internal server error' });
        }
      }
    }
  );

  return router;
}

export { KamiyoOAuthProvider } from './oauth/provider.js';
export { KamiyoOAuthClientsStore } from './oauth/clients-store.js';
export { createMCPServer } from './server.js';
