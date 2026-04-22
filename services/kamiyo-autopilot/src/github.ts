// SPDX-License-Identifier: MIT
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

  async getPullRequestState(prUrl: string): Promise<{
    number: number;
    url: string;
    headSha: string;
    merged: boolean;
    draft: boolean;
    mergeableState: string | null;
    checkState: 'success' | 'failure' | 'pending' | 'unknown';
  } | null> {
    const match = prUrl.match(/\/pull\/(\d+)(?:\/|$)/);
    if (!match) return null;

    const prNumber = Number(match[1]);
    if (!Number.isFinite(prNumber) || prNumber <= 0) return null;

    const { data: pr } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });

    let checkState: 'success' | 'failure' | 'pending' | 'unknown' = 'unknown';
    try {
      const { data: status } = await this.octokit.repos.getCombinedStatusForRef({
        owner: this.owner,
        repo: this.repo,
        ref: pr.head.sha,
      });

      if (status.state === 'success' || status.state === 'failure' || status.state === 'pending') {
        checkState = status.state;
      }
    } catch {
      checkState = 'unknown';
    }

    return {
      number: pr.number,
      url: pr.html_url,
      headSha: pr.head.sha,
      merged: Boolean(pr.merged_at),
      draft: Boolean(pr.draft),
      mergeableState: pr.mergeable_state ?? null,
      checkState,
    };
  }
}
