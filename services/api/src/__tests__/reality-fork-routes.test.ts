import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('reality-fork routes', () => {
  let tempDataDir = '';
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let closeDatabase: (() => void) | undefined;

  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamiyo-reality-fork-'));
    process.env.DATA_DIR = tempDataDir;
  });

  afterEach(async () => {
    if (server) await server.close();
    closeDatabase?.();
    server = undefined;
    closeDatabase = undefined;
    fs.rmSync(tempDataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('runs the project pipeline end-to-end and publishes the result', async () => {
    const { closeDatabase: closeDb } = await import('../db');
    const { __resetRealityForkForTests, createProject } = await import('../reality-fork/service');
    const { default: realityForkRoutes } = await import('../api/routes/reality-fork');
    closeDatabase = closeDb;
    __resetRealityForkForTests();

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/reality-fork', realityForkRoutes);
    server = await startServer(app);

    const draftProject = createProject({
      title: 'Draft bridge review',
      prompt: 'Hold the bridge launch until the incident is clearer.',
      description: 'SSE smoke test draft project.',
      evidence: [
        {
          title: 'Draft note',
          text: 'Bridge instability is still under review.',
          sourceLabel: 'ops',
        },
      ],
      clientIp: null,
    });
    const draftStream = await fetch(
      `${server.baseUrl}/api/reality-fork/projects/${draftProject.id}/stream`
    );
    expect(draftStream.status).toBe(200);
    expect(draftStream.headers.get('content-type')).toContain('text/event-stream');
    await draftStream.body?.cancel();

    const createResponse = await fetch(`${server.baseUrl}/api/reality-fork/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Bridge rollback decision',
        claim: 'The team should pause rollout until degraded bridge errors are isolated.',
        description: 'Assemble the evidence, compare scenarios, and ship a recommendation.',
        tags: ['incident', 'ops'],
        evidence: [
          {
            title: 'Ops log',
            text: [
              'Bridge errors increased 42 percent after the last rollout.',
              'Two partners reported settlement delays within thirty minutes.',
              'The temporary mitigation reduced failure rates but did not remove the root cause.',
            ].join(' '),
            sourceLabel: 'ops',
          },
          {
            title: 'Partner update',
            text: [
              'A partner noted that user retries are climbing and support volume is up.',
              'They can tolerate a short pause if the restart window is clearly communicated.',
            ].join(' '),
            sourceLabel: 'partner',
          },
        ],
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as Record<string, any>;
    expect(created.status).toBe('draft');
    expect(created.evidence).toHaveLength(2);
    expect(created.initialJob?.kind).toBe('full');

    const projectId = created.id as string;
    const initialJobId = created.initialJob?.id as string;

    const completedJob = await waitForJob(server.baseUrl, projectId, initialJobId);
    expect(completedJob.status).toBe('completed');
    expect(completedJob.result.reportId).toBeTruthy();

    const projectResponse = await fetch(`${server.baseUrl}/api/reality-fork/projects/${projectId}`);
    expect(projectResponse.status).toBe(200);
    const project = (await projectResponse.json()) as Record<string, any>;
    expect(project.status).toBe('ready');
    expect(project.extractions).toHaveLength(2);
    expect(project.simulations).toHaveLength(4);
    expect(project.decision.winnerHypothesisId).toBeTruthy();
    expect(project.report.markdown).toContain('# Bridge rollback decision');
    expect(project.report.markdown).toContain('## Executive summary');
    expect(project.report.markdown).toContain('## Recommended action');

    const publishResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/projects/${projectId}/publish`,
      {
        method: 'POST',
      }
    );
    expect(publishResponse.status).toBe(202);
    const publishJob = (await publishResponse.json()) as Record<string, any>;
    const completedPublishJob = await waitForJob(server.baseUrl, projectId, publishJob.id);
    expect(completedPublishJob.status).toBe('completed');
    expect(completedPublishJob.result.slug).toBeTruthy();

    const publishedProjectResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/projects/${projectId}`
    );
    expect(publishedProjectResponse.status).toBe(200);
    const publishedProject = (await publishedProjectResponse.json()) as Record<string, any>;
    expect(publishedProject.status).toBe('published');
    expect(publishedProject.publication.slug).toBeTruthy();

    const publicationResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/publications/${publishedProject.publication.slug}`
    );
    expect(publicationResponse.status).toBe(200);
    const publication = (await publicationResponse.json()) as Record<string, any>;
    expect(publication.bundle.project.title).toBe('Bridge rollback decision');
    expect(publication.bundle.report.markdown).toContain('## Recommended action');
    expect(publication.bundle.report.decision.winnerHypothesisId).toBeTruthy();

    const publicationAliasResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/p/${publishedProject.publication.slug}`
    );
    expect(publicationAliasResponse.status).toBe(200);

    const listResponse = await fetch(`${server.baseUrl}/api/reality-fork`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as Record<string, any>;
    expect(listed.projects).toHaveLength(2);
    expect(
      listed.projects.some(
        (entry: Record<string, any>) => entry.id === projectId && entry.status === 'published'
      )
    ).toBe(true);

    const uploadBody = new FormData();
    uploadBody.append(
      'files',
      new Blob(
        [
          'Partner update: retries are climbing, settlement confidence is eroding, and market makers want a clear incident window.',
        ],
        { type: 'text/plain' }
      ),
      'partner-brief.txt'
    );

    const uploadResponse = await fetch(`${server.baseUrl}/api/reality-fork/uploads`, {
      method: 'POST',
      body: uploadBody,
    });
    expect(uploadResponse.status).toBe(201);
    const uploaded = (await uploadResponse.json()) as Record<string, any>;
    expect(uploaded.uploads).toHaveLength(1);
    expect(uploaded.uploads[0].sourceType).toBe('text');

    const uploadedCreateResponse = await fetch(`${server.baseUrl}/api/reality-fork/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Should the bridge launch wait for a calmer market window?',
        uploadIds: [uploaded.uploads[0].id],
        urls: ['https://polymarket.com/event/bridge-launch-delay'],
        simulationConfig: {
          representedPopulation: 180,
          activeAgents: 24,
          rounds: 12,
          lanes: ['x_lane', 'market_lane'],
        },
      }),
    });
    expect(uploadedCreateResponse.status).toBe(201);
    const uploadedProjectCreated = (await uploadedCreateResponse.json()) as Record<string, any>;
    expect(uploadedProjectCreated.initialJob?.id).toBeTruthy();

    const uploadedCompletedJob = await waitForJob(
      server.baseUrl,
      uploadedProjectCreated.id as string,
      uploadedProjectCreated.initialJob.id as string
    );
    expect(uploadedCompletedJob.status).toBe('completed');

    const uploadedProjectResponse = await fetch(
      `${server.baseUrl}/api/reality-fork/projects/${uploadedProjectCreated.id}`
    );
    expect(uploadedProjectResponse.status).toBe(200);
    const uploadedProject = (await uploadedProjectResponse.json()) as Record<string, any>;
    expect(uploadedProject.uploads).toHaveLength(1);
    expect(uploadedProject.evidence.length).toBeGreaterThanOrEqual(2);
    expect(uploadedProject.entities.length).toBeGreaterThan(0);
    expect(uploadedProject.laneRounds.length).toBe(24);
    expect(uploadedProject.report.markdown).toContain('## Platform lane narrative');

    const listedAgainResponse = await fetch(`${server.baseUrl}/api/reality-fork`);
    expect(listedAgainResponse.status).toBe(200);
    const listedAgain = (await listedAgainResponse.json()) as Record<string, any>;
    expect(listedAgain.projects).toHaveLength(3);
  });
});
