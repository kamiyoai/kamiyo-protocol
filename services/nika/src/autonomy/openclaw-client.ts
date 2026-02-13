import { createLogger, withRetry } from '../lib';
import type { AutonomyTask, OpenClawDispatchReceipt } from './types';

const log = createLogger('nika:autonomy:openclaw');

export interface OpenClawHooksClientConfig {
  baseUrl: string;
  hookPath: string;
  hookToken: string;
  agentId: string;
  timeoutMs: number;
}

interface OpenClawAgentPayload {
  message: string;
  name: string;
  agentId: string;
  sessionKey: string;
  wakeMode: 'now';
  deliver: boolean;
}

export class OpenClawHooksClient {
  private config: OpenClawHooksClientConfig;

  constructor(config: OpenClawHooksClientConfig) {
    this.config = config;
  }

  async dispatch(task: AutonomyTask): Promise<OpenClawDispatchReceipt> {
    const sessionKey = `nika:${task.source}:${task.id}`;
    const payload: OpenClawAgentPayload = {
      message: task.objective,
      name: `nika-${task.source}`,
      agentId: this.config.agentId,
      sessionKey,
      wakeMode: 'now',
      deliver: false,
    };

    const endpoint = this.getEndpoint();
    const response = await withRetry(
      async () => this.postAgentHook(endpoint, payload),
      { maxAttempts: 2, initialDelayMs: 700, maxDelayMs: 4000 }
    );

    if (!response.ok) {
      const errorBody = await this.readResponseBody(response);
      throw new Error(`openclaw_dispatch_failed:${response.status}:${errorBody}`);
    }

    const body = await this.parseBody(response);
    log.info('OpenClaw dispatch accepted', { taskId: task.id, statusCode: response.status, sessionKey });

    return {
      accepted: true,
      statusCode: response.status,
      sessionKey,
      dispatchedAt: Date.now(),
      response: body,
    };
  }

  private getEndpoint(): string {
    const base = this.config.baseUrl.replace(/\/+$/, '');
    const path = this.config.hookPath.startsWith('/') ? this.config.hookPath : `/${this.config.hookPath}`;
    return `${base}${path}/agent`;
  }

  private async postAgentHook(endpoint: string, payload: OpenClawAgentPayload): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (this.config.hookToken) {
        headers.Authorization = `Bearer ${this.config.hookToken}`;
      }

      return await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return undefined;
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private async readResponseBody(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.slice(0, 1000);
    } catch {
      return 'unavailable';
    }
  }
}

