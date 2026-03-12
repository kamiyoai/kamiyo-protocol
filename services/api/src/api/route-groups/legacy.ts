import type { RequestHandler } from 'express';
import trustGraphRoutes from '../routes/trust-graph';
import fairscaleFusionRoutes from '../routes/fairscale-fusion';
import paranetRoutes from '../routes/paranet';
import pochRoutes from '../routes/poch';
import stakingReferralRoutes from '../routes/staking-referrals';
import babyagiRoutes from '../routes/babyagi';

import type { ApiRouteGroup } from './types';

export function createLegacyRouteGroups(publicReadLimiter: RequestHandler): ApiRouteGroup[] {
  return [
    { ownership: 'legacy', routeIds: ['trust-graph'], path: '/api/trust-graph', handlers: [publicReadLimiter, trustGraphRoutes] },
    { ownership: 'legacy', routeIds: ['fairscale-fusion'], path: '/api/fusion/fairscale', handlers: [fairscaleFusionRoutes] },
    { ownership: 'legacy', routeIds: ['paranet'], path: '/api/paranet', handlers: [paranetRoutes] },
    { ownership: 'legacy', routeIds: ['poch'], path: '/api/poch', handlers: [pochRoutes] },
    { ownership: 'legacy', routeIds: ['staking-referrals'], path: '/api/staking/referrals', handlers: [stakingReferralRoutes] },
    { ownership: 'legacy', routeIds: ['babyagi'], path: '/babyagi/v1', handlers: [babyagiRoutes] },
  ];
}
