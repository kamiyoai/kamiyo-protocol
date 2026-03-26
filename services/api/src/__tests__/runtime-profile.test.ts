import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getCompanionRuntimeState,
  resolveCompanionRouteSurface,
  resolveCompanionRuntimeProfile,
} from '../runtime-profile';

let createApiServer: typeof import('../api').createApiServer;
const originalDataDir = process.env.DATA_DIR;
let tempDataDir = '';

describe('companion runtime profile', () => {
  it('defaults to kizuna-core', () => {
    expect(resolveCompanionRuntimeProfile(undefined)).toBe('kizuna-core');
    expect(resolveCompanionRuntimeProfile('unexpected')).toBe('kizuna-core');
    expect(resolveCompanionRouteSurface(undefined, 'kizuna-core')).toBe('kizuna-core');
  });

  it('enables module and legacy workers only in full profile', () => {
    expect(getCompanionRuntimeState({ COMPANION_RUNTIME_PROFILE: 'full' } as NodeJS.ProcessEnv)).toEqual({
      profile: 'full',
      routeSurface: 'full',
      backgroundOwnerships: ['kizuna-core', 'module', 'legacy'],
      routeOwnerships: ['protected', 'kizuna-core', 'module', 'legacy'],
      moduleBackgroundsEnabled: true,
      legacyBackgroundsEnabled: true,
      moduleRoutesEnabled: true,
      legacyRoutesEnabled: true,
    });

    expect(getCompanionRuntimeState({} as NodeJS.ProcessEnv)).toEqual({
      profile: 'kizuna-core',
      routeSurface: 'kizuna-core',
      backgroundOwnerships: ['kizuna-core'],
      routeOwnerships: ['protected', 'kizuna-core'],
      moduleBackgroundsEnabled: false,
      legacyBackgroundsEnabled: false,
      moduleRoutesEnabled: false,
      legacyRoutesEnabled: false,
    });
  });

  it('lets full background mode keep a kizuna-core route surface', () => {
    expect(
      getCompanionRuntimeState({
        COMPANION_RUNTIME_PROFILE: 'full',
        COMPANION_ROUTE_SURFACE: 'kizuna-core',
      } as NodeJS.ProcessEnv)
    ).toEqual({
      profile: 'full',
      routeSurface: 'kizuna-core',
      backgroundOwnerships: ['kizuna-core', 'module', 'legacy'],
      routeOwnerships: ['protected', 'kizuna-core'],
      moduleBackgroundsEnabled: true,
      legacyBackgroundsEnabled: true,
      moduleRoutesEnabled: false,
      legacyRoutesEnabled: false,
    });
  });

  it('does not let kizuna-core mode widen the public surface', () => {
    expect(
      getCompanionRuntimeState({
        COMPANION_ROUTE_SURFACE: 'full',
      } as NodeJS.ProcessEnv)
    ).toEqual({
      profile: 'kizuna-core',
      routeSurface: 'kizuna-core',
      backgroundOwnerships: ['kizuna-core'],
      routeOwnerships: ['protected', 'kizuna-core'],
      moduleBackgroundsEnabled: false,
      legacyBackgroundsEnabled: false,
      moduleRoutesEnabled: false,
      legacyRoutesEnabled: false,
    });
  });
});

