import type { Express, RequestHandler } from 'express';

import { createKizunaCoreRouteGroups } from './kizuna-core';
import { createLegacyRouteGroups } from './legacy';
import { createModuleRouteGroups } from './modules';
import { createProtectedRouteGroups } from './protected';
import type { ApiRouteGroup, ApiRouteGroupCollection } from './types';

export type { ApiRouteGroup, ApiRouteGroupCollection, ApiRouteOwnership } from './types';

export function mountApiRouteGroups(app: Express, groups: ApiRouteGroup[]): void {
  for (const group of groups) {
    app.use(group.path, ...group.handlers);
  }
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
