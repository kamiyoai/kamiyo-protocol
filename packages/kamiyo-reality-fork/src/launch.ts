import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WALK_SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);

const MAX_DOC_BYTES = 24_000;
const MAX_DOC_FILES = 10;

export type RealityForkLaunchAxisId =
  | 'immediacy'
  | 'clarity'
  | 'proof'
  | 'distribution'
  | 'shareability'
  | 'trust';

export type RealityForkLaunchAxis = {
  id: RealityForkLaunchAxisId;
  label: string;
  score: number;
  summary: string;
};

export type RealityForkLaunchSignal = {
  id: string;
  type: 'supporting' | 'risk' | 'neutral';
  axis: RealityForkLaunchAxisId;
  statement: string;
  detail: string;
  weight: number;
  citations: string[];
  inferred: boolean;
};

export type RealityForkLaunchBranchId =
  | 'ship_now'
  | 'narrow_launch'
  | 'delay_for_proof'
  | 'park_it';

export type RealityForkLaunchBranch = {
  id: RealityForkLaunchBranchId;
  label: string;
  stance: string;
  score: number;
  summary: string;
  advantages: string[];
  risks: string[];
  nextMoves: string[];
};

export type RealityForkLaunchPosts = {
  announcement: string;
  thread: string[];
};

export type RealityForkLaunchRepoContext = {
  name: string;
  displayPath: string;
  fileCount: number;
  focusPaths: string[];
  readmePath: string | null;
  readmeExcerpt: string | null;
  docs: string[];
  tests: string[];
  examples: string[];
  fixtures: string[];
  manifests: string[];
  locks: string[];
  ci: string[];
  envExamples: string[];
  licenses: string[];
  assets: string[];
  installCommands: string[];
  localRunCommands: string[];
  remoteDependencyNotes: string[];
  runtimeNotes: string[];
  artifactNotes: string[];
  languages: Array<{
    name: string;
    fileCount: number;
  }>;
  git: {
    branch: string | null;
    commit: string | null;
    remoteUrl: string | null;
    webUrl: string | null;
    changedFiles: string[];
    recentCommits: string[];
  };
};

export type RealityForkLaunchRun = {
  kind: 'launch';
  version: 1;
  generatedAt: string;
  title: string;
  prompt: string;
  repo: RealityForkLaunchRepoContext;
  axes: RealityForkLaunchAxis[];
  signals: RealityForkLaunchSignal[];
  branches: RealityForkLaunchBranch[];
  verdict: {
    winnerBranchId: RealityForkLaunchBranchId;
    label: string;
    reason: string;
    score: number;
    readiness: number;
  };
  actions: string[];
  posts: RealityForkLaunchPosts;
};

export type RealityForkLaunchArtifactPaths = {
  outputDir: string;
  decisionPath: string;
  reportPath: string;
  tracePath: string;
};

export type CreateRealityForkLaunchRunInput = {
  repoPath: string;
  prompt?: string;
  title?: string;
  focusPaths?: string[];
};

type DocSource = {
  path: string;
  text: string;
};

type RepoSignals = {
  hasReadme: number;
  docsScore: number;
  commandDocsScore: number;
  installScore: number;
  localModeScore: number;
  outcomeScore: number;
  exampleScore: number;
  artifactScore: number;
  proofScore: number;
  ciScore: number;
  commitScore: number;
  manifestScore: number;
  lockScore: number;
  changelogScore: number;
  cleanScore: number;
  licenseScore: number;
  envScore: number;
  splitRuntimePenalty: number;
  externalDependencyPenalty: number;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function average(...values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function sanitizePath(value: string): string {
  const home = os.homedir();
  if (value.startsWith(home)) {
    return value.replace(home, '$HOME');
  }
  return value;
}

function compactText(value: string, max = 190): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function trimPost(value: string): string {
  if (value.length <= 280) return value;
  return `${value.slice(0, 277)}...`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sample<T>(values: T[], count: number): T[] {
  return values.slice(0, count);
}

function axisLabel(axis: RealityForkLaunchAxisId): string {
  switch (axis) {
    case 'immediacy':
      return 'Immediacy';
    case 'clarity':
      return 'Clarity';
    case 'proof':
      return 'Proof';
    case 'distribution':
      return 'Distribution';
    case 'shareability':
      return 'Shareability';
    case 'trust':
      return 'Trust';
  }
}

function branchOrder(id: RealityForkLaunchBranchId): number {
  switch (id) {
    case 'narrow_launch':
      return 0;
    case 'ship_now':
      return 1;
    case 'delay_for_proof':
      return 2;
    case 'park_it':
      return 3;
  }
}

function summarizeAxis(id: RealityForkLaunchAxisId, score: number): string {
  switch (id) {
    case 'immediacy':
      if (score >= 0.78) {
        return 'A builder can reach first value quickly because the repo exposes concrete commands and local material.';
      }
      if (score >= 0.58) {
        return 'There is a viable first run, but setup still asks for more context than a breakout launch should.';
      }
      return 'First value is still buried behind setup, explanation, or external dependencies.';
    case 'clarity':
      if (score >= 0.78) {
        return 'The docs lead with a concrete outcome instead of making readers reverse-engineer the point.';
      }
      if (score >= 0.58) {
        return 'The story is understandable, but it still leans too hard on features over a single killer use case.';
      }
      return 'The public story is still diffuse enough that strangers will ask what the product actually does.';
    case 'proof':
      if (score >= 0.78) {
        return 'There is enough evidence in the repo to make the product feel like more than a demo.';
      }
      if (score >= 0.58) {
        return 'The technical proof is real, but the repo still needs sharper public examples or case studies.';
      }
      return 'The repo does not yet provide enough proof that the product changes real decisions.';
    case 'distribution':
      if (score >= 0.78) {
        return 'Install and update paths are strong enough that distribution will help instead of hurt the product.';
      }
      if (score >= 0.58) {
        return 'There is a credible install path, but friction is still visible in packaging or runtime requirements.';
      }
      return 'Distribution friction is still high enough to block curiosity before the product can impress anyone.';
    case 'shareability':
      if (score >= 0.78) {
        return 'Runs produce or imply artifacts that a builder can paste into a thread, doc, or PR without extra work.';
      }
      if (score >= 0.58) {
        return 'The product can be explained publicly, but the repo still lacks enough instantly shareable proof objects.';
      }
      return 'There is still too little output a builder would want to show another human.';
    case 'trust':
      if (score >= 0.78) {
        return 'The repo shows enough tests, CI, and release discipline to make strangers less defensive.';
      }
      if (score >= 0.58) {
        return 'The repo feels serious, but some release or reliability signals are still missing from the first impression.';
      }
      return 'A public launch would force builders to trust the product more than the repo currently earns.';
  }
}

function exec(command: string, args: string[], cwd: string): string | null {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function deriveWebUrl(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  const clean = remoteUrl.trim().replace(/\.git$/i, '');
  if (clean.startsWith('https://') || clean.startsWith('http://')) {
    return clean.replace(/\.git$/i, '');
  }

  const sshMatch = clean.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/]([^/]+\/[^/]+)$/);
  if (!sshMatch) {
    return null;
  }

  const host = sshMatch[1];
  const repo = sshMatch[2];
  if (host === 'github.com' || host.startsWith('github')) {
    return `https://github.com/${repo}`;
  }
  return `https://${host}/${repo}`;
}

function keepRepoPath(relativePath: string): boolean {
  return !relativePath
    .split('/')
    .filter(Boolean)
    .some(segment => WALK_SKIP_DIRS.has(segment));
}

function isDocPath(relativePath: string): boolean {
  return (
    /(^|\/)(README|CHANGELOG)(\.[^.]+)?\.md$/i.test(relativePath) ||
    /^docs\/.+\.md$/i.test(relativePath)
  );
}

function isTestPath(relativePath: string): boolean {
  return (
    /(^|\/)__tests__\//.test(relativePath) ||
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|kt)$/i.test(relativePath)
  );
}

function isExamplePath(relativePath: string): boolean {
  return /(^|\/)(examples?|samples?|demos?)\//i.test(relativePath);
}

function isFixturePath(relativePath: string): boolean {
  return /(^|\/)fixtures\//i.test(relativePath);
}

function isManifestPath(relativePath: string): boolean {
  return /(^|\/)(package\.json|Cargo\.toml|pyproject\.toml|go\.mod)$/i.test(relativePath);
}

function isLockPath(relativePath: string): boolean {
  return /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|go\.sum)$/i.test(
    relativePath
  );
}

