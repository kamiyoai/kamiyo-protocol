import { beforeAll, describe, expect, it } from 'vitest';
import { Router } from 'express';
import type * as RouteGroups from '../api/route-groups';

let routeGroups: typeof RouteGroups;

function getRouteGroups(): typeof RouteGroups {
  if (!routeGroups) {
    throw new Error('Route groups are not initialized');
  }

  return routeGroups;
}

const passThroughLimiter = Router();

describe('api route ownership groups', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-jwt-secret';
    process.env.API_SECRET ??= 'test-api-secret';
    routeGroups = await import('../api/route-groups');
  });

  it('builds a stable ownership collection for the api entrypoint', () => {
    const { createApiRouteGroupCollection } = getRouteGroups();
    const groups = createApiRouteGroupCollection(passThroughLimiter);

    expect(groups.protectedRoutes.length).toBeGreaterThan(0);
    expect(groups.kizunaCore.length).toBeGreaterThan(0);
    expect(groups.modules.length).toBeGreaterThan(0);
    expect(groups.legacy.length).toBeGreaterThan(0);
  });

  it('keeps route paths unique across ownership groups', () => {
    const { createApiRouteGroupCollection } = getRouteGroups();
    const grouped = createApiRouteGroupCollection(passThroughLimiter);
    const groups = [...grouped.protectedRoutes, ...grouped.kizunaCore, ...grouped.modules, ...grouped.legacy];

    const seen = new Set<string>();
    for (const group of groups) {
      expect(seen.has(group.path)).toBe(false);
      seen.add(group.path);
    }
  });

  it('keeps Kizuna core routes separate from retained legacy routes', () => {
    const { createKizunaCoreRouteGroups, createLegacyRouteGroups } = getRouteGroups();
    const corePaths = createKizunaCoreRouteGroups(passThroughLimiter).map((group) => group.path);
    const legacyPaths = createLegacyRouteGroups(passThroughLimiter).map((group) => group.path);

    expect(corePaths).toContain('/api/credits');
    expect(corePaths).toContain('/api/paid');
    expect(corePaths).toContain('/api/meishi');
    expect(corePaths).toContain('/api/dkg');

    expect(legacyPaths).toContain('/api/trust-graph');
    expect(legacyPaths).toContain('/api/fusion/fairscale');
    expect(legacyPaths).toContain('/api/paranet');
    expect(legacyPaths).toContain('/api/poch');
  });

  it('keeps Kizuna-powered module routes out of the legacy bucket', () => {
    const { createLegacyRouteGroups, createModuleRouteGroups } = getRouteGroups();
    const modulePaths = createModuleRouteGroups().map((group) => group.path);
    const legacyPaths = new Set(createLegacyRouteGroups(passThroughLimiter).map((group) => group.path));

    expect(modulePaths).toContain('/api/hive');
    expect(modulePaths).toContain('/api/hive-teams');
    expect(modulePaths).toContain('/api/swarm-teams');

    for (const path of modulePaths) {
      expect(legacyPaths.has(path)).toBe(false);
    }
  });
});
