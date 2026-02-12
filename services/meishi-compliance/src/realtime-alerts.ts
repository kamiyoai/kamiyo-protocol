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

export interface AlertAdapter {
  publish(event: ComplianceRealtimeAlert): Promise<void>;
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

export class WebhookAlertAdapter implements AlertAdapter {
  constructor(
    private readonly url: string,
    private readonly bearerToken?: string
  ) {}

  async publish(event: ComplianceRealtimeAlert): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Webhook adapter error ${response.status}: ${body.slice(0, 200)}`);
    }
  }
}

export class GcpPubSubAlertAdapter implements AlertAdapter {
  constructor(
    private readonly topicPublishUrl: string,
    private readonly bearerToken: string
  ) {}

  async publish(event: ComplianceRealtimeAlert): Promise<void> {
    const payload = {
      messages: [
        {
          data: Buffer.from(JSON.stringify(event), 'utf8').toString('base64'),
          attributes: {
            severity: event.severity,
            source: event.source,
            agentId: event.agentId,
          },
        },
      ],
    };

    const response = await fetch(this.topicPublishUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.bearerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GCP PubSub adapter error ${response.status}: ${body.slice(0, 200)}`);
    }
  }
}

export function createAdaptersFromEnv(env: NodeJS.ProcessEnv): AlertAdapter[] {
  const adapters: AlertAdapter[] = [];

  const webhookUrl = env.COMPLIANCE_ALERT_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    adapters.push(
      new WebhookAlertAdapter(webhookUrl, env.COMPLIANCE_ALERT_WEBHOOK_BEARER?.trim())
    );
  }

  const topicUrl = env.COMPLIANCE_GCP_PUBSUB_TOPIC_URL?.trim();
  const gcpToken = env.COMPLIANCE_GCP_PUBSUB_BEARER?.trim();
  if (topicUrl && gcpToken) {
    adapters.push(new GcpPubSubAlertAdapter(topicUrl, gcpToken));
  }

  return adapters;
}