function isCiPath(relativePath: string): boolean {
  return (
    /^\.github\/workflows\/.+\.(yml|yaml)$/i.test(relativePath) ||
    /^\.gitlab-ci\.yml$/i.test(relativePath) ||
    /^\.circleci\//i.test(relativePath)
  );
}

function isEnvExamplePath(relativePath: string): boolean {
  return (
    /(^|\/)\.env(\.[^.]+)?\.example$/i.test(relativePath) || /\.env\.example$/i.test(relativePath)
  );
}

function isLicensePath(relativePath: string): boolean {
  return /(^|\/)LICENSE(\.[^.]+)?$/i.test(relativePath);
}

function isAssetPath(relativePath: string): boolean {
  return (
    /(^|\/)(assets?|screenshots?|static|public|reports?)\/.+\.(png|jpe?g|gif|svg|webp|html)$/i.test(
      relativePath
    ) || /(report|decision|trace)\.(html|md|json)$/i.test(relativePath)
  );
}

function isRootSupportPath(relativePath: string): boolean {
  return (
    isCiPath(relativePath) ||
    (!relativePath.includes('/') &&
      (isDocPath(relativePath) ||
        isManifestPath(relativePath) ||
        isLockPath(relativePath) ||
        isEnvExamplePath(relativePath) ||
        isLicensePath(relativePath)))
  );
}

function rankDocPath(relativePath: string): number {
  if (/^README(\.[^.]+)?\.md$/i.test(relativePath)) return 0;
  if (/^CHANGELOG(\.[^.]+)?\.md$/i.test(relativePath)) return 1;
  if (/\/README(\.[^.]+)?\.md$/i.test(relativePath)) return 2;
  if (/^docs\//i.test(relativePath)) return 3;
  return 4;
}

async function readTextIfSmall(rootPath: string, relativePath: string): Promise<string | null> {
  try {
    const absolutePath = path.join(rootPath, relativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile() || stat.size > MAX_DOC_BYTES) {
      return null;
    }
    return await fs.readFile(absolutePath, 'utf8');
  } catch {
    return null;
  }
}

async function walkFiles(rootPath: string, current = ''): Promise<string[]> {
  const directory = path.join(rootPath, current);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const next = current ? `${current}/${entry.name}` : entry.name;
    if (!keepRepoPath(next)) continue;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(rootPath, next)));
      continue;
    }
    if (entry.isFile()) {
      files.push(next);
    }
  }

  return files;
}

async function listRepoFiles(rootPath: string): Promise<string[]> {
  const realRootPath = await fs.realpath(rootPath).catch(() => rootPath);
  const gitRoot = exec('git', ['-C', rootPath, 'rev-parse', '--show-toplevel'], rootPath);
  if (!gitRoot) {
    return walkFiles(realRootPath);
  }

  const realGitRoot = await fs.realpath(gitRoot).catch(() => gitRoot);

  const tracked = exec('git', ['-C', rootPath, 'ls-files'], rootPath);
  const others = exec(
    'git',
    ['-C', rootPath, 'ls-files', '--others', '--exclude-standard'],
    rootPath
  );
  const gitPrefix = path.relative(realGitRoot, realRootPath).replace(/\\/g, '/').replace(/^$/, '');

  return unique([...(tracked ? tracked.split('\n') : []), ...(others ? others.split('\n') : [])])
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => {
      if (!gitPrefix) return true;
      return item === gitPrefix || item.startsWith(`${gitPrefix}/`);
    })
    .map(item => (gitPrefix ? item.slice(gitPrefix.length + 1) : item))
    .filter(Boolean)
    .filter(keepRepoPath)
    .sort((left, right) => left.localeCompare(right));
}

function firstParagraph(text: string | null): string | null {
  if (!text) return null;
  const blocks = text
    .split(/\n\s*\n/)
    .map(block => compactText(block, 240))
    .filter(block => block && !block.startsWith('#') && !block.startsWith('```'));
  return blocks[0] ?? null;
}

function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const matcher = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function extractCommands(docs: DocSource[]): {
  installCommands: string[];
  localRunCommands: string[];
  remoteDependencyNotes: string[];
  runtimeNotes: string[];
  artifactNotes: string[];
} {
  const installCommands: string[] = [];
  const localRunCommands: string[] = [];
  const remoteDependencyNotes: string[] = [];
  const runtimeNotes: string[] = [];
  const artifactNotes: string[] = [];

  for (const doc of docs) {
    for (const block of extractCodeBlocks(doc.text)) {
      for (const rawLine of block.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        if (
          /^(cargo install|brew install|go install|pip install|uv tool install|npm install -g|pnpm add -g|pnpm dlx|npx)\b/i.test(
            line
          )
        ) {
          installCommands.push(line);
        }
        if (
          /(^| )(reality-fork|kamiyo-reality-fork-cli)\b/i.test(line) ||
          /^(cargo run|npm run|pnpm run)\b/i.test(line)
        ) {
          localRunCommands.push(line);
        }
      }
    }

    for (const rawLine of doc.text.split('\n')) {
      const line = compactText(rawLine, 220);
      if (!line) continue;
      if (/\/api\/|remote api|expects a reality fork api|base-url/i.test(line)) {
        remoteDependencyNotes.push(`${doc.path}: ${line}`);
      }
      if (/(Node\.js|node 20|nodejs|cargo install|brew install)/i.test(line)) {
        runtimeNotes.push(`${doc.path}: ${line}`);
      }
      if (/(report\.html|decision\.md|trace\.json|artifact|html report|markdown)/i.test(line)) {
        artifactNotes.push(`${doc.path}: ${line}`);
      }
    }
  }

  return {
    installCommands: unique(installCommands),
    localRunCommands: unique(localRunCommands),
    remoteDependencyNotes: unique(remoteDependencyNotes),
    runtimeNotes: unique(runtimeNotes),
    artifactNotes: unique(artifactNotes),
  };
}

