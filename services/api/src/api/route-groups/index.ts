import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

import { createKizunaCoreRouteGroups } from './kizuna-core';
import { createLegacyRouteGroups } from './legacy';
import { createModuleRouteGroups } from './modules';
import { createProtectedRouteGroups } from './protected';
import type { ApiRouteGroup, ApiRouteGroupCollection } from './types';

export type { ApiRouteGroup, ApiRouteGroupCollection, ApiRouteOwnership } from './types';
export type { ApiEdgeRouteGroup } from './edge';
export { EDGE_ROUTE_IDS, createEdgeRouteGroups, mountEdgeRouteGroups } from './edge';
export const SUPPORT_ROUTE_IDS = ['hive-swarm', 'poch-store'] as const;

function createOwnershipHeaders(ownership: ApiRouteGroup['ownership']): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Kamiyo-Route-Ownership', ownership);
    if (ownership === 'legacy') {
      res.setHeader('X-Kamiyo-Route-Status', 'legacy');
    }
    next();
  };
}

export function mountApiRouteGroups(app: Express, groups: ApiRouteGroup[]): void {
  for (const group of groups) {
    app.use(group.path, createOwnershipHeaders(group.ownership), ...group.handlers);
  }
}

export function listOwnedRouteIds(groups: ApiRouteGroupCollection): string[] {
  const routeIds = new Set<string>();

  for (const group of [...groups.protectedRoutes, ...groups.kizunaCore, ...groups.modules, ...groups.legacy]) {
    for (const routeId of group.routeIds) {
      routeIds.add(routeId);
    }
  }

  return [...routeIds].sort();
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

export {
  createKizunaCoreRouteGroups,
  createLegacyRouteGroups,
  createModuleRouteGroups,
  createProtectedRouteGroups,
};
