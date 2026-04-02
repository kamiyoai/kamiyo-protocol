/**
 * Agentic Tool Definitions
 *
 * The 4 tools available to the bounded agentic loop.
 * Each tool is a pure function that can be called by the LLM
 * during multi-step reasoning.
 *
 * @module swarm/agenticTools
 */

export type AgenticToolName =
  | 'http_request'
  | 'verify_result'
  | 'retry_with_modification'
  | 'report_outcome';

export type AgenticToolCall = {
  tool: AgenticToolName;
  input: Record<string, unknown>;
};

export type AgenticToolResult = {
  tool: AgenticToolName;
  success: boolean;
  output: unknown;
  error?: string;
};

export type HttpRequestInput = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

export type VerifyResultInput = {
  httpStatus: number;
  responseBody: unknown;
  expectedFields?: string[];
  minContentLength?: number;
};

export type RetryModificationInput = {
  originalUrl: string;
  modifications: {
    headers?: Record<string, string>;
    body?: string;
    method?: HttpRequestInput['method'];
    queryParams?: Record<string, string>;
  };
};

export type ReportOutcomeInput = {
  status: 'executed' | 'failed' | 'skipped';
  reason: string;
  output?: unknown;
};

export async function executeHttpRequest(
  input: HttpRequestInput,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<AgenticToolResult> {
  try {
    const controller = new AbortController();
    const timeoutMs =
      typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs)
        ? Math.max(1, input.timeoutMs)
        : 20_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFn(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    let responseBody: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      tool: 'http_request',
      success: response.ok,
      output: {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
      },
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      tool: 'http_request',
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function verifyResult(input: VerifyResultInput): AgenticToolResult {
  const issues: string[] = [];

  if (input.httpStatus >= 400) {
    issues.push(`HTTP status ${input.httpStatus} indicates error`);
  }

  if (input.expectedFields && input.expectedFields.length > 0) {
    if (input.responseBody && typeof input.responseBody === 'object') {
      const body = input.responseBody as Record<string, unknown>;
      for (const field of input.expectedFields) {
        if (!(field in body)) {
          issues.push(`Missing expected field: ${field}`);
        }
      }
    } else {
      issues.push('Response body is not an object, cannot verify fields');
    }
  }

  if (input.minContentLength !== undefined) {
    const bodyStr =
      typeof input.responseBody === 'string'
        ? input.responseBody
        : JSON.stringify(input.responseBody ?? '');
    if (bodyStr.length < input.minContentLength) {
      issues.push(`Response too short: ${bodyStr.length} < ${input.minContentLength}`);
    }
  }

  return {
    tool: 'verify_result',
    success: issues.length === 0,
    output: {
      verified: issues.length === 0,
      issues,
    },
    error: issues.length > 0 ? issues.join('; ') : undefined,
  };
}

export function buildRetryUrl(input: RetryModificationInput): string {
  let url = input.originalUrl;
  if (input.modifications.queryParams) {
    const separator = url.includes('?') ? '&' : '?';
    const params = new URLSearchParams(input.modifications.queryParams).toString();
    url = `${url}${separator}${params}`;
  }
  return url;
}

export function getToolDefinitions(): Array<{
  name: AgenticToolName;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return [
    {
      name: 'http_request',
      description: 'Make an HTTP request to the opportunity endpoint',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          headers: { type: 'object' },
          body: { type: 'string' },
        },
        required: ['url', 'method'],
      },
    },
    {
      name: 'verify_result',
      description: 'Verify the quality and completeness of a response',
      parameters: {
        type: 'object',
        properties: {
          httpStatus: { type: 'number' },
          responseBody: {},
          expectedFields: { type: 'array', items: { type: 'string' } },
          minContentLength: { type: 'number' },
        },
        required: ['httpStatus', 'responseBody'],
      },
    },
    {
      name: 'retry_with_modification',
      description: 'Retry the request with modified parameters',
      parameters: {
        type: 'object',
        properties: {
          originalUrl: { type: 'string' },
          modifications: { type: 'object' },
        },
        required: ['originalUrl', 'modifications'],
      },
    },
    {
      name: 'report_outcome',
      description: 'Report final outcome and exit the agentic loop',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['executed', 'failed', 'skipped'] },
          reason: { type: 'string' },
          output: {},
        },
        required: ['status', 'reason'],
      },
    },
  ];
}
