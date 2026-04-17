import { z } from 'zod';
import { defineTool, type Capability, type ToolDefinition } from '@kamiyo-org/agent';

export interface HttpConfig {
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  allowedHosts?: string[];
}

const headerSchema = z.record(z.string()).optional();

const httpGetSchema = z.object({
  url: z.string().url(),
  headers: headerSchema,
});

const httpPostSchema = z.object({
  url: z.string().url(),
  body: z.unknown().optional(),
  headers: headerSchema,
  contentType: z.string().optional(),
});

const httpPutSchema = z.object({
  url: z.string().url(),
  body: z.unknown().optional(),
  headers: headerSchema,
  contentType: z.string().optional(),
});

const httpDeleteSchema = z.object({
  url: z.string().url(),
  headers: headerSchema,
});

function checkHost(url: string, allowed?: string[]): void {
  if (!allowed || allowed.length === 0) return;
  const host = new URL(url).hostname;
  if (!allowed.some(h => host === h || host.endsWith(`.${h}`))) {
    throw new Error(`Host "${host}" not in allowlist`);
  }
}

async function doFetch(url: string, init: RequestInit, config: HttpConfig): Promise<string> {
  checkHost(url, config.allowedHosts);

  const headers = { ...config.defaultHeaders, ...(init.headers as Record<string, string>) };
  const controller = new AbortController();
  const timeout = config.timeout ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await res.text();
    return JSON.stringify({
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      body: tryParseJson(text),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`HTTP request timed out after ${timeout}ms`);
    }
    throw new Error(`HTTP request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function httpCapability(config: HttpConfig = {}): Capability {
  const tools: ToolDefinition[] = [
    defineTool({
      name: 'http_get',
      description: 'Make an HTTP GET request to a URL and return the response.',
      schema: httpGetSchema,
      category: 'http',
      handler: async input => {
        return doFetch(input.url, { method: 'GET', headers: input.headers }, config);
      },
    }),
    defineTool({
      name: 'http_post',
      description: 'Make an HTTP POST request with a JSON body.',
      schema: httpPostSchema,
      category: 'http',
      handler: async input => {
        const contentType = input.contentType ?? 'application/json';
        const body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
        return doFetch(
          input.url,
          {
            method: 'POST',
            headers: { 'Content-Type': contentType, ...input.headers },
            body,
          },
          config
        );
      },
    }),
    defineTool({
      name: 'http_put',
      description: 'Make an HTTP PUT request with a JSON body.',
      schema: httpPutSchema,
      category: 'http',
      handler: async input => {
        const contentType = input.contentType ?? 'application/json';
        const body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
        return doFetch(
          input.url,
          {
            method: 'PUT',
            headers: { 'Content-Type': contentType, ...input.headers },
            body,
          },
          config
        );
      },
    }),
    defineTool({
      name: 'http_delete',
      description: 'Make an HTTP DELETE request.',
      schema: httpDeleteSchema,
      category: 'http',
      handler: async input => {
        return doFetch(input.url, { method: 'DELETE', headers: input.headers }, config);
      },
    }),
  ];

  return { name: 'http', description: 'HTTP request tools (GET, POST, PUT, DELETE)', tools };
}
