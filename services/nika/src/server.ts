/**
 * HTTP server - health, readiness, metrics endpoints.
 */

import express, { Request, Response, NextFunction } from 'express';
import type { Server as HttpServer } from 'http';
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { createLogger } from './lib';

const log = createLogger('nika:server');

export interface ServerConfig {
  port: number;
  getHealth: () => HealthStatus;
  getReadiness: () => Promise<ReadinessStatus>;
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
  };
}

export interface ReadinessStatus {
  ready: boolean;
  checks: {
    twitter: { ok: boolean; error?: string };
    anthropic: { ok: boolean; error?: string };
    dkg: { ok: boolean; error?: string };
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

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Request logging and metrics
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const path = req.path;

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
      this.server.close(() => {
        log.info('HTTP server stopped');
        resolve();
      });

      // Force close after 5 seconds
      setTimeout(() => {
        log.warn('HTTP server force closed');
        resolve();
      }, 5000);
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
