/**
 * HTTP server - health, readiness, metrics endpoints.
 */

import express, { Request, Response, NextFunction } from 'express';
import type { Server as HttpServer } from 'http';
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { createLogger } from './lib';
import type { AutonomyTask, AutonomyTaskInput, AutonomyStatus } from './autonomy/types';

const log = createLogger('nika:server');

export function getRouteLabel(req: Pick<Request, 'baseUrl' | 'path' | 'route'>): string {
  const baseUrl = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  const routePath =
    req.route && typeof (req.route as { path?: unknown }).path === 'string'
      ? (req.route as { path: string }).path
      : req.path;

  return `${baseUrl}${routePath}`;
}

export interface ServerConfig {
  port: number;
  getHealth: () => HealthStatus;
  getReadiness: () => Promise<ReadinessStatus>;
  autonomy?: AutonomyApi;
}

export interface AutonomyApi {
  enabled: boolean;
  token?: string;
  enqueueTask: (task: AutonomyTaskInput) => Promise<AutonomyTask>;
  getTask: (taskId: string) => AutonomyTask | null;
  listTasks: (limit: number) => AutonomyTask[];
  getStatus: () => AutonomyStatus;
}

export interface HealthStatus {
  healthy: boolean;
  uptime: number;
  version: string;
  components: {
    scheduler: { running: boolean; consecutiveFailures: number };
    mentionMonitor: { running: boolean; lastCheckAt: number | null };
    circuitBreaker: { posting: string; replies: string; dkg: string };
    dkg: { enabled: boolean; circuitStatus: string; activePort?: number | null };
    engagementTracker: { running: boolean };
    taskPublisher?: { running: boolean; published: number };
    repoKnowledge?: { running: boolean; lastUpdateAt: string | null; commit: string | null };
    autonomy?: AutonomyStatus;
  };
}

export interface ReadinessStatus {
  ready: boolean;
  checks: {
    twitter: { ok: boolean; error?: string };
    anthropic: { ok: boolean; error?: string };
    dkg: { ok: boolean; error?: string };
    autonomy?: { ok: boolean; error?: string };
  };
}

// Prometheus registry
const register = new Registry();
collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: 'nika_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'nika_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const tweetsPosted = new Counter({
  name: 'nika_tweets_posted_total',
  help: 'Total tweets posted',
  labelNames: ['type'],
  registers: [register],
});

export const mentionsProcessed = new Counter({
  name: 'nika_mentions_processed_total',
  help: 'Total mentions processed',
  labelNames: ['status'],
  registers: [register],
});

