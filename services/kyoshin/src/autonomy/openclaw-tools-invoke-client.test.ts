import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenClawToolsInvokeClient } from './openclaw-tools-invoke-client';
import type { AutonomyTask } from './types';

const TASK_ID = '11111111-1111-1111-1111-111111111111';

function createTask(overrides: Partial<AutonomyTask> = {}): AutonomyTask {
  return {
    id: TASK_ID,
    source: 'x',
    objective: 'do the thing',
    priority: 3,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 0,
    ...overrides,
  };
}

describe('OpenClawToolsInvokeClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn();
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('invokes sessions_send via tools/invoke and returns receipt', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: { details: { runId: 'r1', status: 'ok', reply: 'ok' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const client = new OpenClawToolsInvokeClient({
      baseUrl: 'http://127.0.0.1:18789',
      gatewayToken: 'token',
      callerSessionKey: 'main',
      targetSessionPrefix: 'hook:kyoshin',
      agentId: 'main',
      runTimeoutSeconds: 10,
      timeoutMs: 1000,
    });

    const task = createTask({ objective: 'ship it' });
    const receipt = await client.dispatch(task);

    expect(receipt.accepted).toBe(true);
    expect(receipt.statusCode).toBe(200);
    expect(receipt.sessionKey).toBe(`agent:main:hook:kyoshin:x:${TASK_ID}`);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('http://127.0.0.1:18789/tools/invoke');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');

    const parsedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(parsedBody.tool).toBe('sessions_send');
    expect(parsedBody.sessionKey).toBe('main');
    expect(parsedBody.args).toEqual({
      sessionKey: `agent:main:hook:kyoshin:x:${TASK_ID}`,
      message: 'ship it',
      timeoutSeconds: 10,
    });
  });

  it('throws when sessions_send returns a non-ok status with wait enabled', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: { details: { runId: 'r1', status: 'timeout', error: 'wait timed out' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const client = new OpenClawToolsInvokeClient({
      baseUrl: 'http://127.0.0.1:18789',
      gatewayToken: 'token',
      callerSessionKey: 'main',
      targetSessionPrefix: 'hook:kyoshin',
      agentId: 'main',
      runTimeoutSeconds: 10,
      timeoutMs: 1000,
    });

    await expect(client.dispatch(createTask())).rejects.toThrow(/openclaw_sessions_send_timeout/);
  });
});

