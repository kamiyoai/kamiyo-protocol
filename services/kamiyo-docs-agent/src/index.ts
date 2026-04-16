import 'dotenv/config';
import { execSync } from 'node:child_process';
import { loadConfig } from './config';
import { runDocsAgent } from './agent';

function gatherMergeContext(sha?: string): string {
  const target = sha ?? 'HEAD';
  try {
    const subject = execSync(`git log -1 --format=%s ${target}`).toString().trim();
    const body = execSync(`git log -1 --format=%b ${target}`).toString().trim();
    const files = execSync(`git show --stat --format= ${target}`).toString().trim();
    return `SHA: ${target}\nSubject: ${subject}\n\nBody:\n${body}\n\nFiles:\n${files}`;
  } catch (err) {
    console.error('[docs-agent] git inspect failed:', err);
    return `SHA: ${target} (no git context available)`;
  }
}

async function main() {
  const cfg = loadConfig();
  const context = gatherMergeContext(cfg.MERGE_SHA);
  console.log(`[docs-agent] context length=${context.length}`);
  await runDocsAgent(cfg, context);
}

main().catch(err => {
  console.error('[docs-agent] fatal:', err);
  process.exit(1);
});
