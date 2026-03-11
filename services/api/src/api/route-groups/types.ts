import type { RequestHandler } from 'express';

export type ApiRouteOwnership = 'protected' | 'kizuna-core' | 'module' | 'legacy';

export interface ApiRouteGroup {
  ownership: ApiRouteOwnership;
  routeIds: string[];
  path: string;
  handlers: RequestHandler[];
}

export interface ApiRouteGroupCollection {
  protectedRoutes: ApiRouteGroup[];
  kizunaCore: ApiRouteGroup[];
  modules: ApiRouteGroup[];
  legacy: ApiRouteGroup[];
}
