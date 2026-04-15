import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

import { createKizunaCoreRouteGroups } from './kizuna-core';
import { createLegacyRouteGroups } from './legacy';
import { createModuleRouteGroups } from './modules';
import { createProtectedRouteGroups } from './protected';
import type { ApiRouteGroup, ApiRouteGroupCollection } from './types';
import type { CompanionRuntimeState } from '../../runtime-profile';

export type { ApiRouteGroup, ApiRouteGroupCollection, ApiRouteOwnership } from './types';
export type { ApiEdgeRouteGroup } from './edge';
export { EDGE_ROUTE_IDS, createEdgeRouteGroups, mountEdgeRouteGroups } from './edge';
export const SUPPORT_ROUTE_IDS = [
  'hive-swarm',
  'poch-store',
  'agent-performance',
  'variants',
  'company',
  'internal-revenue',
] as const;

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

  for (const group of [
    ...groups.protectedRoutes,
    ...groups.kizunaCore,
    ...groups.modules,
    ...groups.legacy,
  ]) {
    for (const routeId of group.routeIds) {
      routeIds.add(routeId);
    }
  }

  return [...routeIds].sort();
}

export function createApiRouteGroupCollection(
  publicReadLimiter: RequestHandler
): ApiRouteGroupCollection {
  return createApiRouteGroupCollectionForRuntime(publicReadLimiter);
}

export function createApiRouteGroupCollectionForRuntime(
  publicReadLimiter: RequestHandler,
  runtime?: Pick<CompanionRuntimeState, 'moduleRoutesEnabled' | 'legacyRoutesEnabled'>
): ApiRouteGroupCollection {
  return {
    protectedRoutes: createProtectedRouteGroups(),
    kizunaCore: createKizunaCoreRouteGroups(publicReadLimiter),
    modules: runtime && !runtime.moduleRoutesEnabled ? [] : createModuleRouteGroups(),
    legacy:
      runtime && !runtime.legacyRoutesEnabled ? [] : createLegacyRouteGroups(publicReadLimiter),
  };
}

export function getMountedApiRouteGroups(
  groups: ApiRouteGroupCollection,
  runtime: Pick<CompanionRuntimeState, 'moduleRoutesEnabled' | 'legacyRoutesEnabled'>
): ApiRouteGroup[] {
  const mounted = [...groups.protectedRoutes, ...groups.kizunaCore];

  if (runtime.moduleRoutesEnabled) {
    mounted.push(...groups.modules);
  }

  if (runtime.legacyRoutesEnabled) {
    mounted.push(...groups.legacy);
  }

  return mounted;
}

export function mountApiRouteGroupCollection(
  app: Express,
  groups: ApiRouteGroupCollection,
  runtime: Pick<CompanionRuntimeState, 'moduleRoutesEnabled' | 'legacyRoutesEnabled'>
): void {
  mountApiRouteGroups(app, getMountedApiRouteGroups(groups, runtime));
}

export {
  createKizunaCoreRouteGroups,
  createLegacyRouteGroups,
  createModuleRouteGroups,
  createProtectedRouteGroups,
};
