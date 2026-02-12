import { execFile as execFileCb } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { DKGMemory } from './dkg-memory';
import { createLogger, getMetrics } from './lib';

const execFile = promisify(execFileCb);
const log = createLogger('nika:repo-knowledge');
const metrics = getMetrics();

const SERVICE_RELATIVE_PATH = 'services/keiro-api';
const REQUIRED_FILES = [
  `${SERVICE_RELATIVE_PATH}/package.json`,
  `${SERVICE_RELATIVE_PATH}/src/index.ts`,
];

export interface RepoKnowledgeSnapshot {
  summary: string;
  repoRoot: string;
  generatedAt: string;
  commitSha: string | null;
  commitMessage: string | null;
  commitDate: string | null;
  routes: string[];
}

export interface RepoKnowledgeMonitorConfig {
  repoRootHint?: string;
  intervalMs?: number;
  enabled?: boolean;
  dkgMemory?: DKGMemory | null;
}

interface KeiroFacts {
  repoRoot: string;
  packageName: string;
  packageVersion: string;
  routes: string[];
  commitSha: string | null;
  commitMessage: string | null;
  commitDate: string | null;
}

let latestSnapshot: RepoKnowledgeSnapshot | null = null;

export function getRepoKnowledgeSnapshot(): RepoKnowledgeSnapshot | null {
  return latestSnapshot;
}

export class RepoKnowledgeMonitor {
  private readonly config: Required<Omit<RepoKnowledgeMonitorConfig, 'dkgMemory'>> & {
    dkgMemory: DKGMemory | null;
  };
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastFingerprint: string | null = null;

  constructor(config: RepoKnowledgeMonitorConfig) {
    this.config = {
      repoRootHint: config.repoRootHint || '',
      intervalMs: config.intervalMs ?? 6 * 60 * 60 * 1000,
      enabled: config.enabled ?? true,
      dkgMemory: config.dkgMemory ?? null,
    };
  }

  async start(): Promise<void> {
    if (!this.config.enabled || this.running) return;
    this.running = true;
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.config.intervalMs);
    this.timer.unref?.();
    log.info('Repo knowledge monitor started', {
      intervalMs: this.config.intervalMs,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getSnapshot(): RepoKnowledgeSnapshot | null {
    return latestSnapshot;
  }

  async refresh(): Promise<RepoKnowledgeSnapshot | null> {
    if (!this.config.enabled) return null;

    try {
      const facts = await collectKeiroFacts(this.config.repoRootHint);
      if (!facts) {
        metrics.incrementCounter('repo_knowledge_refresh_skipped');
        return latestSnapshot;
      }

      const summary = buildSummary(facts);
      const snapshot: RepoKnowledgeSnapshot = {
        summary,
        repoRoot: facts.repoRoot,
        generatedAt: new Date().toISOString(),
        commitSha: facts.commitSha,
        commitMessage: facts.commitMessage,
        commitDate: facts.commitDate,
        routes: facts.routes,
      };

      const fingerprint = [
        facts.commitSha || 'no-commit',
        facts.packageVersion || 'no-version',
        facts.routes.join(','),
      ].join('|');

      latestSnapshot = snapshot;
      metrics.incrementCounter('repo_knowledge_refresh_success');

      if (fingerprint !== this.lastFingerprint) {
        this.lastFingerprint = fingerprint;
        log.info('Repo knowledge refreshed', {
          commit: facts.commitSha?.slice(0, 8) || 'none',
          routeCount: facts.routes.length,
        });
        await this.publishToDkgIfAvailable(snapshot);
      }

      return snapshot;
    } catch (error) {
      metrics.incrementCounter('repo_knowledge_refresh_error');
      log.warn('Repo knowledge refresh failed', { error: String(error) });
      return latestSnapshot;
    }
  }

  private async publishToDkgIfAvailable(snapshot: RepoKnowledgeSnapshot): Promise<void> {
    if (!this.config.dkgMemory) return;

    try {
      const ual = await this.config.dkgMemory.storeObservation({
        content: snapshot.summary,
        source: 'repo-monitor:kamiyo-protocol/services/keiro-api',
        confidence: 0.9,
        topics: ['keiro', 'kamiyo-protocol', 'api', 'jobs', 'agents', 'earnings', 'reputation'],
      });
      if (ual) {
        metrics.incrementCounter('repo_knowledge_published');
      }
    } catch (error) {
      metrics.incrementCounter('repo_knowledge_publish_error');
      log.warn('Failed to publish repo knowledge to DKG', { error: String(error) });
    }
  }
}

export async function collectKeiroFacts(repoRootHint?: string): Promise<KeiroFacts | null> {
  const repoRoot = await resolveRepoRoot(repoRootHint);
  if (!repoRoot) return null;

  const packageJsonPath = resolve(repoRoot, SERVICE_RELATIVE_PATH, 'package.json');
  const indexPath = resolve(repoRoot, SERVICE_RELATIVE_PATH, 'src', 'index.ts');

  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const indexSource = await readFile(indexPath, 'utf8');
  const pkg = JSON.parse(packageJsonRaw) as { name?: string; version?: string };

  const routes = Array.from(indexSource.matchAll(/app\.route\('([^']+)'/g))
    .map((m) => m[1])
    .filter(Boolean);

  const commit = await readLatestKeiroCommit(repoRoot);

  return {
    repoRoot,
    packageName: pkg.name || '@kamiyo/keiro-api',
    packageVersion: pkg.version || 'unknown',
    routes: routes.length > 0 ? routes : ['/api/agents', '/api/jobs', '/api/earnings', '/api/reputation'],
    commitSha: commit.sha,
    commitMessage: commit.message,
    commitDate: commit.date,
  };
}

export function buildSummary(facts: KeiroFacts): string {
  const routeList = facts.routes.join(', ');
  const commitFragment = facts.commitMessage
    ? `Last update in ${SERVICE_RELATIVE_PATH}: "${facts.commitMessage}"${facts.commitDate ? ` (${facts.commitDate.slice(0, 10)})` : ''}.`
    : `Latest commit for ${SERVICE_RELATIVE_PATH} is not available in this environment.`;

  return [
    `Keiro context from kamiyo-protocol: ${facts.packageName} v${facts.packageVersion} is the API layer for Keiro's agent work marketplace.`,
    `It exposes ${routeList}, covering agent identity/skills, job lifecycle, earnings tracking, and reputation tiers.`,
    commitFragment,
  ].join(' ');
}

async function resolveRepoRoot(repoRootHint?: string): Promise<string | null> {
  const hint = repoRootHint?.trim();
  const cwd = process.cwd();
  const candidates = [
    hint,
    cwd,
    resolve(cwd, '../..'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const absolute = resolve(candidate);
      await Promise.all(
        REQUIRED_FILES.map((file) => access(resolve(absolute, file)))
      );
      return absolute;
    } catch {
      continue;
    }
  }

  return null;
}

async function readLatestKeiroCommit(
  repoRoot: string
): Promise<{ sha: string | null; message: string | null; date: string | null }> {
  try {
    const { stdout } = await execFile('git', [
      '-C',
      repoRoot,
      'log',
      '-1',
      '--format=%H|%cI|%s',
      '--',
      SERVICE_RELATIVE_PATH,
    ]);

    const line = stdout.trim();
    if (!line) return { sha: null, message: null, date: null };
    const [sha, date, ...rest] = line.split('|');
    return {
      sha: sha || null,
      date: date || null,
      message: rest.join('|') || null,
    };
  } catch {
    return { sha: null, message: null, date: null };
  }
}
