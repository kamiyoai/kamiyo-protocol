import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

function startServer(
  app: express.Express
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('failed to bind test server');
      }

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(done => server.close(() => done())),
      });
    });
  });
}

async function waitForJob(
  baseUrl: string,
  projectId: string,
  jobId: string,
  timeoutMs = 10_000
): Promise<Record<string, any>> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/api/reality-fork/projects/${projectId}/jobs/${jobId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    if (body.status === 'completed' || body.status === 'failed') {
      return body;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for job ${jobId}`);
}

describe('reality-fork ops and quotas', () => {
  let tempDataDir = '';
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let closeDatabase: (() => void) | undefined;

  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamiyo-reality-fork-ops-'));
    process.env.DATA_DIR = tempDataDir;
    process.env.REALITY_FORK_UPLOADS_PER_DAY_PER_IP = '1';
    process.env.REALITY_FORK_UPLOAD_BYTES_PER_DAY_PER_IP = String(1024 * 1024);
    process.env.REALITY_FORK_FULL_JOBS_PER_PROJECT_PER_DAY = '1';
    process.env.REALITY_FORK_PUBLISH_JOBS_PER_PROJECT_PER_DAY = '2';
    process.env.REALITY_FORK_EVIDENCE_PER_PROJECT = '2';
    vi.resetModules();
  });

  afterEach(async () => {
    if (server) await server.close();
    closeDatabase?.();
    server = undefined;
    closeDatabase = undefined;
    fs.rmSync(tempDataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.REALITY_FORK_UPLOADS_PER_DAY_PER_IP;
    delete process.env.REALITY_FORK_UPLOAD_BYTES_PER_DAY_PER_IP;
    delete process.env.REALITY_FORK_FULL_JOBS_PER_PROJECT_PER_DAY;
    delete process.env.REALITY_FORK_PUBLISH_JOBS_PER_PROJECT_PER_DAY;
    delete process.env.REALITY_FORK_EVIDENCE_PER_PROJECT;
  });

  it('exposes ops summaries and enforces upload and full-run quotas', async () => {
    const { closeDatabase: closeDb } = await import('../db');
    const { __resetRealityForkForTests } = await import('../reality-fork/service');
    const { default: realityForkRoutes } = await import('../api/routes/reality-fork');
    closeDatabase = closeDb;
    __resetRealityForkForTests();

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/reality-fork', realityForkRoutes);
    server = await startServer(app);

    const uploadBody = new FormData();
    uploadBody.append(
      'files',
      new Blob(['Partner demand is weakening while bridge retries are climbing.'], {
        type: 'text/plain',
      }),
      'partner-note.txt'
    );

    const uploadResponse = await fetch(`${server.baseUrl}/api/reality-fork/uploads`, {
      method: 'POST',
      body: uploadBody,
    });
    expect(uploadResponse.status).toBe(201);
    const uploaded = (await uploadResponse.json()) as Record<string, any>;

    const createResponse = await fetch(`${server.baseUrl}/api/reality-fork/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Should the rollout pause while the bridge stabilizes?',
        uploadIds: [uploaded.uploads[0].id],
        pastedText: 'Incident response is absorbing more operator time than expected.',
        simulationConfig: {
          representedPopulation: 96,
          activeAgents: 12,
          rounds: 8,
          lanes: ['x_lane', 'market_lane'],
        },
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as Record<string, any>;
    const projectId = created.id as string;
    const initialJobId = created.initialJob.id as string;

    const completedJob = await waitForJob(server.baseUrl, projectId, initialJobId);
    expect(completedJob.status).toBe('completed');

    const usageResponse = await fetch(`${server.baseUrl}/api/reality-fork/ops/usage`);
    expect(usageResponse.status).toBe(200);
    const usage = (await usageResponse.json()) as Record<string, any>;
    expect(usage.telemetry.projects.total).toBe(1);
    expect(usage.telemetry.storage.uploadCount).toBe(1);
    expect(usage.telemetry.actualSimulatedSpend).toBeGreaterThan(0);
    expect(usage.quotas.client.usage.projectsToday).toBe(1);
    expect(usage.quotas.client.usage.uploadsToday).toBe(1);
    expect(usage.retention.orphanUploads.count).toBe(0);

    const projectOpsResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/projects/${projectId}/ops`
    );
    expect(projectOpsResponse.status).toBe(200);
    const projectOps = (await projectOpsResponse.json()) as Record<string, any>;
    expect(projectOps.storage.totalBlobBytes).toBeGreaterThan(0);
    expect(projectOps.storage.generatedArtifactBytes).toBeGreaterThan(0);
    expect(projectOps.cost.estimated.modelUsd).toBeGreaterThan(0);
    expect(projectOps.cost.actual.simulatedSpend).toBeGreaterThan(0);
    expect(projectOps.telemetry.eventsByType.job_completed).toBe(1);
    expect(projectOps.telemetry.jobs.completed).toBe(1);
    expect(projectOps.quotas.usage.evidenceCount).toBe(2);

    const secondUploadBody = new FormData();
    secondUploadBody.append(
      'files',
      new Blob(['Another file that should exceed the daily upload cap.'], {
        type: 'text/plain',
      }),
      'blocked.txt'
    );
    const secondUploadResponse = await fetch(`${server.baseUrl}/api/reality-fork/uploads`, {
      method: 'POST',
      body: secondUploadBody,
    });
    expect(secondUploadResponse.status).toBe(429);
    const secondUploadError = (await secondUploadResponse.json()) as Record<string, any>;
    expect(secondUploadError.code).toBe('REALITY_FORK_QUOTA_EXCEEDED');
    expect(secondUploadError.details.limit).toBe('uploads_per_day');

    const retryResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/projects/${projectId}/retry`,
      { method: 'POST' }
    );
    expect(retryResponse.status).toBe(429);
    const retryError = (await retryResponse.json()) as Record<string, any>;
    expect(retryError.code).toBe('REALITY_FORK_QUOTA_EXCEEDED');
    expect(retryError.details.limit).toBe('full_jobs_per_project_per_day');
  });

  it('enforces the project evidence cap on add-evidence', async () => {
    const { closeDatabase: closeDb } = await import('../db');
    const { __resetRealityForkForTests } = await import('../reality-fork/service');
    const { default: realityForkRoutes } = await import('../api/routes/reality-fork');
    closeDatabase = closeDb;
    __resetRealityForkForTests();

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/reality-fork', realityForkRoutes);
    server = await startServer(app);

    const createResponse = await fetch(`${server.baseUrl}/api/reality-fork/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Check whether evidence caps stop late additions.',
        evidence: [
          {
            title: 'Single seed',
            text: 'One seed document leaves one evidence slot open.',
          },
        ],
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as Record<string, any>;
    const projectId = created.id as string;
    await waitForJob(server.baseUrl, projectId, created.initialJob.id as string);

    const addOneResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/projects/${projectId}/evidence`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Second slot',
          text: 'The second evidence item fits inside the cap.',
        }),
      }
    );
    expect(addOneResponse.status).toBe(201);

    const addTwoResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/projects/${projectId}/evidence`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Blocked third slot',
          text: 'This evidence item should exceed the per-project cap.',
        }),
      }
    );
    expect(addTwoResponse.status).toBe(429);
    const error = (await addTwoResponse.json()) as Record<string, any>;
    expect(error.code).toBe('REALITY_FORK_QUOTA_EXCEEDED');
    expect(error.details.limit).toBe('evidence_per_project');
  });
});
