import type {
  CreateRealityForkEvidenceInput,
  CreateRealityForkProjectInput,
  RealityForkJob,
  RealityForkProjectCreateResponse,
  RealityForkProjectDetail,
  RealityForkProjectEvent,
  RealityForkProjectListResponse,
  RealityForkPublication,
  RealityForkUploadResponse,
} from './types';

type RealityForkStudioClientConfig = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export class RealityForkStudioClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: RealityForkStudioClientConfig) {
    this.baseUrl = trimBaseUrl(config.baseUrl);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(`Reality Fork request failed (${response.status} ${path})`);
    }
    return response.json() as Promise<T>;
  }

  listProjects() {
    return this.requestJson<RealityForkProjectListResponse>('/api/reality-fork');
  }

  createUploads(formData: FormData) {
    return this.requestJson<RealityForkUploadResponse>('/api/reality-fork/uploads', {
      method: 'POST',
      body: formData,
    });
  }

  createProject(body: CreateRealityForkProjectInput) {
    return this.requestJson<RealityForkProjectCreateResponse>('/api/reality-fork/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  getProject(projectId: string) {
    return this.requestJson<RealityForkProjectDetail>(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}`
    );
  }

  addEvidence(projectId: string, body: CreateRealityForkEvidenceInput) {
    return this.requestJson(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/evidence`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  }

  createJob(projectId: string, kind: 'full' | 'publish' = 'full') {
    return this.requestJson<RealityForkJob>(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/jobs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      }
    );
  }

  getJob(projectId: string, jobId: string) {
    return this.requestJson<RealityForkJob>(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`
    );
  }

  publish(projectId: string) {
    return this.requestJson<RealityForkJob>(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/publish`,
      {
        method: 'POST',
      }
    );
  }

  retry(projectId: string) {
    return this.requestJson<RealityForkJob>(
      `/api/reality-fork/projects/${encodeURIComponent(projectId)}/retry`,
      {
        method: 'POST',
      }
    );
  }

  getPublication(slug: string) {
    return this.requestJson<RealityForkPublication>(
      `/api/reality-fork/publications/${encodeURIComponent(slug)}`
    );
  }

  async *streamProject(projectId: string): AsyncGenerator<RealityForkProjectEvent> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/reality-fork/projects/${encodeURIComponent(projectId)}/stream`
    );
    if (!response.ok || !response.body) {
      throw new Error(`Reality Fork stream failed (${response.status})`);
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
        yield JSON.parse(data) as RealityForkProjectEvent;
      }
    }
  }
}

export function createRealityForkStudioClient(config: RealityForkStudioClientConfig) {
  return new RealityForkStudioClient(config);
}
