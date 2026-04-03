import { describe, expect, it } from 'vitest';
import { createRealityForkStudioClient } from './studio';

describe('reality fork studio client', () => {
  it('targets the public api routes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const client = createRealityForkStudioClient({
      baseUrl: 'https://api.kamiyo.ai/',
      fetchImpl: (async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    });

    const formData = new FormData();
    formData.append('files', new Blob(['hello'], { type: 'text/plain' }), 'brief.txt');

    await client.listProjects();
    await client.getProject('project-1');
    await client.createUploads(formData);
    await client.createProject({ prompt: 'Assess the launch risk.' });
    await client.publish('project-1');
    await client.retry('project-1');
    await client.getPublication('bridge-rollback');

    expect(calls).toEqual([
      { url: 'https://api.kamiyo.ai/api/reality-fork', method: 'GET' },
      { url: 'https://api.kamiyo.ai/api/reality-fork/projects/project-1', method: 'GET' },
      { url: 'https://api.kamiyo.ai/api/reality-fork/uploads', method: 'POST' },
      { url: 'https://api.kamiyo.ai/api/reality-fork/projects', method: 'POST' },
      { url: 'https://api.kamiyo.ai/api/reality-fork/projects/project-1/publish', method: 'POST' },
      { url: 'https://api.kamiyo.ai/api/reality-fork/projects/project-1/retry', method: 'POST' },
      { url: 'https://api.kamiyo.ai/api/reality-fork/publications/bridge-rollback', method: 'GET' },
    ]);
  });
});
