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
    { ownership: 'legacy', path: '/api/trust-graph', handlers: [publicReadLimiter, trustGraphRoutes] },
    { ownership: 'legacy', path: '/api/fusion/fairscale', handlers: [fairscaleFusionRoutes] },
    { ownership: 'legacy', path: '/api/paranet', handlers: [paranetRoutes] },
    { ownership: 'legacy', path: '/api/poch', handlers: [pochRoutes] },
    { ownership: 'legacy', path: '/api/staking/referrals', handlers: [stakingReferralRoutes] },
    { ownership: 'legacy', path: '/babyagi/v1', handlers: [babyagiRoutes] },
  ];
}
