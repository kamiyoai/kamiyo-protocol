import type {
  CompanionControlRoomCaseDetail,
  CompanionControlRoomCaseListResponse,
  CompanionControlRoomCaseEvent,
} from './types';

type CompanionControlRoomClientConfig = {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export class CompanionControlRoomClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CompanionControlRoomClientConfig) {
    this.baseUrl = trimBaseUrl(config.baseUrl);
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init?.headers),
    });

    if (!response.ok) {
      throw new Error(`Companion request failed (${response.status} ${path})`);
    }

    return response.json() as Promise<T>;
  }

  listCases(teamId: string, params?: { limit?: number; offset?: number }) {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.offset) search.set('offset', String(params.offset));
    const query = search.size > 0 ? `?${search.toString()}` : '';
    return this.requestJson<CompanionControlRoomCaseListResponse>(
      `/api/hive-teams/${encodeURIComponent(teamId)}/control-room/cases${query}`
    );
  }

  getCase(teamId: string, caseId: string) {
    return this.requestJson<CompanionControlRoomCaseDetail>(
      `/api/hive-teams/${encodeURIComponent(teamId)}/control-room/cases/${encodeURIComponent(caseId)}`
    );
  }

  createCase(
    teamId: string,
    body: {
      mission: string;
      snapshotSource: { type: string; ref?: string };
      manualEvidence?: Record<string, unknown>;
      decisionMode?: string;
    }
  ) {
    return this.requestJson<CompanionControlRoomCaseDetail>(
      `/api/hive-teams/${encodeURIComponent(teamId)}/control-room/cases`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  }

  runCase(
    teamId: string,
    caseId: string,
    body: {
      baselinePlan?: Record<string, unknown>;
      maxParallel?: number;
      failFast?: boolean;
    } = {}
  ) {
    return this.requestJson<CompanionControlRoomCaseDetail>(
      `/api/hive-teams/${encodeURIComponent(teamId)}/control-room/cases/${encodeURIComponent(caseId)}/run`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  }

  promoteCase(
    teamId: string,
    caseId: string,
    body: { branchId: string; mode?: 'execute' | 'manual' }
  ) {
    return this.requestJson<CompanionControlRoomCaseDetail>(
      `/api/hive-teams/${encodeURIComponent(teamId)}/control-room/cases/${encodeURIComponent(caseId)}/promote`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  }

  async *streamCaseEvents(
    teamId: string,
    caseId: string
  ): AsyncGenerator<CompanionControlRoomCaseEvent> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/hive-teams/${encodeURIComponent(teamId)}/control-room/cases/${encodeURIComponent(caseId)}/stream`,
      { headers: this.headers() }
    );
    if (!response.ok || !response.body) {
      throw new Error(`Companion stream failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        let eventName = 'message';
        let data = '';
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event: ')) eventName = line.slice(7);
          if (line.startsWith('data: ')) data += line.slice(6);
        }

        if (eventName === 'done') return;
        if (eventName === 'ping' || !data) continue;
        yield JSON.parse(data) as CompanionControlRoomCaseEvent;
      }
    }
  }
}

export function createCompanionControlRoomClient(config: CompanionControlRoomClientConfig) {
  return new CompanionControlRoomClient(config);
}