export const agentDuration = new Histogram({
  name: 'nika_agent_duration_seconds',
  help: 'Agent execution duration in seconds',
  labelNames: ['operation'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

export const healthStatus = new Gauge({
  name: 'nika_health_status',
  help: 'Health status (1=healthy, 0=unhealthy)',
  registers: [register],
});

export const schedulerFailures = new Gauge({
  name: 'nika_scheduler_consecutive_failures',
  help: 'Number of consecutive scheduler failures',
  registers: [register],
});

export class Server {
  private app: express.Application;
  private server: HttpServer | null = null;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.app.set('trust proxy', 1);
    this.app.disable('x-powered-by');

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '256kb' }));

    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
      next();
    });

    // Request logging and metrics
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const path = getRouteLabel(req);

        httpRequestsTotal.inc({
          method: req.method,
          path,
          status: res.statusCode.toString(),
        });

        httpRequestDuration.observe({ method: req.method, path }, duration);
      });

      next();
    });
  }

  private setupRoutes(): void {
    // Liveness probe - is the process running?
    this.app.get('/health', (_req: Request, res: Response) => {
      const status = this.config.getHealth();
      healthStatus.set(status.healthy ? 1 : 0);
      schedulerFailures.set(status.components.scheduler.consecutiveFailures);

      res.status(status.healthy ? 200 : 503).json(status);
    });

    // Readiness probe - can the service handle requests?
    this.app.get('/ready', async (_req: Request, res: Response) => {
      try {
        const status = await this.config.getReadiness();
        res.status(status.ready ? 200 : 503).json(status);
      } catch (error) {
        res.status(503).json({
          ready: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Prometheus metrics
    this.app.get('/metrics', async (_req: Request, res: Response) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        res.status(500).end(error instanceof Error ? error.message : 'Error');
      }
    });

    this.app.get('/autonomy/status', (req: Request, res: Response) => {
      if (!this.ensureAutonomyAccess(req, res)) return;
      res.json(this.config.autonomy!.getStatus());
    });

    this.app.post('/autonomy/tasks', async (req: Request, res: Response) => {
      if (!this.ensureAutonomyAccess(req, res)) return;

      const objective = typeof req.body?.objective === 'string' ? req.body.objective.trim() : '';
      if (!objective) {
        res.status(400).json({ error: 'objective_required' });
        return;
      }

      const source = typeof req.body?.source === 'string' ? req.body.source : 'api';
      if (!['x', 'api', 'manual', 'system'].includes(source)) {
        res.status(400).json({ error: 'invalid_source' });
        return;
      }

      const payload: AutonomyTaskInput = {
        source,
        objective,
        requestor: typeof req.body?.requestor === 'string' ? req.body.requestor : undefined,
        priority: typeof req.body?.priority === 'number' ? req.body.priority : undefined,
        context: req.body?.context && typeof req.body.context === 'object' ? req.body.context : undefined,
        idempotencyKey: typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined,
      };

      try {
        const task = await this.config.autonomy!.enqueueTask(payload);
        res.status(202).json({ task });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'enqueue_failed';
        res.status(400).json({ error: message });
      }
    });

    this.app.get('/autonomy/tasks', (req: Request, res: Response) => {
      if (!this.ensureAutonomyAccess(req, res)) return;
      const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;
      const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
      res.json({ tasks: this.config.autonomy!.listTasks(limit) });
    });

    this.app.get('/autonomy/tasks/:taskId', (req: Request, res: Response) => {
      if (!this.ensureAutonomyAccess(req, res)) return;
      const task = this.config.autonomy!.getTask(req.params.taskId);
      if (!task) {
        res.status(404).json({ error: 'task_not_found' });
        return;
      }
      res.json({ task });
    });

    // Simple status page
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        service: 'nika',
        status: 'running',
        endpoints: {
          health: '/health',
          ready: '/ready',
          metrics: '/metrics',
        },
      });
    });

    this.app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (!error || typeof error !== 'object') {
        res.status(500).json({ error: 'internal_error' });
        return;
      }

      if ((error as { type?: unknown }).type === 'entity.parse.failed') {
        res.status(400).json({ error: 'invalid_json' });
        return;
      }

      const message =
        typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'unknown error';
      log.error('Unhandled server error', { error: message });
      res.status(500).json({ error: 'internal_error' });
    });
  }

  private ensureAutonomyAccess(req: Request, res: Response): boolean {
    const autonomy = this.config.autonomy;
    if (!autonomy?.enabled) {
      res.status(404).json({ error: 'autonomy_disabled' });
      return false;
    }

    if (!autonomy.token) {
      return true;
    }

    const provided = this.readToken(req);
    if (provided !== autonomy.token) {
      res.status(401).json({ error: 'unauthorized' });
      return false;
    }

    return true;
  }

  private readToken(req: Request): string {
    const authorization = req.header('authorization');
    if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
      return authorization.slice(7).trim();
    }
    return req.header('x-autonomy-token')?.trim() ?? '';
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, () => {
          log.info('HTTP server started', { port: this.config.port });
          resolve();
        });

        this.server.on('error', (error) => {
          log.error('HTTP server error', { error: String(error) });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Stop accepting new connections
      const forceTimer = setTimeout(() => {
        log.warn('HTTP server force closed');
        resolve();
      }, 5000);

      this.server.close(() => {
        log.info('HTTP server stopped');
        clearTimeout(forceTimer);
        resolve();
      });
    });
  }

  getPort(): number {
    return this.config.port;
  }
}

export function createServer(config: ServerConfig): Server {
  return new Server(config);
}

export { register as metricsRegistry };
