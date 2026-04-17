import type { Config } from './config';

export interface PostizDraft {
  text: string;
  scheduledFor: Date;
  integrations: string[];
}

export class PostizClient {
  constructor(private cfg: Config) {}

  private headers() {
    return {
      Authorization: this.cfg.POSTIZ_API_KEY ?? '',
      'Content-Type': 'application/json',
    };
  }

  async schedule(draft: PostizDraft): Promise<{ id: string }> {
    if (this.cfg.DRY_RUN) {
      console.log(
        `[postiz] DRY_RUN would schedule at ${draft.scheduledFor.toISOString()}: ${draft.text}`
      );
      return { id: 'dry-run' };
    }
    if (!this.cfg.POSTIZ_URL || !this.cfg.POSTIZ_API_KEY) {
      throw new Error('POSTIZ_URL and POSTIZ_API_KEY required for live scheduling');
    }
    const body = {
      type: 'schedule',
      date: draft.scheduledFor.toISOString(),
      posts: draft.integrations.map(integration => ({
        integration: { id: integration },
        value: [{ content: draft.text }],
      })),
    };
    const res = await fetch(`${this.cfg.POSTIZ_URL}/public/v1/posts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`postiz schedule failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as { id: string };
  }

  async listUpcoming(): Promise<Array<{ id: string; scheduledFor: string }>> {
    if (!this.cfg.POSTIZ_URL || !this.cfg.POSTIZ_API_KEY) {
      throw new Error('POSTIZ_URL and POSTIZ_API_KEY required for listing posts');
    }
    const res = await fetch(`${this.cfg.POSTIZ_URL}/public/v1/posts?status=SCHEDULED`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`postiz list failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as Array<{ id: string; scheduledFor: string }>;
  }
}
