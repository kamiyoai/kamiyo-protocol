import express, { type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import type { RuntimeStatus } from './state.js';

export type KyoshinServerConfig = {
  host: string;
  port: number;
  token?: string;
  getStatus: () => RuntimeStatus;
  getMetrics: () => string;
};

function readToken(req: Request): string {
  const bearer = req.header('authorization')?.trim() ?? '';
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
  return req.header('x-kyoshin-token')?.trim() ?? '';
}

function isAuthorized(req: Request, expectedToken: string | undefined): boolean {
  if (!expectedToken) return true;
  return readToken(req) === expectedToken;
}

export class KyoshinServer {
  private readonly app = express();
  private readonly httpServer: HttpServer;

  constructor(private readonly config: KyoshinServerConfig) {
    this.httpServer = createServer(this.app);
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.disable('x-powered-by');

    this.app.get('/health', (_req: Request, res: Response) => {
      const status = this.config.getStatus();
      const healthy = status.lastTickStatus !== 'error';
      res.status(healthy ? 200 : 503).json({
        ok: healthy,
        startedAt: status.startedAt,
        lastTickId: status.lastTickId,
        lastTickStatus: status.lastTickStatus,
        lastError: status.lastError,
      });
    });

    this.app.get('/ready', (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    this.app.get('/status', (req: Request, res: Response) => {
      if (!isAuthorized(req, this.config.token)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      res.json(this.config.getStatus());
    });

    this.app.get('/metrics', (_req: Request, res: Response) => {
      res.type('text/plain').send(this.config.getMetrics());
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.httpServer.listen(this.config.port, this.config.host, () => resolve());
      this.httpServer.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.httpServer.close(error => (error ? reject(error) : resolve()));
    });
  }
}
