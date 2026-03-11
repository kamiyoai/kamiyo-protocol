import type { Express, RequestHandler } from 'express';

import authRoutes from '../routes/auth';
import verifyRoutes from '../routes/verify';
import blacklistRoutes from '../routes/blacklist';

export interface ApiEdgeRouteGroup {
  path: string;
  handlers: RequestHandler[];
}

export const EDGE_ROUTE_IDS = ['auth', 'verify', 'blacklist'] as const;

export function createEdgeRouteGroups(
  authRateLimiter: RequestHandler,
  apiKeyRateLimiter: RequestHandler
): ApiEdgeRouteGroup[] {
  return [
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
    app.use(group.path, ...group.handlers);
  }
}