function nonGenericCommandNames(commands: string[]): string[] {
  return unique(
    commands
      .map(command => command.trim().split(/\s+/)[0]?.toLowerCase() ?? '')
      .filter(Boolean)
      .filter(
        value => !['npm', 'pnpm', 'yarn', 'cargo', 'python', 'uv', 'go', 'make'].includes(value)
      )
  );
}

function findFocusPaths(docs: DocSource[]): string[] {
  const anchors = docs
    .filter(doc => doc.path.includes('/'))
    .map(doc => ({ doc, commands: extractCommands([doc]) }))
    .filter(({ commands }) => {
      const brandedCommands = nonGenericCommandNames(commands.localRunCommands);
      return commands.installCommands.length > 0 && brandedCommands.length > 0;
    });

  if (anchors.length === 0) {
    return [];
  }

  const needles = unique(
    anchors.flatMap(({ doc, commands }) => {
      const commandNames = nonGenericCommandNames(commands.localRunCommands);
      const base = path.basename(path.dirname(doc.path)).toLowerCase();
      const baseParts = base.split('-').filter(part => part.length >= 3);
      const chunks = baseParts.flatMap((part, index) =>
        index < baseParts.length - 1 ? [`${part}-${baseParts[index + 1]}`] : []
      );
      return [base, ...chunks, ...commandNames];
    })
  );

  return unique(
    docs
      .filter(doc => needles.some(needle => doc.path.toLowerCase().includes(needle)))
      .map(doc => path.dirname(doc.path).replace(/\\/g, '/'))
  ).sort((left, right) => left.localeCompare(right));
}

function detectLanguages(files: string[]): Array<{ name: string; fileCount: number }> {
  const counts = new Map<string, number>();
  const languageForExt: Record<string, string> = {
    '.cjs': 'JavaScript',
    '.go': 'Go',
    '.html': 'HTML',
    '.js': 'JavaScript',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.mjs': 'JavaScript',
    '.py': 'Python',
    '.rs': 'Rust',
    '.sh': 'Shell',
    '.toml': 'TOML',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.yaml': 'YAML',
    '.yml': 'YAML',
  };

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const language = languageForExt[ext];
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, fileCount]) => ({ name, fileCount }))
    .sort((left, right) => right.fileCount - left.fileCount || left.name.localeCompare(right.name))
    .slice(0, 6);
}

