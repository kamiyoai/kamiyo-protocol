// MCP Routes - OAuth + Streamable HTTP transport

import { Router, json, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { KamiyoOAuthProvider } from './oauth/provider.js';
import { createMCPServer, McpAuthInfo } from './server.js';
import { createMcpSession, updateMcpSessionActivity, deleteMcpSession } from '../db.js';

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

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
      res.status(401).json({ error: err.message || 'invalid token' });
    }
  };
}

export function createMCPRoutes(): Router {
  const router = Router();
  const provider = new KamiyoOAuthProvider();

  const baseUrlStr = process.env.API_BASE_URL || 'https://kamiyo-protocol-4c70.onrender.com';
  const baseUrl = new URL(baseUrlStr);
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

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      try {
        if (req.method === 'DELETE') {
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
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          const server = createMCPServer(mcpAuth);
          await server.connect(transport);

          const newSessionId = transport.sessionId;
          if (newSessionId) {
            session = { transport, server };
            sessions.set(newSessionId, session);

            createMcpSession({
              session_id: newSessionId,
              client_id: mcpAuth.clientId,
              user_wallet: (mcpAuth.extra?.wallet as string) || null,
            });

            transport.onclose = () => {
              sessions.delete(newSessionId);
              deleteMcpSession(newSessionId);
            };
          }
        }

        if (!session) {
          if (req.method === 'GET' && !sessionId) {
            res.status(400).json({ error: 'session id required for SSE' });
            return;
          }
          res.status(404).json({ error: 'session not found' });
          return;
        }

        if (session.transport.sessionId) {
          updateMcpSessionActivity(session.transport.sessionId);
        }

        const mcpReq = req as any;
        mcpReq.auth = mcpAuth;
        await session.transport.handleRequest(mcpReq, res, req.body);
      } catch (err: any) {
        console.error('[MCP] error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: err.message || 'internal error' });
        }
      }
    }
  );

  return router;
}

export { KamiyoOAuthProvider } from './oauth/provider.js';
export { KamiyoOAuthClientsStore } from './oauth/clients-store.js';
export { createMCPServer } from './server.js';
