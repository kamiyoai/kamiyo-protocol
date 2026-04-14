import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import express from 'express';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'kamiyo-variants-routes-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test';
process.env.AGENT_PERF_INTERNAL_TOKEN = 'test-token';

const { default: router } = await import('../api/routes/variants');

const app = express();
app.use(express.json());
app.use('/api', router);

function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('bind failed');
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise(r => server.close(() => r(undefined))),
      });
    });
  });
}

const baseGenome = {
  promptTemplate: 'base',
  modelId: 'claude-sonnet-4-6',
  toolAllowlist: ['a'],
  temperature: 0.7,
  maxTokens: 1024,
  systemGuardrails: '',
};

describe('variants routes', () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('rejects write without bearer token', async () => {
    const { baseUrl, close } = await startServer();
    const res = await fetch(`${baseUrl}/api/variants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'a', taskType: 't', genome: baseGenome }),
    });
    expect(res.status).toBe(401);
    await close();
  });

  it('creates variant with valid token and is idempotent', async () => {
    const { baseUrl, close } = await startServer();
    const headers = { 'content-type': 'application/json', authorization: 'Bearer test-token' };
    const body = JSON.stringify({ agentId: 'a1', taskType: 't1', genome: baseGenome });
    const r1 = await fetch(`${baseUrl}/api/variants`, { method: 'POST', headers, body });
    expect(r1.status).toBe(201);
    const v1 = (await r1.json()) as { id: string };
    const r2 = await fetch(`${baseUrl}/api/variants`, { method: 'POST', headers, body });
    const v2 = (await r2.json()) as { id: string };
    expect(v2.id).toBe(v1.id);
    await close();
  });

  it('returns 409 on invalid tournament status transition', async () => {
    const { baseUrl, close } = await startServer();
    const headers = { 'content-type': 'application/json', authorization: 'Bearer test-token' };
    const tRes = await fetch(`${baseUrl}/api/variants/tournaments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ taskType: 't1', maxParticipants: 2, budgetCap: 1 }),
    });
    const tour = (await tRes.json()) as { id: string };
    const bad = await fetch(`${baseUrl}/api/variants/tournaments/${tour.id}/status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status: 'completed' }),
    });
    expect(bad.status).toBe(409);
    await close();
  });

  it('returns 404 on entry for unknown tournament', async () => {
    const { baseUrl, close } = await startServer();
    const headers = { 'content-type': 'application/json', authorization: 'Bearer test-token' };
    const res = await fetch(`${baseUrl}/api/variants/tournaments/nope/entries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ variantId: 'also-nope', qualityScore: 0.5 }),
    });
    expect(res.status).toBe(404);
    await close();
  });

  it('returns 409 on out-of-range qualityScore', async () => {
    const { baseUrl, close } = await startServer();
    const headers = { 'content-type': 'application/json', authorization: 'Bearer test-token' };
    const tRes = await fetch(`${baseUrl}/api/variants/tournaments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ taskType: 't1', maxParticipants: 2, budgetCap: 1 }),
    });
    const tour = (await tRes.json()) as { id: string };
    const vRes = await fetch(`${baseUrl}/api/variants`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'x', taskType: 't1', genome: baseGenome }),
    });
    const v = (await vRes.json()) as { id: string };
    const bad = await fetch(`${baseUrl}/api/variants/tournaments/${tour.id}/entries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ variantId: v.id, qualityScore: 1.5 }),
    });
    expect(bad.status).toBe(409);
    await close();
  });
});