function repoNameFromSignals(
  rootPath: string,
  remoteUrl: string | null,
  docs: DocSource[]
): string {
  const webUrl = deriveWebUrl(remoteUrl);
  if (webUrl) {
    const tail = webUrl.split('/').filter(Boolean).pop();
    if (tail) return tail;
  }

  for (const doc of docs) {
    const heading = doc.text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading) return heading.replace(/`/g, '');
  }

  return path.basename(rootPath);
}

function buildSignals(
  repo: RealityForkLaunchRepoContext,
  scores: RepoSignals,
  axes: RealityForkLaunchAxis[]
): RealityForkLaunchSignal[] {
  const signals: RealityForkLaunchSignal[] = [];

  const push = (
    id: string,
    type: RealityForkLaunchSignal['type'],
    axis: RealityForkLaunchSignal['axis'],
    statement: string,
    detail: string,
    weight: number,
    citations: string[],
    inferred = false
  ) => {
    signals.push({ id, type, axis, statement, detail, weight, citations, inferred });
  };

  if (repo.installCommands.length > 0 || repo.localRunCommands.length > 0) {
    push(
      'doc-commands',
      'supporting',
      'immediacy',
      'Docs expose concrete commands instead of forcing builders to start from source.',
      `Found ${repo.installCommands.length} install commands and ${repo.localRunCommands.length} run commands in the docs.`,
      0.88,
      sample([repo.readmePath, ...repo.docs].filter(Boolean) as string[], 3)
    );
  }

  if (repo.examples.length + repo.fixtures.length > 0) {
    push(
      'local-material',
      'supporting',
      'shareability',
      'The repo already contains local material a builder can touch on the first run.',
      `Found ${repo.examples.length} example paths and ${repo.fixtures.length} fixture paths.`,
      0.81,
      sample([...repo.examples, ...repo.fixtures], 4)
    );
  }

  if (repo.tests.length > 0) {
    push(
      'tests-present',
      'supporting',
      'proof',
      'The repo carries technical proof instead of pure positioning.',
      `Found ${repo.tests.length} test files in the scanned tree.`,
      0.86,
      sample(repo.tests, 4)
    );
  }

  if (repo.ci.length > 0) {
    push(
      'ci-present',
      'supporting',
      'trust',
      'Release discipline is visible from the repo surface.',
      `Found ${repo.ci.length} CI configuration files.`,
      0.73,
      sample(repo.ci, 3)
    );
  }

  if (repo.git.changedFiles.length === 0 && repo.git.commit) {
    push(
      'clean-tree',
      'supporting',
      'trust',
      'The working tree is clean at the time of analysis.',
      `No uncommitted changes were detected on ${repo.git.branch ?? 'the current branch'}.`,
      0.62,
      ['git:status']
    );
  }

  if (repo.licenses.length > 0) {
    push(
      'license-present',
      'supporting',
      'trust',
      'The repo includes an explicit license surface.',
      `Found ${repo.licenses.length} license file${repo.licenses.length === 1 ? '' : 's'}.`,
      0.58,
      sample(repo.licenses, 2)
    );
  }

  if (repo.remoteDependencyNotes.length > 0) {
    push(
      'remote-dependency',
      'risk',
      'immediacy',
      'Advanced flows still depend on a separate API surface.',
      compactText(repo.remoteDependencyNotes[0], 180),
      0.93,
      sample(
        repo.remoteDependencyNotes.map(note => note.split(': ')[0]),
        3
      )
    );
  }

  if (scores.splitRuntimePenalty > 0) {
    push(
      'split-runtime',
      'risk',
      'distribution',
      'The public install path still exposes multi-runtime friction.',
      'The docs mention Cargo install and a Node runtime requirement together.',
      0.89,
      sample(
        repo.runtimeNotes.map(note => note.split(': ')[0]),
        3
      )
    );
  }

  if (repo.git.changedFiles.length > 0) {
    push(
      'dirty-tree',
      'risk',
      'trust',
      'The repo is not launch-clean right now.',
      `${repo.git.changedFiles.length} changed file${repo.git.changedFiles.length === 1 ? '' : 's'} were detected in git status.`,
      0.77,
      ['git:status']
    );
  }

  const shareability = axes.find(axis => axis.id === 'shareability')?.score ?? 0;
  if (shareability < 0.66) {
    push(
      'artifact-gap',
      'risk',
      'shareability',
      'The repo still lacks enough instantly shareable proof objects.',
      'There are not yet enough visible report, screenshot, or public artifact cues in the repo surface.',
      0.84,
      sample([repo.readmePath, ...repo.assets].filter(Boolean) as string[], 3),
      true
    );
  }

  const clarity = axes.find(axis => axis.id === 'clarity')?.score ?? 0;
  if (clarity < 0.68) {
    push(
      'story-gap',
      'risk',
      'clarity',
      'The public story still reads weaker than the underlying engineering.',
      'The docs expose commands and features, but the breakout user outcome is still not obvious enough.',
      0.82,
      sample([repo.readmePath, ...repo.docs].filter(Boolean) as string[], 3),
      true
    );
  }

  const proof = axes.find(axis => axis.id === 'proof')?.score ?? 0;
  if (proof < 0.62) {
    push(
      'proof-gap',
      'risk',
      'proof',
      'The repo still needs more public proof that the product changes decisions.',
      'Tests alone do not create external demand; case studies and concrete caught-failures are still missing.',
      0.78,
      sample(repo.tests, 3),
      true
    );
  }

  return signals.sort(
    (left, right) => right.weight - left.weight || left.id.localeCompare(right.id)
  );
}

function buildActions(axes: RealityForkLaunchAxis[]): string[] {
  const actionsByAxis: Record<RealityForkLaunchAxisId, string> = {
    immediacy:
      'Make one zero-config flow the public front door. If it needs a backend, ship a local mode or a public demo endpoint.',
    clarity:
      'Rewrite the README and launch copy around one user outcome, not the full command inventory.',
    proof: 'Publish three real cases where the product changed a ship or no-ship decision.',
    distribution:
      'Pick one primary install path and demote extra runtime friction to the background.',
    shareability:
      'Emit HTML, Markdown, and JSON artifacts by default and give people a screenshot-worthy report.',
    trust: 'Surface tests, CI, and hard runtime requirements in the first screen of the docs.',
  };

  const weakest = axes
    .slice()
    .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))
    .filter(axis => axis.score < 0.76)
    .map(axis => actionsByAxis[axis.id]);

  if (weakest.length > 0) {
    return unique(weakest).slice(0, 4);
  }

  return [
    'Record a 90-second repo-to-report demo and pin it next to the install command.',
    'Ship a GitHub Action or PR comment flow so the product lands inside existing builder habits.',
    'Collect five external runs and turn the strongest one into a public case study.',
  ];
}

function buildBranches(
  axes: RealityForkLaunchAxis[],
  actions: string[],
  repo: RealityForkLaunchRepoContext
): RealityForkLaunchBranch[] {
  const scores = Object.fromEntries(axes.map(axis => [axis.id, axis.score])) as Record<
    RealityForkLaunchAxisId,
    number
  >;
  const readiness = average(...axes.map(axis => axis.score));
  const strength = average(scores.immediacy, scores.proof, scores.trust);
  const weakestGoToMarket = Math.min(scores.clarity, scores.distribution, scores.shareability);

  const branchScores: Record<RealityForkLaunchBranchId, number> = {
    ship_now: clamp(0.55 * readiness + 0.25 * weakestGoToMarket + 0.2 * strength),
    narrow_launch: clamp(
      0.35 * strength +
        0.25 * scores.immediacy +
        0.2 * scores.clarity +
        0.2 * (1 - weakestGoToMarket)
    ),
    delay_for_proof: clamp(
      0.4 * (1 - average(scores.proof, scores.trust)) +
        0.2 * (1 - scores.distribution) +
        0.2 * (1 - scores.shareability) +
        0.2 * (1 - scores.clarity)
    ),
    park_it: clamp(
      0.55 * (1 - readiness) +
        0.25 * (1 - average(scores.clarity, scores.trust)) +
        0.2 * (1 - scores.proof)
    ),
  };

  const branches: RealityForkLaunchBranch[] = [
    {
      id: 'ship_now',
      label: 'Launch the current product now',
      stance: 'Broad launch',
      score: branchScores.ship_now,
      summary:
        'Launch the full current surface now and learn in public without another major packaging pass.',
      advantages: [
        `Immediacy is already at ${percent(scores.immediacy)}.`,
        `Trust and proof together average ${percent(average(scores.trust, scores.proof))}.`,
        'You get real external signal immediately instead of optimizing in a vacuum.',
      ],
      risks: [
        `The weakest go-to-market axis is still only ${percent(weakestGoToMarket)}.`,
        'You will spend launch energy explaining the product instead of showing one impossible-to-miss use case.',
      ],
      nextMoves: [
        'Lead with the generated report artifact, not the command list.',
        'Record one repo-to-report walkthrough before the announcement thread.',
        'Treat the first five external runs as message refinement, not validation theater.',
      ],
    },
    {
      id: 'narrow_launch',
      label: 'Launch one impossible-to-miss workflow',
      stance: 'Flagship launch',
      score: branchScores.narrow_launch,
      summary:
        'Make one repo-native workflow the product, and demote everything else to supporting machinery.',
      advantages: [
        `Core strength is already ${percent(strength)} across immediacy, proof, and trust.`,
        'You can force the public story to match the strongest technical surface.',
        'The HTML, Markdown, and JSON artifact path becomes the thing people remember and share.',
      ],
      risks: [
        'You have to cut or hide commands that do not reinforce the flagship path.',
        'Breadth will look smaller at launch, even if the product is stronger.',
      ],
      nextMoves: [
        `Make \`reality-fork run launch --repo .\` the front door for ${repo.name}.`,
        'Move secondary commands below the flagship workflow in docs and posts.',
        actions[0] ?? 'Ship one public case study built from a real run artifact.',
      ],
    },
    {
      id: 'delay_for_proof',
      label: 'Delay and harden',
      stance: 'Proof-first',
      score: branchScores.delay_for_proof,
      summary:
        'Hold the broad public launch until the product has stronger external proof, packaging, and trust signals.',
      advantages: [
        'You avoid burning audience attention on a message that still needs another pass.',
        'You buy time to turn strong internals into undeniable public proof.',
      ],
      risks: [
        'Momentum cools off if the hardening phase drifts without a deadline.',
        'The team may hide behind polish work instead of confronting the product wedge.',
      ],
      nextMoves: [
        actions[0] ?? 'Close the weakest public axis first.',
        actions[1] ?? 'Publish a real case study before reopening launch planning.',
        'Set a brutal ship gate: if a builder is not impressed in three minutes, the launch is still early.',
      ],
    },
    {
      id: 'park_it',
      label: 'Park the product',
      stance: 'No launch',
      score: branchScores.park_it,
      summary:
        'Stop spending launch calories until the wedge is sharper and the product earns attention on first contact.',
      advantages: [
        'You avoid a weak public story calcifying around the project.',
        'The team can extract the strongest primitives without pretending they are already a product.',
      ],
      risks: [
        'You lose external learning entirely for this cycle.',
        'The product can become a permanent internal tool if there is no return date.',
      ],
      nextMoves: [
        'Freeze launch work and write down the one future use case worth reviving.',
        'Keep only the primitives that support that wedge.',
        'Reopen launch planning only when the first-run artifact is strong enough to post without apology.',
      ],
    },
  ];

  return branches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return branchOrder(left.id) - branchOrder(right.id);
  });
}

