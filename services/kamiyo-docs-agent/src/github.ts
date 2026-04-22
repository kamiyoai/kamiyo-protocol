import type { Config } from './config';

export type PullRequestSnapshot = {
  number: number;
  url: string;
  state: 'open' | 'closed';
  headRef: string;
  headSha: string;
  merged: boolean;
  draft: boolean;
  mergedAt: string | null;
  closedAt: string | null;
};

type PullRequestResponse = {
  number: number;
  html_url: string;
  state: 'open' | 'closed';
  draft?: boolean;
  merged_at?: string | null;
  closed_at?: string | null;
  head: {
    ref: string;
    sha: string;
  };
};

export class GitHubClient {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;

  constructor(cfg: Config) {
    const [owner, repo] = cfg.GITHUB_REPO.split('/');
    this.owner = owner;
    this.repo = repo;
    this.token = cfg.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  }

  async getPullRequestState(prUrl: string): Promise<PullRequestSnapshot | null> {
    const match = prUrl.match(/\/pull\/(\d+)(?:\/|$)/);
    if (!match) return null;

    const prNumber = Number(match[1]);
    if (!Number.isFinite(prNumber) || prNumber <= 0) return null;

    const pr = await this.request<PullRequestResponse>(`/pulls/${prNumber}`);
    return pr ? mapPullRequest(pr) : null;
  }

  async findPullRequestByBranch(branch: string): Promise<PullRequestSnapshot | null> {
    const pulls = await this.request<PullRequestResponse[]>(
      `/pulls?state=all&head=${encodeURIComponent(`${this.owner}:${branch}`)}&per_page=1`
    );
    return pulls?.[0] ? mapPullRequest(pulls[0]) : null;
  }

  async listPullRequestFiles(prNumber: number): Promise<string[]> {
    const files: string[] = [];
    let page = 1;

    while (true) {
      const chunk = await this.request<Array<{ filename?: string }>>(
        `/pulls/${prNumber}/files?per_page=100&page=${page}`
      );
      if (!chunk || chunk.length === 0) break;
      for (const file of chunk) {
        if (file.filename) files.push(file.filename);
      }
      if (chunk.length < 100) break;
      page += 1;
    }

    return [...new Set(files)].sort();
  }

  private async request<T>(path: string): Promise<T | null> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'kamiyo-docs-agent',
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
      headers,
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub HTTP ${response.status}: ${errorText}`);
    }

    return (await response.json()) as T;
  }
}

function mapPullRequest(pr: PullRequestResponse): PullRequestSnapshot {
  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.state === 'closed' ? 'closed' : 'open',
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    merged: Boolean(pr.merged_at),
    draft: Boolean(pr.draft),
    mergedAt: pr.merged_at ?? null,
    closedAt: pr.closed_at ?? null,
  };
}
