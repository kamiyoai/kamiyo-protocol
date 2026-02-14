import { createLogger, withRetry } from '../lib';
import type { AutonomyTask, OpenClawDispatchReceipt } from './types';

const log = createLogger('nika:autonomy:openclaw');

export interface OpenClawToolsInvokeClientConfig {
  baseUrl: string;
  gatewayToken: string;
  callerSessionKey: string;
  targetSessionPrefix: string;
  agentId: string;
  runTimeoutSeconds: number;
  timeoutMs: number;
}

type ToolsInvokeRequestBody = {
  tool: string;
  action?: string;
  args?: Record<string, unknown>;
  sessionKey?: string;
};

type ToolsInvokeOk = { ok: true; result: unknown };
type ToolsInvokeErr = { ok: false; error?: { type?: string; message?: string } };
type ToolsInvokeResponse = ToolsInvokeOk | ToolsInvokeErr;

type SessionsSendResult = {
  runId?: string;
  status?: string;
  reply?: string;
  error?: string;
  sessionKey?: string;
};

export class OpenClawToolsInvokeClient {
  private config: OpenClawToolsInvokeClientConfig;

  constructor(config: OpenClawToolsInvokeClientConfig) {
    this.config = config;
  }

  async dispatch(task: AutonomyTask): Promise<OpenClawDispatchReceipt> {
    const sessionKey = this.buildTargetSessionKey(task);
    const payload: ToolsInvokeRequestBody = {
      tool: 'sessions_send',
      args: {
        sessionKey,
        message: task.objective,
        timeoutSeconds: this.config.runTimeoutSeconds,
      },
      sessionKey: this.config.callerSessionKey,
    };

    const endpoint = this.getEndpoint();
    const response = await withRetry(async () => this.post(endpoint, payload), {
      maxAttempts: 2,
      initialDelayMs: 700,
      maxDelayMs: 4000,
    });

    if (!response.ok) {
      const errorBody = await this.readResponseBody(response);
      throw new Error(`openclaw_tools_invoke_failed:${response.status}:${errorBody}`);
    }

    const body = (await this.parseJson(response)) as ToolsInvokeResponse | undefined;
    if (!body || body.ok !== true) {
      const errorMsg =
        body && body.ok === false ? body.error?.message || body.error?.type || 'tool_error' : 'invalid_response';
      throw new Error(`openclaw_tools_invoke_error:${errorMsg}`);
    }

    const details = this.readToolDetails(body.result);
    const result = this.coerceSessionsSendResult(details);
    if (result && !this.isAcceptedSessionsSendStatus(result.status, this.config.runTimeoutSeconds)) {
      throw new Error(`openclaw_sessions_send_${result.status || 'error'}:${result.error || 'unavailable'}`);
    }

    log.info('OpenClaw tools/invoke accepted', {
      taskId: task.id,
      statusCode: response.status,
      sessionKey,
      status: result?.status,
    });

    return {
      accepted: true,
      statusCode: response.status,
      sessionKey,
      dispatchedAt: Date.now(),
      response: { mode: 'tools_invoke', result: result ?? details ?? body.result },
    };
  }

  private getEndpoint(): string {
    const base = this.config.baseUrl.replace(/\/+$/, '');
    return `${base}/tools/invoke`;
  }

  private buildTargetSessionKey(task: AutonomyTask): string {
    const prefix = this.config.targetSessionPrefix.trim().replace(/:+$/, '');
    const suffix = `${task.source}:${task.id}`;
    const raw = prefix ? `${prefix}:${suffix}` : suffix;
    if (raw.toLowerCase().startsWith('agent:')) return raw;
    const agentId = this.config.agentId.trim() || 'main';
    return `agent:${agentId}:${raw}`;
  }

  private async post(endpoint: string, payload: ToolsInvokeRequestBody): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (this.config.gatewayToken) {
        headers.Authorization = `Bearer ${this.config.gatewayToken}`;
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

  private async parseJson(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return undefined;
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private readToolDetails(result: unknown): unknown {
    if (!result || typeof result !== 'object') return undefined;
    const details = (result as { details?: unknown }).details;
    if (details !== undefined) return details;

    const content = (result as { content?: unknown }).content;
    if (!Array.isArray(content) || content.length === 0) return undefined;
    const first = content[0] as { type?: unknown; text?: unknown } | undefined;
    if (first?.type !== 'text' || typeof first.text !== 'string') return undefined;
    try {
      return JSON.parse(first.text);
    } catch {
      return undefined;
    }
  }

  private coerceSessionsSendResult(details: unknown): SessionsSendResult | null {
    if (!details || typeof details !== 'object') return null;
    const obj = details as Record<string, unknown>;
    const status = typeof obj.status === 'string' ? obj.status : undefined;
    const reply = typeof obj.reply === 'string' ? obj.reply : undefined;
    const runId = typeof obj.runId === 'string' ? obj.runId : undefined;
    const error = typeof obj.error === 'string' ? obj.error : undefined;
    const sessionKey = typeof obj.sessionKey === 'string' ? obj.sessionKey : undefined;
    if (!status && !reply && !runId && !error && !sessionKey) return null;
    return { status, reply, runId, error, sessionKey };
  }

  private isAcceptedSessionsSendStatus(status: string | undefined, timeoutSeconds: number): boolean {
    if (timeoutSeconds <= 0) {
      return status === 'accepted' || status === 'ok';
    }
    return status === 'ok';
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

