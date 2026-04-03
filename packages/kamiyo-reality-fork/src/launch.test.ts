import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRealityForkLaunchRun, writeRealityForkLaunchArtifacts } from './launch';

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function initRepo(root: string): void {
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Mizuki',
      '-c',
      'user.email=kamiyo-ai@users.noreply.github.com',
      'commit',
      '-m',
      'init',
    ],
    { cwd: root, stdio: 'ignore' }
  );
}

describe('createRealityForkLaunchRun', () => {
  it('scores a repo and writes launch artifacts', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-launch-'));

    writeFile(
      repoPath,
      'README.md',
      `# launch-forge

Stress-test a launch before shipping it.

\`\`\`bash
cargo install kamiyo-reality-fork-cli
reality-fork run launch --repo .
\`\`\`

This first run does not require a remote API. It emits report.html, decision.md, and trace.json.
`
    );
    writeFile(
      repoPath,
      'docs/overview.md',
      `# Overview

One command should fork the launch reality, compare futures, and emit a report artifact.
`
    );
    writeFile(
      repoPath,
      'examples/case-study.md',
      '# Example\n\nA narrow launch beats a broad launch.'
    );
    writeFile(repoPath, 'fixtures/ship-now.json', '{"ok":true}');
    writeFile(repoPath, 'src/index.test.ts', 'export const ok = true;');
    writeFile(repoPath, '.github/workflows/ci.yml', 'name: ci\non: [push]\n');
    writeFile(repoPath, '.env.example', 'OPENAI_API_KEY=\n');
    writeFile(repoPath, 'LICENSE', 'MIT\n');
    writeFile(
      repoPath,
      'Cargo.toml',
      `[package]
name = "launch-forge"
version = "0.1.0"
edition = "2021"
`
    );
    writeFile(repoPath, 'Cargo.lock', '[[package]]\nname = "launch-forge"\n');
    initRepo(repoPath);

    const run = await createRealityForkLaunchRun({
      repoPath,
      prompt: 'Should we launch this to external builders next week?',
    });

    expect(run.branches).toHaveLength(4);
    expect(run.axes.map(axis => axis.id)).toContain('immediacy');
    expect(run.verdict.reason.length).toBeGreaterThan(20);
    expect(run.posts.announcement).toContain('launch-forge');

    const artifacts = await writeRealityForkLaunchArtifacts(
      run,
      path.join(repoPath, '.rf-artifacts')
    );
    const markdown = fs.readFileSync(artifacts.decisionPath, 'utf8');
    const html = fs.readFileSync(artifacts.reportPath, 'utf8');
    const trace = JSON.parse(fs.readFileSync(artifacts.tracePath, 'utf8')) as {
      verdict: { winnerBranchId: string };
    };

    expect(markdown).toContain('## Verdict');
    expect(markdown).toContain('## Scoreboard');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Reality Fork Launch Run');
    expect(trace.verdict.winnerBranchId).toBeTruthy();
  });
});