function verdictReason(
  branch: RealityForkLaunchBranch,
  axes: RealityForkLaunchAxis[],
  actions: string[]
): string {
  const strengths = axes
    .slice()
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 2)
    .map(axis => axisLabel(axis.id).toLowerCase());
  const weakest = axes
    .slice()
    .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))
    .slice(0, 2)
    .map(axis => axisLabel(axis.id).toLowerCase());

  switch (branch.id) {
    case 'ship_now':
      return `The weakest outward-facing axis is strong enough to support a broad launch, and the repo already shows real ${strengths.join(
        ' and '
      )}.`;
    case 'narrow_launch':
      return `The core engine is credible, but the strongest external story is still one flagship workflow. ${actions[0] ?? 'Lead with one impossible-to-miss path.'}`;
    case 'delay_for_proof':
      return `The current repo is still too weak on ${weakest.join(
        ' and '
      )} for a broad public push. Shipping now would create more confusion than pull.`;
    case 'park_it':
      return `The wedge is not sharp enough yet. The repo is still weakest on ${weakest.join(
        ' and '
      )}, so launch work would mostly be noise.`;
  }
}

function buildPosts(
  repo: RealityForkLaunchRepoContext,
  branch: RealityForkLaunchBranch,
  verdict: RealityForkLaunchRun['verdict'],
  axes: RealityForkLaunchAxis[]
): RealityForkLaunchPosts {
  const topAxes = axes
    .slice()
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 2)
    .map(axis => `${axisLabel(axis.id)} ${percent(axis.score)}`);
  const weakAxes = axes
    .slice()
    .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))
    .slice(0, 2)
    .map(axis => `${axisLabel(axis.id)} ${percent(axis.score)}`);

  return {
    announcement: trimPost(
      [
        `Reality Fork launch verdict for ${repo.name}: ${branch.label}.`,
        verdict.reason,
        `Top signals: ${topAxes.join(' | ')}.`,
      ].join(' ')
    ),
    thread: [
      trimPost(
        `Reality Fork scored ${repo.name} at ${percent(verdict.readiness)} launch readiness. Verdict: ${branch.label}.`
      ),
      trimPost(`Strongest signals: ${topAxes.join(' | ')}. Weakest: ${weakAxes.join(' | ')}.`),
      trimPost(`Next move: ${branch.nextMoves[0]}`),
    ],
  };
}

function citationLink(repo: RealityForkLaunchRepoContext, citation: string): string | null {
  if (!repo.git.webUrl || !repo.git.commit) return null;
  if (citation.startsWith('git:')) return null;
  return `${repo.git.webUrl}/blob/${repo.git.commit}/${citation}`;
}

function formatMarkdownCitation(repo: RealityForkLaunchRepoContext, citation: string): string {
  const link = citationLink(repo, citation);
  if (!link) return `\`${citation}\``;
  return `[\`${citation}\`](${link})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatHtmlCitation(repo: RealityForkLaunchRepoContext, citation: string): string {
  const link = citationLink(repo, citation);
  if (!link) return `<code>${escapeHtml(citation)}</code>`;
  return `<a href="${escapeHtml(link)}"><code>${escapeHtml(citation)}</code></a>`;
}

function renderDecisionMarkdown(run: RealityForkLaunchRun): string {
  const branch = run.branches[0];
  const scoreboard = run.axes
    .map(axis => `| ${axisLabel(axis.id)} | ${percent(axis.score)} | ${axis.summary} |`)
    .join('\n');

  const branchSections = run.branches
    .map(
      item => `### ${item.label}

Score: ${percent(item.score)}

${item.summary}

Advantages:
- ${item.advantages.join('\n- ')}

Risks:
- ${item.risks.join('\n- ')}

Next moves:
- ${item.nextMoves.join('\n- ')}`
    )
    .join('\n\n');

  const signals = run.signals
    .map(signal => {
      const citations = signal.citations.length
        ? `\nCitations: ${signal.citations.map(citation => formatMarkdownCitation(run.repo, citation)).join(', ')}`
        : '';
      const inference = signal.inferred ? ' (inference)' : '';
      return `- **${signal.type.toUpperCase()} / ${axisLabel(signal.axis)}** ${signal.statement}${inference}\n  ${signal.detail}${citations}`;
    })
    .join('\n');

  return `# ${run.title}

Generated: ${run.generatedAt}

Repo: ${run.repo.name}
Path: \`${run.repo.displayPath}\`
Prompt: ${run.prompt}

## Verdict

**${branch.label}**

${run.verdict.reason}

Launch readiness: ${percent(run.verdict.readiness)}

## Scoreboard

| Axis | Score | Read |
| --- | --- | --- |
${scoreboard}

## Branches Compared

${branchSections}

## Evidence

${signals}

## Next Moves

- ${run.actions.join('\n- ')}

## Ready X Posts

Announcement:

> ${run.posts.announcement}

Thread:

1. ${run.posts.thread[0]}
2. ${run.posts.thread[1]}
3. ${run.posts.thread[2]}
`;
}

