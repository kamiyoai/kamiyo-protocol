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
    return data.filter(i => !i.pull_request);
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
}
