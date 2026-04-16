// SPDX-License-Identifier: MIT
import 'dotenv/config';
import { loadConfig } from './config';
import { runAgentOnIssue } from './agent';
import { Octokit } from '@octokit/rest';

async function main() {
  const cfg = loadConfig();
  const n = Number(process.argv[2]);
  if (!Number.isInteger(n) || n <= 0) {
    console.error('usage: run-issue <issue-number>');
    process.exit(2);
  }

  const [owner, repo] = cfg.GITHUB_REPO.split('/');
  const octokit = new Octokit({ auth: cfg.GITHUB_TOKEN });
  const { data } = await octokit.issues.get({ owner, repo, issue_number: n });
  if (data.pull_request) {
    console.error(`#${n} is a pull request, not an issue`);
    process.exit(2);
  }

  const labels = data.labels.map(l => (typeof l === 'string' ? l : (l.name ?? '')));
  await runAgentOnIssue(cfg, data.number, data.title, data.body ?? '', labels);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
