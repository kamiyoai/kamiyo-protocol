import { Octokit } from '@octokit/rest';
import type { Config } from './config';

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(private cfg: Config) {
    this.octokit = new Octokit({ auth: cfg.GITHUB_TOKEN });
    const [owner, repo] = cfg.GITHUB_REPO.split('/');
    this.owner = owner;
    this.repo = repo;
  }

  async listAgentIssues() {
    const { data } = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      labels: this.cfg.AGENT_LABEL,
      per_page: 20,
    });
    const issues = data.filter(i => !i.pull_request);
    if (issues.length === 0) return issues;

    const { data: openBotPrs } = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      per_page: 100,
    });
    const referenced = new Set<number>();
    for (const pr of openBotPrs) {
      if (pr.user?.login !== this.cfg.BOT_LOGIN) continue;
      const haystack = `${pr.title}\n${pr.body ?? ''}`;
      for (const m of haystack.matchAll(/(?:closes|fixes|resolves)\s+#(\d+)/gi)) {
        referenced.add(Number(m[1]));
      }
      const branchMatch = pr.head.ref.match(/issue-(\d+)/i);
      if (branchMatch) referenced.add(Number(branchMatch[1]));
    }
    return issues.filter(i => !referenced.has(i.number));
  }

  async isHalted(): Promise<boolean> {
    const { data } = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      labels: this.cfg.HALT_LABEL,
      per_page: 1,
    });
    return data.length > 0;
  }

  async commentOnIssue(issueNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
  }

  async closeIssue(issueNumber: number, body?: string): Promise<void> {
    if (body) {
      await this.commentOnIssue(issueNumber, body);
    }
    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      state: 'closed',
      state_reason: 'completed',
    });
  }
}
