import { once } from 'node:events';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import express, { Router } from 'express';
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

  it('builds a stable edge route collection for the api entrypoint', () => {
    const { createEdgeRouteGroups } = getRouteGroups();
    const groups = createEdgeRouteGroups(passThroughLimiter, passThroughLimiter);

    expect(groups.length).toBeGreaterThan(0);
    expect(groups.map((group) => group.path)).toContain('/verify');
    expect(groups.map((group) => group.path)).toContain('/api/auth');
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

  it('does not assign a route file to multiple ownership buckets', () => {
    const { createApiRouteGroupCollection } = getRouteGroups();
    const grouped = createApiRouteGroupCollection(passThroughLimiter);
    const ownershipByRouteId = new Map<string, Set<string>>();

    for (const group of [...grouped.protectedRoutes, ...grouped.kizunaCore, ...grouped.modules, ...grouped.legacy]) {
      for (const routeId of group.routeIds) {
        const ownerships = ownershipByRouteId.get(routeId) ?? new Set<string>();
        ownerships.add(group.ownership);
        ownershipByRouteId.set(routeId, ownerships);
      }
    }

    for (const ownerships of ownershipByRouteId.values()) {
      expect(ownerships.size).toBe(1);
    }
  });

  it('keeps Kizuna core routes separate from retained legacy routes', () => {
    const { createKizunaCoreRouteGroups, createLegacyRouteGroups } = getRouteGroups();
    const corePaths = createKizunaCoreRouteGroups(passThroughLimiter).map((group) => group.path);
    const legacyPaths = createLegacyRouteGroups(passThroughLimiter).map((group) => group.path);

    expect(corePaths).toContain('/api/credits');
    expect(corePaths).toContain('/api/paid');
    expect(corePaths).toContain('/api/partners/oobe');
    expect(corePaths).toContain('/api/sap');
    expect(corePaths).toContain('/api/meishi');
    expect(corePaths).toContain('/api/dkg');
    expect(corePaths).toContain('/api/fusion/fairscale');

    expect(legacyPaths).toContain('/api/trust-graph');
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

  it('accounts for every companion route file', () => {
    const {
      EDGE_ROUTE_IDS,
      SUPPORT_ROUTE_IDS,
      createApiRouteGroupCollection,
      listOwnedRouteIds,
    } = getRouteGroups();
    const groups = createApiRouteGroupCollection(passThroughLimiter);
    const accounted = new Set([
      ...listOwnedRouteIds(groups),
      ...EDGE_ROUTE_IDS,
      ...SUPPORT_ROUTE_IDS,
    ]);

    const routeDir = resolve(process.cwd(), 'src/api/routes');
    const routeFiles = readdirSync(routeDir)
      .filter((name) => name.endsWith('.ts'))
      .filter((name) => !name.startsWith('_'))
      .map((name) => name.replace(/\.ts$/, ''))
      .sort();

    expect([...accounted].sort()).toEqual(routeFiles);
  });

  it('keeps edge and support route files outside owned buckets', () => {
    const {
      EDGE_ROUTE_IDS,
      SUPPORT_ROUTE_IDS,
      createApiRouteGroupCollection,
      listOwnedRouteIds,
    } = getRouteGroups();
    const ownedRouteIds = new Set(listOwnedRouteIds(createApiRouteGroupCollection(passThroughLimiter)));

    for (const routeId of [...EDGE_ROUTE_IDS, ...SUPPORT_ROUTE_IDS]) {
      expect(ownedRouteIds.has(routeId)).toBe(false);
    }
  });

  it('mounts edge route groups without colliding with grouped ownership routes', () => {
    const { createApiRouteGroupCollection, createEdgeRouteGroups } = getRouteGroups();
    const grouped = createApiRouteGroupCollection(passThroughLimiter);
    const ownedPaths = new Set(
      [...grouped.protectedRoutes, ...grouped.kizunaCore, ...grouped.modules, ...grouped.legacy].map((group) => group.path)
    );
    const edgePaths = createEdgeRouteGroups(passThroughLimiter, passThroughLimiter).map((group) => group.path);

    for (const path of edgePaths) {
      expect(ownedPaths.has(path)).toBe(false);
    }
  });

  it('selects mounted route groups from the runtime profile', async () => {
    const {
      getMountedApiRouteGroups,
      createApiRouteGroupCollection,
      createApiRouteGroupCollectionForRuntime,
    } = getRouteGroups();
    const { getCompanionRuntimeState } = await import('../runtime-profile');
    const grouped = createApiRouteGroupCollection(passThroughLimiter);
    const coreGrouped = createApiRouteGroupCollectionForRuntime(passThroughLimiter, getCompanionRuntimeState());

    const coreOnly = getMountedApiRouteGroups(grouped, getCompanionRuntimeState());
    const full = getMountedApiRouteGroups(
      grouped,
      getCompanionRuntimeState({ COMPANION_RUNTIME_PROFILE: 'full' } as NodeJS.ProcessEnv)
    );

    const corePaths = coreOnly.map((group) => group.path);
    const fullPaths = full.map((group) => group.path);

    expect(coreGrouped.modules).toEqual([]);
    expect(coreGrouped.legacy).toEqual([]);
    expect(corePaths).toContain('/api/credits');
    expect(corePaths).toContain('/api/v1/chat');
    expect(corePaths).toContain('/api/fusion/fairscale');
    expect(corePaths).not.toContain('/api/hive');

    expect(fullPaths).toContain('/api/hive');
    expect(fullPaths).toContain('/api/fusion/fairscale');
  });

  it('adds ownership headers to grouped routes and marks legacy routes explicitly', async () => {
    const { mountApiRouteGroups, mountEdgeRouteGroups } = getRouteGroups();
    const app = express();

    const edgeRouter = Router();
    edgeRouter.get('/ready', (_req, res) => {
      res.json({ ok: true });
    });

    const coreRouter = Router();
    coreRouter.get('/health', (_req, res) => {
      res.json({ ok: true });
    });

    const legacyRouter = Router();
    legacyRouter.get('/status', (_req, res) => {
      res.json({ ok: true });
    });

    mountEdgeRouteGroups(app, [{ path: '/edge', handlers: [edgeRouter] }]);
    mountApiRouteGroups(app, [
      { ownership: 'kizuna-core', routeIds: ['credits'], path: '/core', handlers: [coreRouter] },
      { ownership: 'legacy', routeIds: ['trust-graph'], path: '/legacy', handlers: [legacyRouter] },
    ]);

    const server = app.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;
      const edgeRes = await fetch(`${baseUrl}/edge/ready`);
      const coreRes = await fetch(`${baseUrl}/core/health`);
      const legacyRes = await fetch(`${baseUrl}/legacy/status`);

      expect(edgeRes.headers.get('x-kamiyo-route-ownership')).toBe('edge');
      expect(coreRes.headers.get('x-kamiyo-route-ownership')).toBe('kizuna-core');
      expect(coreRes.headers.get('x-kamiyo-route-status')).toBeNull();
      expect(legacyRes.headers.get('x-kamiyo-route-ownership')).toBe('legacy');
      expect(legacyRes.headers.get('x-kamiyo-route-status')).toBe('legacy');
    } finally {
      server.close();
    }
  });
});
