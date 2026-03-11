import type { Express, RequestHandler } from 'express';

import { authMiddleware, rateLimitMiddleware, tierMiddleware } from './middleware';
import chatRoutes from './routes/chat';
import tokensRoutes from './routes/tokens';
import marketRoutes from './routes/market';
import reputationRoutes from './routes/reputation';
import swarmteamsRoutes from './routes/hive';
import kamiyoTokenRoutes from './routes/kamiyo-token';
import paidRoutes from './routes/paid';
import creditsRoutes from './routes/credits';
import linkWalletRoutes from './routes/link-wallet';
import internalHoldersRoutes from './routes/internal-holders';
import swarmTeamRoutes from './routes/hive-teams';
import buybackRoutes from './routes/buyback';
import channelsRoutes from './routes/channels';
import trustGraphRoutes from './routes/trust-graph';
import fairscaleFusionRoutes from './routes/fairscale-fusion';
import meishiRoutes from './routes/meishi';
import meishiDkgRoutes from './routes/meishi-dkg';
import dkgRoutes from './routes/dkg';
import paranetRoutes from './routes/paranet';
import pochRoutes from './routes/poch';
import stakingReferralRoutes from './routes/staking-referrals';
import babyagiRoutes from './routes/babyagi';

export type ApiRouteOwnership = 'protected' | 'kizuna-core' | 'module' | 'legacy';

export interface ApiRouteGroup {
  ownership: ApiRouteOwnership;
  path: string;
  handlers: RequestHandler[];
}

export interface ApiRouteGroupCollection {
  protectedRoutes: ApiRouteGroup[];
  kizunaCore: ApiRouteGroup[];
  modules: ApiRouteGroup[];
  legacy: ApiRouteGroup[];
}

export function mountApiRouteGroups(app: Express, groups: ApiRouteGroup[]): void {
  for (const group of groups) {
    app.use(group.path, ...group.handlers);
  }
}

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

export function createKizunaCoreRouteGroups(publicReadLimiter: RequestHandler): ApiRouteGroup[] {
  return [
    { ownership: 'kizuna-core', path: '/api/paid', handlers: [paidRoutes] },
    { ownership: 'kizuna-core', path: '/api/credits', handlers: [creditsRoutes] },
    { ownership: 'kizuna-core', path: '/api/link-wallet', handlers: [linkWalletRoutes] },
    { ownership: 'kizuna-core', path: '/internal/holders', handlers: [internalHoldersRoutes] },
    { ownership: 'kizuna-core', path: '/api/meishi', handlers: [publicReadLimiter, meishiRoutes] },
    { ownership: 'kizuna-core', path: '/api/meishi-dkg', handlers: [publicReadLimiter, meishiDkgRoutes] },
    { ownership: 'kizuna-core', path: '/api/dkg', handlers: [publicReadLimiter, dkgRoutes] },
  ];
}

export function createModuleRouteGroups(): ApiRouteGroup[] {
  return [
    { ownership: 'module', path: '/api/hive', handlers: [swarmteamsRoutes] },
    { ownership: 'module', path: '/api/hive-teams', handlers: [swarmTeamRoutes] },
    { ownership: 'module', path: '/api/swarm-teams', handlers: [swarmTeamRoutes] },
    { ownership: 'module', path: '/api/buyback', handlers: [buybackRoutes] },
    { ownership: 'module', path: '/api/channels', handlers: [channelsRoutes] },
    { ownership: 'module', path: '/api/kamiyo', handlers: [kamiyoTokenRoutes] },
  ];
}

export function createLegacyRouteGroups(publicReadLimiter: RequestHandler): ApiRouteGroup[] {
  return [
    { ownership: 'legacy', path: '/api/trust-graph', handlers: [publicReadLimiter, trustGraphRoutes] },
    { ownership: 'legacy', path: '/api/fusion/fairscale', handlers: [fairscaleFusionRoutes] },
    { ownership: 'legacy', path: '/api/paranet', handlers: [paranetRoutes] },
    { ownership: 'legacy', path: '/api/poch', handlers: [pochRoutes] },
    { ownership: 'legacy', path: '/api/staking/referrals', handlers: [stakingReferralRoutes] },
    { ownership: 'legacy', path: '/babyagi/v1', handlers: [babyagiRoutes] },
  ];
}

export function createApiRouteGroupCollection(publicReadLimiter: RequestHandler): ApiRouteGroupCollection {
  return {
    protectedRoutes: createProtectedRouteGroups(),
    kizunaCore: createKizunaCoreRouteGroups(publicReadLimiter),
    modules: createModuleRouteGroups(),
    legacy: createLegacyRouteGroups(publicReadLimiter),
  };
}

export function mountApiRouteGroupCollection(app: Express, groups: ApiRouteGroupCollection): void {
  mountApiRouteGroups(app, groups.protectedRoutes);
  mountApiRouteGroups(app, groups.kizunaCore);
  mountApiRouteGroups(app, groups.modules);
  mountApiRouteGroups(app, groups.legacy);
}
