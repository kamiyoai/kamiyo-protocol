import multer from 'multer';
import { Router, Request, Response } from 'express';
import {
  addEvidence,
  createUpload,
  createProject,
  enqueueProjectJob,
  getJob,
  getProjectDetail,
  getPublicationBySlug,
  listProjectEvents,
  listProjects,
} from './service';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 20 * 1024 * 1024,
  },
});

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(entry => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
}

function clientIp(req: Request): string | null {
  return req.ip || null;
}

router.get('/', (_req: Request, res: Response) => {
  res.json({ projects: listProjects() });
});

router.post('/uploads', upload.array('files', 5), (req: Request, res: Response) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      res.status(400).json({ error: 'at least one file is required' });
      return;
    }

    const uploads = files.map(file =>
      createUpload({
        fileName: file.originalname,
        mimeType: file.mimetype,
        data: file.buffer,
        clientIp: clientIp(req),
      })
    );

    res.status(201).json({ uploads });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to create uploads';
    res.status(500).json({ error: message });
  }
});

router.post('/projects', (req: Request, res: Response) => {
  try {
    const project = createProject({
      title: parseString(req.body?.title),
      prompt: parseString(req.body?.prompt) ?? parseString(req.body?.claim) ?? '',
      description: parseString(req.body?.description),
      tags: req.body?.tags,
      uploadIds: parseStringList(req.body?.uploadIds),
      pastedText: parseString(req.body?.pastedText),
      urls: parseStringList(req.body?.urls),
      simulationConfig: req.body?.simulationConfig,
      decisionMode: req.body?.decisionMode,
      evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
      clientIp: clientIp(req),
    });
    const job = enqueueProjectJob(project.id, 'full');
    res.status(201).json({
      ...getProjectDetail(project.id),
      initialJob: job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to create project';
    const status = /required|not found/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

router.get('/projects/:projectId', (req: Request, res: Response) => {
  const project = getProjectDetail(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

router.post('/projects/:projectId/evidence', (req: Request, res: Response) => {
  try {
    const evidence = addEvidence(req.params.projectId, req.body ?? {});
    res.status(201).json(evidence);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to add evidence';
    const status = /required|not found/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/projects/:projectId/jobs', (req: Request, res: Response) => {
  try {
    const kind = req.body?.kind === 'publish' ? 'publish' : 'full';
    const job = enqueueProjectJob(req.params.projectId, kind);
    res.status(202).json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to queue job';
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

router.get('/projects/:projectId/jobs/:jobId', (req: Request, res: Response) => {
  const project = getProjectDetail(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const job = getJob(req.params.jobId);
  if (!job || job.projectId !== req.params.projectId) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json(job);
});

router.post('/projects/:projectId/publish', (req: Request, res: Response) => {
  try {
    const job = enqueueProjectJob(req.params.projectId, 'publish');
    res.status(202).json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to queue publish';
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

router.post('/projects/:projectId/retry', (req: Request, res: Response) => {
  try {
    const job = enqueueProjectJob(req.params.projectId, 'full');
    res.status(202).json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to retry project';
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

router.get('/projects/:projectId/stream', (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const flushHeaders = (res as Response & { flushHeaders?: () => void }).flushHeaders;
  if (typeof flushHeaders === 'function') flushHeaders.call(res);
  res.write(': connected\n\n');

  let closed = false;
  const pollInterval = setInterval(tick, 250);
  const heartbeatInterval = setInterval(() => {
    send('ping', { ts: Date.now() });
  }, 15_000);
  const seenIds = new Set<string>();

  const send = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (pollInterval) clearInterval(pollInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    res.end();
  };

  const closeSoon = () => setTimeout(close, 25);

  const tick = () => {
    const project = getProjectDetail(projectId);
    if (!project) {
      send('error', { error: 'Project not found' });
      closeSoon();
      return;
    }

    const events = listProjectEvents(projectId);
    for (const event of events) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      send(event.eventType, event);
    }

    const hasActiveJob = project.jobs.some(
      job => job.status === 'queued' || job.status === 'running'
    );
    if (
      !hasActiveJob &&
      (project.status === 'ready' || project.status === 'published' || project.status === 'failed')
    ) {
      send('done', { projectId, status: project.status });
      closeSoon();
    }
  };
  req.on('aborted', close);
  res.on('close', close);
  setTimeout(tick, 0);
});

router.get('/publications/:slug', (req: Request, res: Response) => {
  const publication = getPublicationBySlug(req.params.slug);
  if (!publication) {
    res.status(404).json({ error: 'Publication not found' });
    return;
  }
  res.json(publication);
});

router.get('/p/:slug', (req: Request, res: Response) => {
  const publication = getPublicationBySlug(req.params.slug);
  if (!publication) {
    res.status(404).json({ error: 'Publication not found' });
    return;
  }
  res.json(publication);
});

export default router;
