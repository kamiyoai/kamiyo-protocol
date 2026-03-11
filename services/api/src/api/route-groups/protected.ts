import { authMiddleware, rateLimitMiddleware, tierMiddleware } from '../middleware';
import chatRoutes from '../routes/chat';
import tokensRoutes from '../routes/tokens';
import marketRoutes from '../routes/market';
import reputationRoutes from '../routes/reputation';
import type { ApiRouteGroup } from './types';

export function createProtectedRouteGroups(): ApiRouteGroup[] {
  return [
    {
      ownership: 'protected',
      path: '/api/v1/chat',
      handlers: [authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), chatRoutes],
    },
    {
      ownership: 'protected',
      path: '/api/v1/tokens',
      handlers: [authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), tokensRoutes],
    },
    {
      ownership: 'protected',
      path: '/api/v1/market',
      handlers: [authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), marketRoutes],
    },
    {
      ownership: 'protected',
      path: '/api/v1/reputation',
      handlers: [authMiddleware, rateLimitMiddleware, tierMiddleware('pro'), reputationRoutes],
    },
  ];
}
