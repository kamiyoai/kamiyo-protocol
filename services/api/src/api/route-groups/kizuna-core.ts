import type { RequestHandler } from 'express';

import paidRoutes from '../routes/paid';
import oobePartnerRoutes from '../routes/oobe-partner';
import creditsRoutes from '../routes/credits';
import linkWalletRoutes from '../routes/link-wallet';
import internalHoldersRoutes from '../routes/internal-holders';
import meishiRoutes from '../routes/meishi';
import meishiDkgRoutes from '../routes/meishi-dkg';
import dkgRoutes from '../routes/dkg';
import type { ApiRouteGroup } from './types';

export function createKizunaCoreRouteGroups(publicReadLimiter: RequestHandler): ApiRouteGroup[] {
  return [
    { ownership: 'kizuna-core', routeIds: ['paid'], path: '/api/paid', handlers: [paidRoutes] },
    { ownership: 'kizuna-core', routeIds: ['oobe-partner'], path: '/api/partners/oobe', handlers: [oobePartnerRoutes] },
    { ownership: 'kizuna-core', routeIds: ['credits'], path: '/api/credits', handlers: [creditsRoutes] },
    { ownership: 'kizuna-core', routeIds: ['link-wallet'], path: '/api/link-wallet', handlers: [linkWalletRoutes] },
    { ownership: 'kizuna-core', routeIds: ['internal-holders'], path: '/internal/holders', handlers: [internalHoldersRoutes] },
    { ownership: 'kizuna-core', routeIds: ['meishi'], path: '/api/meishi', handlers: [publicReadLimiter, meishiRoutes] },
    { ownership: 'kizuna-core', routeIds: ['meishi-dkg'], path: '/api/meishi-dkg', handlers: [publicReadLimiter, meishiDkgRoutes] },
    { ownership: 'kizuna-core', routeIds: ['dkg'], path: '/api/dkg', handlers: [publicReadLimiter, dkgRoutes] },
  ];
}
