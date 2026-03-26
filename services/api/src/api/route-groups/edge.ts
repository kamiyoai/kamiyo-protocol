import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

import authRoutes from '../routes/auth';
import verifyRoutes from '../routes/verify';
import blacklistRoutes from '../routes/blacklist';
import x402DiscoveryRoutes from '../routes/x402-discovery';

export interface ApiEdgeRouteGroup {
  path: string;
  handlers: RequestHandler[];
}

export const EDGE_ROUTE_IDS = ['auth', 'verify', 'blacklist', 'x402-discovery'] as const;

function createEdgeHeaders(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Kamiyo-Route-Ownership', 'edge');
    next();
  };
}

export function createEdgeRouteGroups(
  authRateLimiter: RequestHandler,
  apiKeyRateLimiter: RequestHandler
): ApiEdgeRouteGroup[] {
  return [
    { path: '/.well-known/x402', handlers: [x402DiscoveryRoutes] },
    { path: '/verify', handlers: [authRateLimiter, verifyRoutes] },
    { path: '/blacklist', handlers: [authRateLimiter, blacklistRoutes] },
    { path: '/api/auth/challenge', handlers: [authRateLimiter] },
    { path: '/api/auth/verify', handlers: [apiKeyRateLimiter] },
    { path: '/api/auth/refresh', handlers: [apiKeyRateLimiter] },
    { path: '/api/auth', handlers: [authRoutes] },
  ];
}

export function mountEdgeRouteGroups(app: Express, groups: ApiEdgeRouteGroup[]): void {
  for (const group of groups) {
    app.use(group.path, createEdgeHeaders(), ...group.handlers);
  }
}
