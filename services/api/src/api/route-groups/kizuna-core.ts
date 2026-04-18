import type { RequestHandler } from 'express';

import paidRoutes from '../routes/paid';
import oobePartnerRoutes from '../routes/oobe-partner';
import sapRoutes from '../routes/sap';
import creditsRoutes from '../routes/credits';
import linkWalletRoutes from '../routes/link-wallet';
import internalHoldersRoutes from '../routes/internal-holders';
import internalMeishiRoutes from '../routes/internal-meishi';
import meishiRoutes from '../routes/meishi';
import meishiDkgRoutes from '../routes/meishi-dkg';
import dkgRoutes from '../routes/dkg';
import fairscaleFusionRoutes from '../routes/fairscale-fusion';
import realityForkRoutes from '../routes/reality-fork';
import buybackRoutes from '../routes/buyback';
import kamiyoTokenRoutes from '../routes/kamiyo-token';
import kizunaDashboardRoutes from '../routes/kizuna-dashboard';
import type { ApiRouteGroup } from './types';

export function createKizunaCoreRouteGroups(publicReadLimiter: RequestHandler): ApiRouteGroup[] {
  return [
    { ownership: 'kizuna-core', routeIds: ['paid'], path: '/api/paid', handlers: [paidRoutes] },
    {
      ownership: 'kizuna-core',
      routeIds: ['oobe-partner'],
      path: '/api/partners/oobe',
      handlers: [oobePartnerRoutes],
    },
    { ownership: 'kizuna-core', routeIds: ['sap'], path: '/api/sap', handlers: [sapRoutes] },
    {
      ownership: 'kizuna-core',
      routeIds: ['credits'],
      path: '/api/credits',
      handlers: [creditsRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['link-wallet'],
      path: '/api/link-wallet',
      handlers: [linkWalletRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['internal-holders'],
      path: '/internal/holders',
      handlers: [internalHoldersRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['internal-meishi'],
      path: '/internal/meishi',
      handlers: [internalMeishiRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['meishi'],
      path: '/api/meishi',
      handlers: [publicReadLimiter, meishiRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['meishi-dkg'],
      path: '/api/meishi-dkg',
      handlers: [publicReadLimiter, meishiDkgRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['dkg'],
      path: '/api/dkg',
      handlers: [publicReadLimiter, dkgRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['fairscale-fusion'],
      path: '/api/fusion/fairscale',
      handlers: [fairscaleFusionRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['reality-fork'],
      path: '/api/reality-fork',
      handlers: [realityForkRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['buyback'],
      path: '/api/buyback',
      handlers: [publicReadLimiter, buybackRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['kamiyo-token'],
      path: '/api/kamiyo',
      handlers: [publicReadLimiter, kamiyoTokenRoutes],
    },
    {
      ownership: 'kizuna-core',
      routeIds: ['kizuna-dashboard'],
      path: '/api/kizuna',
      handlers: [publicReadLimiter, kizunaDashboardRoutes],
    },
  ];
}
