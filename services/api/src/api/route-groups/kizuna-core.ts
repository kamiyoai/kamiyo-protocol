import type { RequestHandler } from 'express';

import paidRoutes from '../routes/paid';
import creditsRoutes from '../routes/credits';
import linkWalletRoutes from '../routes/link-wallet';
import internalHoldersRoutes from '../routes/internal-holders';
import meishiRoutes from '../routes/meishi';
import meishiDkgRoutes from '../routes/meishi-dkg';
import dkgRoutes from '../routes/dkg';
import type { ApiRouteGroup } from './types';

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
