import type { IncomingMessage, ServerResponse } from 'http';

export type AlertSeverity = 'info' | 'warn' | 'critical';
export type AlertSource = 'monitor' | 'deep-audit' | 'triggered' | 'api';

export interface ComplianceRealtimeAlert {
  id: string;
  timestamp: number;
  severity: AlertSeverity;
  source: AlertSource;
  agentId: string;
  passportAddress: string;
  overallScore: number;
  onChainScore: number;
  jurisdiction: string;
  classification: string;
  reasons: string[];
  dkgUal?: string;
  metadata?: Record<string, unknown>;
}

interface Subscriber {
  res: ServerResponse;
  minSeverity?: AlertSeverity;
}

function severityRank(severity: AlertSeverity): number {
  if (severity === 'critical') return 3;
  if (severity === 'warn') return 2;
  return 1;
}

export class RealtimeAlertHub {
  private subscribers = new Map<number, Subscriber>();
  private history: ComplianceRealtimeAlert[] = [];
  private nextId = 1;

  constructor(private readonly historyLimit = 200) {}

  subscribe(req: IncomingMessage, res: ServerResponse, minSeverity?: AlertSeverity): void {
    const id = this.nextId++;
    this.subscribers.set(id, { res, minSeverity });

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    for (const event of this.history) {
      if (minSeverity && severityRank(event.severity) < severityRank(minSeverity)) continue;
      this.writeEvent(res, event);
    }

    const keepAlive = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(keepAlive);
        this.subscribers.delete(id);
        return;
      }
      res.write(': ping\n\n');
    }, 15000);

    const cleanup = () => {
      clearInterval(keepAlive);
      this.subscribers.delete(id);
    };

    req.on('close', cleanup);
    req.on('end', cleanup);
    req.on('error', cleanup);
  }

  publish(event: ComplianceRealtimeAlert): void {
    this.history.push(event);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }

    for (const [id, sub] of this.subscribers) {
      if (sub.minSeverity && severityRank(event.severity) < severityRank(sub.minSeverity)) {
        continue;
      }

      if (sub.res.writableEnded || sub.res.destroyed) {
        this.subscribers.delete(id);
        continue;
      }

      this.writeEvent(sub.res, event);
    }
  }

  private writeEvent(res: ServerResponse, event: ComplianceRealtimeAlert): void {
    res.write(`event: compliance-alert\n`);
    res.write(`id: ${event.id}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}
