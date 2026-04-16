import 'dotenv/config';
import { loadConfig } from './config';
import { GitHubClient } from './github';
import { runAgentOnIssue } from './agent';

async function main() {
  const cfg = loadConfig();
  const gh = new GitHubClient(cfg);

  if (await gh.isHalted()) {
    console.log(`[autopilot] halt label "${cfg.HALT_LABEL}" is set, exiting`);
    return;
  }

  const issues = await gh.listAgentIssues();
  console.log(`[autopilot] ${issues.length} open issue(s) labeled "${cfg.AGENT_LABEL}"`);

  if (issues.length === 0) return;

  const issue = issues[0];
  console.log(`[autopilot] working on #${issue.number}: ${issue.title}`);
  await runAgentOnIssue(cfg, issue.number, issue.title, issue.body ?? '');
}

main().catch(err => {
  console.error('[autopilot] fatal:', err);
  process.exit(1);
});