describe('api version runtime metadata', () => {
  beforeAll(async () => {
    tempDataDir = mkdtempSync(join(tmpdir(), 'kamiyo-runtime-profile-'));
    process.env.JWT_SECRET ??= 'test-jwt-secret';
    process.env.API_SECRET ??= 'test-api-secret';
    process.env.DATA_DIR = tempDataDir;
    ({ createApiServer } = await import('../api'));
  });

  afterAll(() => {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;

    if (tempDataDir) {
      rmSync(tempDataDir, { recursive: true, force: true });
      tempDataDir = '';
    }
  });

  it('reports the injected runtime profile on /version', async () => {
    const app = createApiServer({
      runtime: getCompanionRuntimeState({ COMPANION_RUNTIME_PROFILE: 'full' } as NodeJS.ProcessEnv),
    });
    const server = app.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/version`);
      const body = (await response.json()) as {
        runtime: { profile: string; routeSurface: string; backgroundOwnerships: string[]; routeOwnerships: string[] };
        capabilities: {
          credits: { enabled: boolean; state: string; reason: string | null };
          x402: { enabled: boolean; state: string; reason: string | null };
          mcp: { enabled: boolean; state: string; publicBaseUrl: string; source: string };
        };
      };

      expect(response.status).toBe(200);
      expect(body.runtime.profile).toBe('full');
      expect(body.runtime.routeSurface).toBe('full');
      expect(body.runtime.backgroundOwnerships).toEqual(['kizuna-core', 'module', 'legacy']);
      expect(body.runtime.routeOwnerships).toEqual(['protected', 'kizuna-core', 'module', 'legacy']);
      expect(body.capabilities.credits).toMatchObject({
        enabled: false,
        state: 'disabled',
        reason: 'treasury_wallet_missing',
      });
      expect(body.capabilities.x402).toMatchObject({
        enabled: false,
        state: 'disabled',
        reason: 'merchant_wallet_missing',
      });
      expect(body.capabilities.mcp).toMatchObject({
        enabled: true,
        state: 'ready',
      });
    } finally {
      server.close();
    }
  });

  it('keeps module routes dark while restoring the FairScale partner surface in kizuna-core profile', async () => {
    const app = createApiServer({
      runtime: getCompanionRuntimeState(),
    });
    const server = app.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;
      const core = await fetch(`${baseUrl}/api/credits/info`);
      const moduleRoute = await fetch(`${baseUrl}/api/hive/health`);
      const legacyRoute = await fetch(`${baseUrl}/api/fusion/fairscale/health`);
      const coreBody = (await core.json()) as {
        enabled: boolean;
        state: string;
        reason: string | null;
      };

      expect(core.status).toBe(200);
      expect(core.headers.get('x-kamiyo-route-ownership')).toBe('kizuna-core');
      expect(coreBody).toMatchObject({
        enabled: false,
        state: 'disabled',
        reason: 'treasury_wallet_missing',
      });
      expect(moduleRoute.status).toBe(404);
      expect(legacyRoute.status).toBe(200);
      expect(legacyRoute.headers.get('x-kamiyo-route-ownership')).toBe('kizuna-core');
    } finally {
      server.close();
    }
  });

  it('serves x402 discovery from the api host as an edge-owned route', async () => {
    const app = createApiServer({
      runtime: getCompanionRuntimeState(),
    });
    const server = app.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/.well-known/x402`);
      const body = (await response.json()) as {
        version: number;
        resources: Array<{ path: string }>;
        links: { sapMetadata: string; paidPricing: string };
      };

      expect(response.status).toBe(200);
      expect(response.headers.get('x-kamiyo-route-ownership')).toBe('edge');
      expect(body.version).toBe(2);
      expect(body.resources.map((resource) => resource.path)).toEqual(
        expect.arrayContaining(['/api/paid/chat', '/api/paid/market', '/api/sap/execute'])
      );
      expect(body.links.sapMetadata).toContain('/api/sap/metadata');
      expect(body.links.paidPricing).toContain('/api/paid/pricing');
    } finally {
      server.close();
    }
  });

  it('can keep module routes dark while full backgrounds run on the narrowed public surface', async () => {
    const app = createApiServer({
      runtime: getCompanionRuntimeState({
        COMPANION_RUNTIME_PROFILE: 'full',
        COMPANION_ROUTE_SURFACE: 'kizuna-core',
      } as NodeJS.ProcessEnv),
    });
    const server = app.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;
      const version = await fetch(`${baseUrl}/version`);
      const moduleRoute = await fetch(`${baseUrl}/api/hive/health`);
      const legacyRoute = await fetch(`${baseUrl}/api/fusion/fairscale/health`);
      const body = (await version.json()) as {
        runtime: { profile: string; routeSurface: string; backgroundOwnerships: string[]; routeOwnerships: string[] };
      };

      expect(version.status).toBe(200);
      expect(body.runtime.profile).toBe('full');
      expect(body.runtime.routeSurface).toBe('kizuna-core');
      expect(body.runtime.backgroundOwnerships).toEqual(['kizuna-core', 'module', 'legacy']);
      expect(body.runtime.routeOwnerships).toEqual(['protected', 'kizuna-core']);
      expect(moduleRoute.status).toBe(404);
      expect(legacyRoute.status).toBe(200);
      expect(legacyRoute.headers.get('x-kamiyo-route-ownership')).toBe('kizuna-core');
    } finally {
      server.close();
    }
  });
});
