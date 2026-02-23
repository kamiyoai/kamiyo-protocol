import { describe, expect, it } from 'vitest';
import { getRouteLabel } from './server';

describe('server', () => {
  it('prefers the express route template when available', () => {
    const req = {
      baseUrl: '',
      path: '/autonomy/tasks/123',
      route: { path: '/autonomy/tasks/:taskId' },
    } as any;

    expect(getRouteLabel(req)).toBe('/autonomy/tasks/:taskId');
  });

  it('includes baseUrl when set', () => {
    const req = {
      baseUrl: '/autonomy',
      path: '/autonomy/tasks/123',
      route: { path: '/tasks/:taskId' },
    } as any;

    expect(getRouteLabel(req)).toBe('/autonomy/tasks/:taskId');
  });

  it('falls back to req.path when route is not available', () => {
    const req = {
      baseUrl: '',
      path: '/metrics',
    } as any;

    expect(getRouteLabel(req)).toBe('/metrics');
  });
});

