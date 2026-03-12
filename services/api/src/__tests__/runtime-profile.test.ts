import { once } from 'node:events';
import { beforeAll, describe, expect, it } from 'vitest';

import { getCompanionRuntimeState, resolveCompanionRuntimeProfile } from '../runtime-profile';

let createApiServer: typeof import('../api').createApiServer;

describe('companion runtime profile', () => {
  it('defaults to kizuna-core', () => {
    expect(resolveCompanionRuntimeProfile(undefined)).toBe('kizuna-core');
    expect(resolveCompanionRuntimeProfile('unexpected')).toBe('kizuna-core');
  });

  it('enables module and legacy workers only in full profile', () => {
    expect(getCompanionRuntimeState({ COMPANION_RUNTIME_PROFILE: 'full' } as NodeJS.ProcessEnv)).toEqual({
      profile: 'full',
      backgroundOwnerships: ['kizuna-core', 'module', 'legacy'],
      routeOwnerships: ['protected', 'kizuna-core', 'module', 'legacy'],
      moduleBackgroundsEnabled: true,
      legacyBackgroundsEnabled: true,
      moduleRoutesEnabled: true,
      legacyRoutesEnabled: true,
    });

    expect(getCompanionRuntimeState({} as NodeJS.ProcessEnv)).toEqual({
      profile: 'kizuna-core',
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
    process.env.JWT_SECRET ??= 'test-jwt-secret';
    process.env.API_SECRET ??= 'test-api-secret';
    ({ createApiServer } = await import('../api'));
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
        runtime: { profile: string; backgroundOwnerships: string[]; routeOwnerships: string[] };
      };

      expect(response.status).toBe(200);
      expect(body.runtime.profile).toBe('full');
      expect(body.runtime.backgroundOwnerships).toEqual(['kizuna-core', 'module', 'legacy']);
      expect(body.runtime.routeOwnerships).toEqual(['protected', 'kizuna-core', 'module', 'legacy']);
    } finally {
      server.close();
    }
  });

  it('does not mount module or legacy routes in kizuna-core profile', async () => {
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

      expect([200, 503]).toContain(core.status);
      expect(core.headers.get('x-kamiyo-route-ownership')).toBe('kizuna-core');
      expect(moduleRoute.status).toBe(404);
      expect(legacyRoute.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