function renderReportHtml(run: RealityForkLaunchRun): string {
  const winner = run.branches[0];
  const signals = run.signals
    .map(signal => {
      const citations = signal.citations.length
        ? `<div class="signal-citations">${signal.citations
            .map(citation => formatHtmlCitation(run.repo, citation))
            .join(' ')}</div>`
        : '';
      return `<article class="signal signal-${signal.type}">
  <div class="signal-meta">${escapeHtml(signal.type)} · ${escapeHtml(axisLabel(signal.axis))}${
    signal.inferred ? ' · inference' : ''
  }</div>
  <h3>${escapeHtml(signal.statement)}</h3>
  <p>${escapeHtml(signal.detail)}</p>
  ${citations}
</article>`;
    })
    .join('\n');

  const branches = run.branches
    .map(
      branch => `<article class="branch ${branch.id === winner.id ? 'branch-winner' : ''}">
  <div class="branch-score">${percent(branch.score)}</div>
  <div class="branch-stance">${escapeHtml(branch.stance)}</div>
  <h3>${escapeHtml(branch.label)}</h3>
  <p>${escapeHtml(branch.summary)}</p>
  <div class="branch-columns">
    <section>
      <h4>Advantages</h4>
      <ul>${branch.advantages.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
    <section>
      <h4>Risks</h4>
      <ul>${branch.risks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
  </div>
  <section>
    <h4>Next Moves</h4>
    <ul>${branch.nextMoves.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </section>
</article>`
    )
    .join('\n');

  const axes = run.axes
    .map(
      axis => `<article class="axis-card">
  <div class="axis-header">
    <h3>${escapeHtml(axisLabel(axis.id))}</h3>
    <span>${percent(axis.score)}</span>
  </div>
  <div class="axis-bar"><span style="width: ${Math.round(axis.score * 100)}%"></span></div>
  <p>${escapeHtml(axis.summary)}</p>
</article>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(run.title)}</title>
    <style>
      :root {
        --bg: #f4eee1;
        --bg-alt: #fff8ec;
        --ink: #1d1913;
        --muted: #615649;
        --panel: rgba(255, 251, 242, 0.9);
        --line: rgba(29, 25, 19, 0.12);
        --accent: #ce5a2c;
        --accent-soft: rgba(206, 90, 44, 0.18);
        --good: #185b37;
        --bad: #9b2c2c;
        --shadow: 0 24px 80px rgba(58, 35, 14, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        background:
          radial-gradient(circle at top left, rgba(206, 90, 44, 0.16), transparent 32%),
          radial-gradient(circle at top right, rgba(24, 91, 55, 0.14), transparent 28%),
          linear-gradient(180deg, var(--bg), var(--bg-alt));
        color: var(--ink);
      }

      main {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0 80px;
      }

      .hero,
      .section,
      .posts {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
      }

      .hero {
        padding: 40px;
        overflow: hidden;
        position: relative;
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -120px -120px auto;
        width: 320px;
        height: 320px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(206, 90, 44, 0.14), rgba(24, 91, 55, 0.12));
      }

      .kicker,
      .signal-meta,
      .branch-stance,
      .repo-meta,
      .axis-header span,
      .branch-score,
      .posts code {
        font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
      }

      .kicker {
        display: inline-flex;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 12px;
      }

      h1,
      h2,
      h3,
      h4,
      p {
        margin: 0;
      }

      h1 {
        margin-top: 18px;
        font-size: clamp(2.5rem, 6vw, 4.8rem);
        line-height: 0.94;
        max-width: 11ch;
      }

      .hero-copy {
        max-width: 760px;
      }

      .hero-copy p {
        margin-top: 20px;
        font-size: 1.12rem;
        line-height: 1.65;
        color: var(--muted);
      }

      .hero-grid,
      .axis-grid,
      .branch-grid,
      .signal-grid,
      .posts-grid {
        display: grid;
        gap: 18px;
      }

      .hero-grid {
        grid-template-columns: 1.6fr 1fr;
        margin-top: 32px;
      }

      .hero-stat,
      .axis-card,
      .branch,
      .signal,
      .posts article {
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 22px;
        background: rgba(255, 255, 255, 0.64);
      }

      .hero-stat strong {
        display: block;
        font-size: 2rem;
        margin-top: 6px;
      }

      .hero-stat span,
      .repo-meta {
        color: var(--muted);
      }

      .repo-meta {
        margin-top: 28px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px 18px;
        font-size: 0.9rem;
      }

      .section,
      .posts {
        margin-top: 22px;
        padding: 30px;
      }

      .section h2,
      .posts h2 {
        font-size: 1.75rem;
        margin-bottom: 18px;
      }

      .axis-grid {
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      }

      .axis-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
      }

      .axis-bar {
        height: 10px;
        border-radius: 999px;
        background: rgba(29, 25, 19, 0.08);
        overflow: hidden;
        margin: 14px 0;
      }

      .axis-bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #ce5a2c, #185b37);
      }

      .axis-card p,
      .signal p,
      .branch p,
      .posts p {
        color: var(--muted);
        line-height: 1.6;
      }

      .branch-grid {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .branch {
        position: relative;
      }

      .branch-winner {
        border-color: rgba(206, 90, 44, 0.35);
        background: linear-gradient(180deg, rgba(206, 90, 44, 0.08), rgba(255, 255, 255, 0.72));
      }

      .branch-score {
        color: var(--accent);
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .branch h3 {
        margin-top: 8px;
        font-size: 1.35rem;
      }

      .branch-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        margin-top: 18px;
      }

      .branch section:last-child {
        margin-top: 18px;
      }

      ul {
        margin: 12px 0 0;
        padding-left: 18px;
        color: var(--muted);
        line-height: 1.6;
      }

      .signal-grid {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .signal-supporting {
        border-color: rgba(24, 91, 55, 0.18);
      }

      .signal-risk {
        border-color: rgba(155, 44, 44, 0.18);
      }

      .signal-meta {
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .signal h3 {
        margin: 10px 0 8px;
        font-size: 1.15rem;
      }

      .signal-citations {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }

      a {
        color: inherit;
      }

      code {
        font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
        font-size: 0.9em;
        background: rgba(29, 25, 19, 0.05);
        padding: 3px 6px;
        border-radius: 8px;
      }

      .posts-grid {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .posts article h3 {
        font-size: 1rem;
        margin-bottom: 10px;
      }

      .actions {
        display: grid;
        gap: 12px;
      }

      .actions article {
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }

      @media (max-width: 860px) {
        .hero-grid,
        .branch-columns {
          grid-template-columns: 1fr;
        }

        main {
          width: min(100vw - 24px, 1120px);
          padding-top: 24px;
        }

        .hero,
        .section,
        .posts {
          padding: 22px;
          border-radius: 22px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="kicker">Reality Fork Launch Run</span>
        <div class="hero-copy">
          <h1>${escapeHtml(winner.label)}</h1>
          <p>${escapeHtml(run.verdict.reason)}</p>
          <div class="repo-meta">
            <span>${escapeHtml(run.repo.name)}</span>
            <span>${escapeHtml(run.repo.displayPath)}</span>
            <span>${escapeHtml(run.generatedAt)}</span>
            <span>readiness ${percent(run.verdict.readiness)}</span>
          </div>
        </div>
        <div class="hero-grid">
          <article class="hero-stat">
            <span>Prompt</span>
            <strong>${escapeHtml(run.prompt)}</strong>
          </article>
          <article class="hero-stat">
            <span>Winner score</span>
            <strong>${percent(winner.score)}</strong>
          </article>
        </div>
      </section>

      <section class="section">
        <h2>Scoreboard</h2>
        <div class="axis-grid">
          ${axes}
        </div>
      </section>

      <section class="section">
        <h2>Branches Compared</h2>
        <div class="branch-grid">
          ${branches}
        </div>
      </section>

      <section class="section">
        <h2>Evidence</h2>
        <div class="signal-grid">
          ${signals}
        </div>
      </section>

      <section class="section">
        <h2>Next Moves</h2>
        <div class="actions">
          ${run.actions.map(action => `<article>${escapeHtml(action)}</article>`).join('\n')}
        </div>
      </section>

      <section class="posts">
        <h2>Ready Posts</h2>
        <div class="posts-grid">
          <article>
            <h3>Announcement</h3>
            <p>${escapeHtml(run.posts.announcement)}</p>
          </article>
          <article>
            <h3>Thread</h3>
            <p>1. ${escapeHtml(run.posts.thread[0])}</p>
            <p>2. ${escapeHtml(run.posts.thread[1])}</p>
            <p>3. ${escapeHtml(run.posts.thread[2])}</p>
          </article>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function tracePayload(run: RealityForkLaunchRun): Record<string, unknown> {
  return {
    kind: run.kind,
    version: run.version,
    generatedAt: run.generatedAt,
    title: run.title,
    prompt: run.prompt,
    repo: run.repo,
    axes: run.axes,
    signals: run.signals,
    branches: run.branches,
    verdict: run.verdict,
    actions: run.actions,
    posts: run.posts,
  };
}

async function collectRepoContext(
  rootPath: string,
  requestedFocusPaths: string[] = []
): Promise<RealityForkLaunchRepoContext> {
  const allFiles = await listRepoFiles(rootPath);
  const discoveryDocs = allFiles
    .filter(isDocPath)
    .slice()
    .sort((left, right) => rankDocPath(left) - rankDocPath(right) || left.localeCompare(right))
    .slice(0, Math.max(MAX_DOC_FILES, 80));
  const discoverySources = (
    await Promise.all(
      discoveryDocs.map(async docPath => {
        const text = await readTextIfSmall(rootPath, docPath);
        return text ? ({ path: docPath, text } satisfies DocSource) : null;
      })
    )
  ).filter((value): value is DocSource => Boolean(value));
  const focusPaths =
    requestedFocusPaths.length > 0
      ? unique(
          requestedFocusPaths
            .map(item => path.relative(rootPath, path.resolve(rootPath, item)).replace(/\\/g, '/'))
            .map(item => item.replace(/^\.\/?/, ''))
            .filter(Boolean)
        )
      : findFocusPaths(discoverySources);
  const files =
    focusPaths.length === 0
      ? allFiles
      : allFiles.filter(
          file =>
            isRootSupportPath(file) ||
            focusPaths.some(prefix => file === prefix || file.startsWith(`${prefix}/`))
        );
  const docs = files.filter(isDocPath);
  const tests = files.filter(isTestPath);
  const examples = files.filter(isExamplePath);
  const fixtures = files.filter(isFixturePath);
  const manifests = files.filter(isManifestPath);
  const locks = files.filter(isLockPath);
  const ci = files.filter(isCiPath);
  const envExamples = files.filter(isEnvExamplePath);
  const licenses = files.filter(isLicensePath);
  const assets = files.filter(isAssetPath);

  const docsToRead = docs
    .slice()
    .sort((left, right) => rankDocPath(left) - rankDocPath(right) || left.localeCompare(right))
    .slice(0, MAX_DOC_FILES);
  const docSources = (
    await Promise.all(
      docsToRead.map(async docPath => {
        const text = await readTextIfSmall(rootPath, docPath);
        return text ? ({ path: docPath, text } satisfies DocSource) : null;
      })
    )
  ).filter((value): value is DocSource => Boolean(value));

  const commandSignals = extractCommands(docSources);
  const branch = exec('git', ['-C', rootPath, 'rev-parse', '--abbrev-ref', 'HEAD'], rootPath);
  const commit = exec('git', ['-C', rootPath, 'rev-parse', '--short', 'HEAD'], rootPath);
  const rawRemoteUrl = exec('git', ['-C', rootPath, 'remote', 'get-url', 'origin'], rootPath);
  const webUrl = deriveWebUrl(rawRemoteUrl);
  const recentCommits = (
    exec('git', ['-C', rootPath, 'log', '--pretty=%s', '-n', '6'], rootPath) ?? ''
  )
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const changedFiles = (
    exec('git', ['-C', rootPath, 'status', '--short', '--untracked-files=normal'], rootPath) ?? ''
  )
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const readmePath = docs.find(file => /^README(\.[^.]+)?\.md$/i.test(file)) ?? null;
  const readmeText = readmePath
    ? (docSources.find(source => source.path === readmePath)?.text ?? null)
    : null;

  const name = repoNameFromSignals(rootPath, rawRemoteUrl, docSources);

  return {
    name,
    displayPath: sanitizePath(rootPath),
    fileCount: files.length,
    focusPaths,
    readmePath,
    readmeExcerpt: firstParagraph(readmeText),
    docs,
    tests,
    examples,
    fixtures,
    manifests,
    locks,
    ci,
    envExamples,
    licenses,
    assets,
    installCommands: commandSignals.installCommands,
    localRunCommands: commandSignals.localRunCommands,
    remoteDependencyNotes: commandSignals.remoteDependencyNotes,
    runtimeNotes: commandSignals.runtimeNotes,
    artifactNotes: commandSignals.artifactNotes,
    languages: detectLanguages(files),
    git: {
      branch,
      commit,
      remoteUrl: rawRemoteUrl,
      webUrl,
      changedFiles,
      recentCommits,
    },
  };
}

function deriveRepoScores(repo: RealityForkLaunchRepoContext): RepoSignals {
  const hasReadme = repo.readmePath ? 1 : 0;
  const docsScore = clamp(repo.docs.length / 8);
  const commandDocsScore = clamp((repo.installCommands.length + repo.localRunCommands.length) / 6);
  const installScore =
    repo.installCommands.length > 0
      ? clamp(0.6 + repo.installCommands.length / 8)
      : repo.manifests.length > 0
        ? 0.35
        : 0;
  const localModeScore =
    repo.localRunCommands.some(command => !/^curl\b/i.test(command)) &&
    (repo.fixtures.length > 0 ||
      repo.examples.length > 0 ||
      repo.remoteDependencyNotes.length < repo.localRunCommands.length)
      ? 1
      : repo.fixtures.length > 0 || repo.examples.length > 0
        ? 0.72
        : 0.22;
  const docText = [
    repo.readmeExcerpt ?? '',
    ...repo.artifactNotes,
    ...repo.remoteDependencyNotes,
  ].join(' ');
  const outcomeHits = (
    docText.match(
      /\b(launch|ship|deploy|review|simulate|stress-test|decision|workflow|agent|builder|artifact|report|pr|spec)\b/gi
    ) ?? []
  ).length;
  const artifactTextHits = (
    docText.match(/\b(report|artifact|decision|trace|html|markdown)\b/gi) ?? []
  ).length;
  const exampleScore = clamp((repo.examples.length + repo.fixtures.length) / 6);
  const artifactScore =
    repo.assets.length > 0 || repo.artifactNotes.length > 0
      ? clamp(0.55 + (repo.assets.length + repo.artifactNotes.length) / 8)
      : 0;
  const proofScore = clamp(repo.tests.length / 10);
  const ciScore = repo.ci.length > 0 ? 1 : 0;
  const commitScore = clamp(repo.git.recentCommits.length / 6);
  const manifestScore = clamp(repo.manifests.length / 4);
  const lockScore = clamp(repo.locks.length / 4);
  const changelogScore = repo.docs.some(file => /^CHANGELOG/i.test(path.basename(file))) ? 1 : 0;
  const cleanScore =
    repo.git.branch === null
      ? 0.7
      : repo.git.changedFiles.length === 0
        ? 1
        : clamp(1 - repo.git.changedFiles.length / 28);
  const licenseScore = repo.licenses.length > 0 ? 1 : 0;
  const envScore = repo.envExamples.length > 0 ? 1 : 0;
  const mentionsCargoInstall = repo.installCommands.some(command =>
    /^cargo install\b/i.test(command)
  );
  const mentionsNodeRequirement = repo.runtimeNotes.some(note =>
    /Node\.js|node 20|nodejs/i.test(note)
  );
  const splitRuntimePenalty = mentionsCargoInstall && mentionsNodeRequirement ? 0.24 : 0;
  const externalDependencyPenalty =
    repo.remoteDependencyNotes.length === 0 ? 0 : localModeScore >= 0.7 ? 0.08 : 0.22;

  return {
    hasReadme,
    docsScore,
    commandDocsScore,
    installScore,
    localModeScore,
    outcomeScore: clamp(outcomeHits / 12),
    exampleScore,
    artifactScore: clamp(Math.max(artifactScore, artifactTextHits > 0 ? 0.58 : 0)),
    proofScore,
    ciScore,
    commitScore,
    manifestScore,
    lockScore,
    changelogScore,
    cleanScore,
    licenseScore,
    envScore,
    splitRuntimePenalty,
    externalDependencyPenalty,
  };
}

function buildAxes(
  repo: RealityForkLaunchRepoContext,
  scores: RepoSignals
): RealityForkLaunchAxis[] {
  const immediacy = clamp(
    0.32 * scores.commandDocsScore +
      0.28 * scores.localModeScore +
      0.22 * scores.exampleScore +
      0.18 * scores.hasReadme -
      scores.externalDependencyPenalty
  );

  const clarity = clamp(
    0.34 * scores.hasReadme +
      0.26 * scores.commandDocsScore +
      0.22 * scores.outcomeScore +
      0.18 * scores.docsScore
  );

  const proof = clamp(
    0.4 * scores.proofScore +
      0.25 * scores.ciScore +
      0.2 * scores.exampleScore +
      0.15 * scores.commitScore
  );

  const distribution = clamp(
    0.34 * scores.installScore +
      0.24 * scores.manifestScore +
      0.2 * scores.lockScore +
      0.22 * scores.changelogScore -
      scores.splitRuntimePenalty
  );

  const shareability = clamp(
    0.34 * scores.artifactScore +
      0.24 * scores.exampleScore +
      0.2 * scores.docsScore +
      0.22 * scores.commandDocsScore
  );

  const trust = clamp(
    0.35 * scores.proofScore +
      0.25 * scores.ciScore +
      0.15 * scores.licenseScore +
      0.15 * scores.cleanScore +
      0.1 * scores.envScore
  );

  return [
    {
      id: 'immediacy',
      label: axisLabel('immediacy'),
      score: immediacy,
      summary: summarizeAxis('immediacy', immediacy),
    },
    {
      id: 'clarity',
      label: axisLabel('clarity'),
      score: clarity,
      summary: summarizeAxis('clarity', clarity),
    },
    {
      id: 'proof',
      label: axisLabel('proof'),
      score: proof,
      summary: summarizeAxis('proof', proof),
    },
    {
      id: 'distribution',
      label: axisLabel('distribution'),
      score: distribution,
      summary: summarizeAxis('distribution', distribution),
    },
    {
      id: 'shareability',
      label: axisLabel('shareability'),
      score: shareability,
      summary: summarizeAxis('shareability', shareability),
    },
    {
      id: 'trust',
      label: axisLabel('trust'),
      score: trust,
      summary: summarizeAxis('trust', trust),
    },
  ];
}

export async function createRealityForkLaunchRun(
  input: CreateRealityForkLaunchRunInput
): Promise<RealityForkLaunchRun> {
  const resolvedRepoPath = path.resolve(input.repoPath);
  const repoPath = await fs.realpath(resolvedRepoPath).catch(() => resolvedRepoPath);
  const repo = await collectRepoContext(repoPath, input.focusPaths ?? []);
  const scores = deriveRepoScores(repo);
  const axes = buildAxes(repo, scores);
  const actions = buildActions(axes);
  const branches = buildBranches(axes, actions, repo);
  const winner = branches[0];
  const readiness = average(...axes.map(axis => axis.score));
  const verdict = {
    winnerBranchId: winner.id,
    label: winner.label,
    reason: verdictReason(winner, axes, actions),
    score: winner.score,
    readiness,
  };

  return {
    kind: 'launch',
    version: 1,
    generatedAt: new Date().toISOString(),
    title: input.title?.trim() || `${repo.name} launch reality fork`,
    prompt: input.prompt?.trim() || 'Should we ship this now?',
    repo,
    axes,
    signals: buildSignals(repo, scores, axes),
    branches,
    verdict,
    actions,
    posts: buildPosts(repo, winner, verdict, axes),
  };
}

export function renderRealityForkLaunchDecisionMarkdown(run: RealityForkLaunchRun): string {
  return renderDecisionMarkdown(run);
}

export function renderRealityForkLaunchReportHtml(run: RealityForkLaunchRun): string {
  return renderReportHtml(run);
}

export function defaultRealityForkLaunchOutputDir(
  repoPath: string,
  generatedAt = new Date().toISOString()
): string {
  const stamp = generatedAt.replace(/[:.]/g, '-');
  return path.join(path.resolve(repoPath), '.reality-fork', 'runs', `launch-${stamp}`);
}

export async function writeRealityForkLaunchArtifacts(
  run: RealityForkLaunchRun,
  outputDir: string
): Promise<RealityForkLaunchArtifactPaths> {
  const absoluteOutputDir = path.resolve(outputDir);
  const decisionPath = path.join(absoluteOutputDir, 'decision.md');
  const reportPath = path.join(absoluteOutputDir, 'report.html');
  const tracePath = path.join(absoluteOutputDir, 'trace.json');

  await fs.mkdir(absoluteOutputDir, { recursive: true });
  await fs.writeFile(decisionPath, renderDecisionMarkdown(run), 'utf8');
  await fs.writeFile(reportPath, renderReportHtml(run), 'utf8');
  await fs.writeFile(tracePath, JSON.stringify(tracePayload(run), null, 2), 'utf8');

  return {
    outputDir: absoluteOutputDir,
    decisionPath,
    reportPath,
    tracePath,
  };
}
