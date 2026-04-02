import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { sign } from 'jsonwebtoken';

const {
  anthropicCreateMock,
  initializeMock,
  publishKirokuDropMock,
  emitFairscaleFusionEventMock,
} = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  initializeMock: vi.fn(async () => {}),
  publishKirokuDropMock: vi.fn(async () => ({ ok: false, skipped: true })),
  emitFairscaleFusionEventMock: vi.fn(async () => {}),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = {
      create: anthropicCreateMock,
    };
  },
}));

vi.mock('../kiroku', () => ({
  publishKirokuDrop: publishKirokuDropMock,
}));

vi.mock('../fairscale-fusion-emitter', () => ({
  emitFairscaleFusionEvent: emitFairscaleFusionEventMock,
}));

function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('failed to bind test server');
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('control-room routes', () => {
  let tempDataDir = '';
  let observatoryServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let appServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let closeDatabase: (() => void) | undefined;

  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamiyo-control-room-routes-'));
    process.env.DATA_DIR = tempDataDir;
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    anthropicCreateMock.mockReset();
    initializeMock.mockClear();
    publishKirokuDropMock.mockClear();
    emitFairscaleFusionEventMock.mockClear();
    vi.resetModules();

    anthropicCreateMock.mockImplementation(async () => ({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: 'branch completed',
        },
      ],
      usage: {
        input_tokens: 12,
        output_tokens: 6,
      },
    }));
  });

  afterEach(async () => {
    if (appServer) await appServer.close();
    if (observatoryServer) await observatoryServer.close();
    try {
      const taskExecutor = await import('../task-executor');
      taskExecutor.__setCreateKamiyoExtensionForTests(null);
    } catch {
      // Ignore when module was not loaded.
    }
    closeDatabase?.();
    appServer = undefined;
    observatoryServer = undefined;
    closeDatabase = undefined;
    fs.rmSync(tempDataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.JWT_SECRET;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OBSERVATORY_BASE_URL;
  });

  it('creates, runs, streams, and promotes a control-room case', async () => {
    const observatoryApp = express();
    observatoryApp.get('/escrows/by-session/:sessionId', (req, res) => {
      res.json({
        escrows: [
          {
            escrowPda: 'escrow-1',
            sessionId: req.params.sessionId,
            lastSignature: 'sig-1',
          },
        ],
      });
    });
    observatoryApp.get('/events', (_req, res) => {
      res.json({
        events: [
          {
            id: 'evt-1',
            signature: 'sig-1',
            session_id: 'session-1',
            escrow_pda: 'escrow-1',
          },
        ],
      });
    });
    observatoryServer = await startServer(observatoryApp);
    process.env.OBSERVATORY_BASE_URL = observatoryServer.baseUrl;

    const { default: db, closeDatabase: closeDb } = await import('../db');
    const { __setCreateKamiyoExtensionForTests } = await import('../task-executor');
    closeDatabase = closeDb;
    __setCreateKamiyoExtensionForTests(() => ({
      initialize: initializeMock,
      getActions: () => [
        {
          name: 'kamiyo.checkBalance',
          description: 'check balance',
          schema: { type: 'object', properties: {} },
          handler: vi.fn(async () => ({ balance: 1 })),
        },
        {
          name: 'kamiyo.createEscrow',
          description: 'create escrow',
          schema: { type: 'object', properties: {} },
          handler: vi.fn(async () => ({ ok: true })),
        },
      ],
    }));
    const { default: hiveTeamsRoutes } = await import('../api/routes/hive-teams');

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO swarm_teams (id, name, currency, daily_limit, pool_balance, owner_wallet, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('team-1', 'Test Team', 'USD', 1000, 1000, 'wallet-1', now, now);

    db.prepare(`
      INSERT INTO swarm_team_members (id, team_id, agent_id, role, draw_limit, added_at)
      VALUES
      ('mem-a', 'team-1', 'agent-a', 'research', 10, ?),
      ('mem-b', 'team-1', 'agent-b', 'ops', 10, ?)
    `).run(now, now);

    const app = express();
    app.use(express.json());
    app.use('/api/hive-teams', hiveTeamsRoutes);
    appServer = await startServer(app);

    const token = sign(
      { wallet: 'wallet-1', tier: 'pro', balance: 1_000_000 },
      'test-jwt-secret',
      { expiresIn: '1h' }
    );
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };

    const createRes = await fetch(`${appServer.baseUrl}/api/hive-teams/team-1/control-room/cases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mission: 'Investigate the session.',
        snapshotSource: {
          type: 'observatory_session',
          ref: 'session-1',
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const caseId = created.caseId as string;

    const baselinePlan = {
      mode: 'dag',
      nodes: [
        {
          id: 'research',
          memberId: 'mem-a',
          description: 'Research the current snapshot.',
          budget: 2,
          dependsOn: [],
        },
        {
          id: 'final',
          memberId: 'mem-b',
          description: 'Produce the final recommendation.',
          budget: 2,
          dependsOn: ['research'],
        },
      ],
    };

    const streamPromise = fetch(
      `${appServer.baseUrl}/api/hive-teams/team-1/control-room/cases/${caseId}/stream`,
      { headers: { authorization: `Bearer ${token}` } }
    );

    const runRes = await fetch(`${appServer.baseUrl}/api/hive-teams/team-1/control-room/cases/${caseId}/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        baselinePlan,
        maxParallel: 3,
      }),
    });
    expect(runRes.status).toBe(200);
    const completed = await runRes.json();

    expect(completed.status).toBe('ready');
    expect(completed.winnerBranchId).toBeTruthy();
    expect(completed.branches).toHaveLength(4);

    const streamRes = await streamPromise;
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream');
    await streamRes.body?.cancel();

    const promoteRes = await fetch(`${appServer.baseUrl}/api/hive-teams/team-1/control-room/cases/${caseId}/promote`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        branchId: completed.winnerBranchId,
        mode: 'execute',
      }),
    });
    expect(promoteRes.status).toBe(200);
    const promoted = await promoteRes.json();

    expect(promoted.status).toBe('promoted');
    expect(promoted.promotedRunId).toBeTruthy();
    expect(initializeMock).toHaveBeenCalled();
  });
});
