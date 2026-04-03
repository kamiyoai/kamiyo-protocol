#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  createRealityForkLaunchRun,
  createRealityForkStudioClient,
  defaultRealityForkLaunchOutputDir,
  diffLaunchRuns,
  fixtureDirectory,
  listFixtureScenarios,
  loadFixtureScenario,
  renderDiffHtml,
  renderDiffMarkdown,
  writeRealityForkLaunchArtifacts,
  type CreateRealityForkProjectInput,
  type RealityForkLaunchArtifactPaths,
  type RealityForkLaunchRun,
  type RealityForkProjectDetail,
  type RealityForkProjectEvent,
  type RealityForkProjectRecord,
  type RealityForkProjectSimulation,
} from '@kamiyo/reality-fork';
import chalk from 'chalk';
import { Command, CommanderError, Option } from 'commander';
import { parseArgsStringToArgv } from 'string-argv';
import {
  ConfigStore,
  DEFAULT_API_URL,
  DEFAULT_PROFILE,
  type OutputFormat,
  type Workflow,
} from './config.js';
import { runHooks } from './hooks.js';
import { banner, debug, dim, error, info, print, setQuiet, setVerbose, success } from './output.js';
import { readSessionEntries, SessionLogger } from './sessions.js';

type GlobalOptions = {
  output?: OutputFormat;
  apiUrl?: string;
  profile?: string;
  quiet?: boolean;
  verbose?: boolean;
};

type InvocationSource = 'cli' | 'shell' | 'workflow' | 'session-replay';

type InvocationDefaults = {
  profile?: string;
  apiUrl?: string;
  output?: OutputFormat;
  quiet?: boolean;
  verbose?: boolean;
};

type EffectiveInvocation = {
  profile: string;
  apiUrl: string;
  output: OutputFormat;
  quiet: boolean;
  verbose: boolean;
  source: InvocationSource;
};

type RunState = {
  store: ConfigStore;
  source: InvocationSource;
  defaults: InvocationDefaults;
  rawInput?: string;
  logSession?: boolean;
};

type CommandContext = {
  store: ConfigStore;
  effective: EffectiveInvocation;
  commandPath: string;
  rawInput?: string;
  runNested(argv: string[], options: Partial<RunState>): Promise<void>;
};

function rootProgramName(): string {
  return 'reality-fork';
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function shellQuote(value: string): string {
  if (!value) return "''";
  if ([...value].every(ch => /[A-Za-z0-9_.:/-]/.test(ch))) {
    return value;
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function rawInputFromArgv(argv: string[]): string {
  return argv.map(shellQuote).join(' ');
}

export function tokenizeLine(line: string, aliases: Record<string, string> = {}): string[] {
  const parts = parseArgsStringToArgv(line);
  if (parts.length === 0) {
    return [];
  }
  const alias = aliases[parts[0]];
  if (!alias) {
    return parts;
  }
  return [...parseArgsStringToArgv(alias), ...parts.slice(1)];
}

export function renderWorkflowStep(
  step: string,
  args: string[],
  effective: Pick<EffectiveInvocation, 'profile' | 'apiUrl'>
): string {
  let rendered = step.replaceAll('{{profile}}', shellQuote(effective.profile));
  rendered = rendered.replaceAll('{{api_url}}', shellQuote(effective.apiUrl));
  rendered = rendered.replaceAll('{{args}}', args.map(arg => shellQuote(arg)).join(' '));

  for (let index = 0; index < 32; index += 1) {
    rendered = rendered.replaceAll(`{{${index + 1}}}`, args[index] ? shellQuote(args[index]) : '');
  }

  return rendered;
}

function canCreateProfile(commandPath: string): boolean {
  return new Set(['setup', 'config set-url', 'config set-output']).has(commandPath);
}

export function resolveEffectiveInvocation(
  store: ConfigStore,
  options: GlobalOptions,
  defaults: InvocationDefaults,
  source: InvocationSource,
  commandPath: string
): EffectiveInvocation {
  const profileName = store.selectedProfileName(
    options.profile,
    defaults.profile,
    canCreateProfile(commandPath)
  );
  const profile = store.profile(profileName) ?? store.ensureProfile(profileName);

  return {
    profile: profileName,
    apiUrl: trimSlashes(options.apiUrl || defaults.apiUrl || profile.apiUrl || DEFAULT_API_URL),
    output: options.output || defaults.output || profile.output || 'table',
    quiet: Boolean(options.quiet || defaults.quiet),
    verbose: Boolean(options.verbose || defaults.verbose),
    source,
  };
}

function buildProjectTableRows(projects: RealityForkProjectRecord[]) {
  return projects.map(project => ({
    id: project.id,
    title: project.title,
    status: project.status,
    evidence: project.stats.evidenceCount,
    simulations: project.stats.simulationCount,
    updatedAt: new Date(project.updatedAt).toISOString(),
  }));
}

function buildFixtureTableRows(items: Awaited<ReturnType<typeof listFixtureScenarios>>) {
  return items.map((item: Awaited<ReturnType<typeof listFixtureScenarios>>[number]) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    winner: item.winnerLabel ?? '—',
    source: item.sourceLabel,
  }));
}

function printProjectSummary(project: RealityForkProjectDetail): void {
  info(chalk.bold(project.title));
  dim(`${project.id} | ${project.status} | ${project.slug}`);
  info(`prompt: ${project.prompt}`);
  if (project.description) {
    info(`description: ${project.description}`);
  }
  info(
    `evidence ${project.stats.evidenceCount}, simulations ${project.stats.simulationCount}, claims ${project.stats.claimCount}`
  );
  if (project.decision?.winnerLabel) {
    info(`winner: ${project.decision.winnerLabel}`);
  }
  if (project.report?.headline) {
    info(`headline: ${project.report.headline}`);
  }
}

function latestSimulation(project: RealityForkProjectDetail): RealityForkProjectSimulation | null {
  return project.simulations[0] ?? null;
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.md':
      return 'text/markdown';
    case '.txt':
      return 'text/plain';
    case '.html':
      return 'text/html';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function createClient(apiUrl: string) {
  return createRealityForkStudioClient({ baseUrl: trimSlashes(apiUrl) });
}

async function promptText(question: string, initial?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = initial ? ` [${initial}]` : '';
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || initial || '';
  } finally {
    rl.close();
  }
}

async function setupProfile(
  store: ConfigStore,
  requestedProfile?: string,
  requestedUrl?: string
): Promise<void> {
  const profileName =
    requestedProfile?.trim() ||
    (await promptText('Profile name', store.snapshot.activeProfile || DEFAULT_PROFILE));
  const profile = store.ensureProfile(profileName);
  const apiUrl =
    requestedUrl?.trim() || (await promptText('API base URL', profile.apiUrl || DEFAULT_API_URL));
  const output = await promptText('Default output (table/json)', profile.output || 'table');

  profile.apiUrl = trimSlashes(apiUrl || DEFAULT_API_URL);
  profile.output = output === 'json' ? 'json' : 'table';
  store.setActiveProfile(profileName);
  store.save();

  success(`profile '${profileName}' saved`);
}

async function healthCheck(url: string): Promise<{ status: string; details: string }> {
  try {
    const response = await fetch(`${trimSlashes(url)}/health`);
    if (!response.ok) {
      return { status: 'warn', details: `health returned ${response.status}` };
    }
    return { status: 'ok', details: 'service health reachable' };
  } catch (cause) {
    return {
      status: 'error',
      details: cause instanceof Error ? cause.message : 'health probe failed',
    };
  }
}

async function routeCheck(url: string): Promise<{ status: string; details: string }> {
  try {
    const response = await fetch(`${trimSlashes(url)}/api/reality-fork`);
    if (!response.ok) {
      return { status: 'warn', details: `route returned ${response.status}` };
    }
    return { status: 'ok', details: 'Reality Fork API reachable' };
  } catch (cause) {
    return {
      status: 'error',
      details: cause instanceof Error ? cause.message : 'route probe failed',
    };
  }
}

async function fixtureCheck(): Promise<{ status: string; details: string }> {
  try {
    const items = await listFixtureScenarios();
    return {
      status: 'ok',
      details: `${items.length} fixtures in ${fixtureDirectory()}`,
    };
  } catch (cause) {
    return {
      status: 'error',
      details: cause instanceof Error ? cause.message : 'fixture scan failed',
    };
  }
}

function sessionLogCheck(store: ConfigStore): { status: string; details: string } {
  const filePath = store.sessionLogPath;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '', 'utf8');
    }
    return { status: 'ok', details: filePath };
  } catch (cause) {
    return {
      status: 'error',
      details: cause instanceof Error ? cause.message : 'session log unavailable',
    };
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function displayPathFromCwd(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  if (!relative || relative.startsWith('..')) {
    return filePath;
  }
  return relative;
}

function printLaunchRunJson(
  run: RealityForkLaunchRun,
  artifacts: RealityForkLaunchArtifactPaths
): void {
  print(
    {
      verdict: run.verdict,
      topAxes: run.axes
        .slice()
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
        .slice(0, 3),
      actions: run.actions,
      posts: run.posts,
      artifacts,
    },
    'json'
  );
}

function axisBar(score: number, width = 20): string {
  const filled = Math.round(score * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

function axisColor(score: number): (text: string) => string {
  if (score >= 0.7) return chalk.cyan;
  if (score >= 0.5) return chalk.white;
  return chalk.magenta;
}

function verdictColor(branchId: string): (text: string) => string {
  if (branchId === 'ship_now') return chalk.cyan;
  if (branchId === 'narrow_launch') return chalk.white;
  return chalk.magenta;
}

async function renderLaunchProgress(
  run: RealityForkLaunchRun,
  artifacts: RealityForkLaunchArtifactPaths
): Promise<void> {
  const w = process.stderr.write.bind(process.stderr);

  w(`\n  ${chalk.dim('reality fork')} ${chalk.magenta('\u5206\u5c90\u73fe\u754c')}\n\n`);
  w(`  ${chalk.dim('repo')}  ${chalk.white(run.repo.name)}\n`);
  w(`  ${chalk.dim('files')} ${run.repo.fileCount}`);
  if (run.repo.languages.length > 0) {
    w(
      ` ${chalk.dim('\u00b7')} ${run.repo.languages
        .slice(0, 3)
        .map(l => l.name)
        .join(', ')}`
    );
  }
  if (run.repo.frameworks.length > 0) {
    w(` ${chalk.dim('\u00b7')} ${chalk.cyan(run.repo.frameworks.join(', '))}`);
  }
  w('\n\n');

  const padLen = Math.max(...run.axes.map(a => a.label.length));
  for (const axis of run.axes) {
    const label = axis.label.padEnd(padLen);
    const color = axisColor(axis.score);
    const bar = color(axisBar(axis.score));
    const pct = color(formatPercent(axis.score).padStart(4));
    w(`  ${chalk.dim(label)}  ${bar}  ${pct}\n`);
    await sleep(60);
  }

  w('\n');
  const vColor = verdictColor(run.verdict.winnerBranchId);
  w(`  ${vColor(run.verdict.label)}\n`);
  w(`  ${chalk.dim(run.verdict.reason)}\n`);
  w(`  ${chalk.dim('readiness')} ${chalk.cyan(formatPercent(run.verdict.readiness))}\n`);

  w(`\n  ${chalk.dim('artifacts')}\n`);
  w(`  ${chalk.dim('decision')} ${displayPathFromCwd(artifacts.decisionPath)}\n`);
  w(`  ${chalk.dim('report')}   ${displayPathFromCwd(artifacts.reportPath)}\n`);
  w(`  ${chalk.dim('trace')}    ${displayPathFromCwd(artifacts.tracePath)}\n\n`);
}

function openInBrowser(filePath: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    execFileSync(cmd, [filePath], { stdio: 'ignore' });
  } catch {
    // browser open is best-effort
  }
}

async function waitForJob(projectId: string, jobId: string, effective: EffectiveInvocation) {
  const client = createClient(effective.apiUrl);
  let lastStage = '';
  for (;;) {
    const job = await client.getJob(projectId, jobId);
    if (job.currentStage !== lastStage && effective.output === 'table') {
      dim(`${job.id} ${job.status}/${job.currentStage} (${job.progress}%)`);
      lastStage = job.currentStage;
    }
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    await sleep(1500);
  }
}

function workflowSampleArgs(workflow: Workflow): string[] {
  const maxIndex = workflow.steps.reduce((max, step) => {
    for (let index = 1; index <= 32; index += 1) {
      if (step.includes(`{{${index}}}`)) {
        max = Math.max(max, index);
      }
    }
    return max;
  }, 0);

  return Array.from({ length: maxIndex }, (_, index) => `arg${index + 1}`);
}

async function runCli(argv: string[], state: RunState): Promise<void> {
  const program = buildProgram(state);
  program.exitOverride();
  program.showHelpAfterError(false);

  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (cause) {
    if (cause instanceof CommanderError) {
      if (cause.code === 'commander.helpDisplayed' || cause.code === 'commander.version') {
        return;
      }
      throw new Error(cause.message);
    }
    throw cause;
  }
}

function wrapAction(
  state: RunState,
  commandPath: string,
  handler: (context: CommandContext, params: unknown[], command: Command) => Promise<void>
) {
  return async (...params: unknown[]) => {
    const command = params.at(-1) as Command;
    const args = params.slice(0, -1);

    if (state.source !== 'cli' && commandPath === 'shell') {
      throw new Error('already in shell mode');
    }
    if (state.source === 'workflow' && commandPath === 'workflow run') {
      throw new Error('workflow nesting is not supported');
    }
    if (state.source === 'session-replay' && commandPath === 'session replay') {
      throw new Error('session replay cannot replay another session');
    }

    const effective = resolveEffectiveInvocation(
      state.store,
      command.optsWithGlobals() as GlobalOptions,
      state.defaults,
      state.source,
      commandPath
    );
    setQuiet(effective.quiet);
    setVerbose(effective.verbose);

    const context: CommandContext = {
      store: state.store,
      effective,
      commandPath,
      rawInput: state.rawInput,
      runNested: (argv, options) =>
        runCli(argv, {
          store: state.store,
          source: options.source ?? state.source,
          defaults: options.defaults ?? {
            profile: effective.profile,
            apiUrl: effective.apiUrl,
            output: effective.output,
            quiet: effective.quiet,
            verbose: effective.verbose,
          },
          rawInput: options.rawInput,
          logSession: options.logSession,
        }),
    };

    const hookContext = {
      commandPath,
      profile: effective.profile,
      apiUrl: effective.apiUrl,
      source: effective.source,
    };

    runHooks(state.store.snapshot, 'pre', hookContext);
    const startedAt = Date.now();
    let exitStatus = 0;

    try {
      await handler(context, args, command);
    } catch (cause) {
      exitStatus = 1;
      throw cause;
    } finally {
      runHooks(state.store.snapshot, 'post', hookContext, {
        exitStatus,
        durationMs: Date.now() - startedAt,
      });

      if (state.logSession !== false && state.rawInput && !commandPath.startsWith('session ')) {
        new SessionLogger(state.store.snapshot, state.store.sessionLogPath).append({
          timestamp: new Date().toISOString(),
          profile: effective.profile,
          command: state.rawInput,
          exitStatus,
          durationMs: Date.now() - startedAt,
        });
      }
    }
  };
}

function buildProgram(state: RunState): Command {
  const program = new Command();
  const jsonOption = new Option('--output <format>', 'Output format').choices(['table', 'json']);

  program
    .name(rootProgramName())
    .description('Repo-aware CLI for launch stress tests, fixtures, and remote project operations')
    .option('--api-url <url>', 'Reality Fork API base URL')
    .option('--profile <name>', 'Profile name')
    .addOption(jsonOption)
    .option('--quiet', 'Suppress non-essential output')
    .option('--verbose', 'Show debug output');

  program
    .command('setup')
    .description('Configure a local profile')
    .action(
      wrapAction(state, 'setup', async ({ store, effective }) => {
        await setupProfile(store, effective.profile, effective.apiUrl);
      })
    );

  program
    .command('doctor')
    .description('Check profile, API reachability, fixtures, and session log health')
    .action(
      wrapAction(state, 'doctor', async ({ store, effective }) => {
        const checks = await Promise.all([
          Promise.resolve({
            name: 'profile',
            status: 'ok',
            details: `profile '${effective.profile}' selected`,
          }),
          healthCheck(effective.apiUrl).then(result => ({ name: 'health', ...result })),
          routeCheck(effective.apiUrl).then(result => ({ name: 'route', ...result })),
          fixtureCheck().then(result => ({ name: 'fixtures', ...result })),
          Promise.resolve({ name: 'session_log', ...sessionLogCheck(store) }),
        ]);

        print(checks, effective.output);
      })
    );

  const profile = program.command('profile').description('Manage named profiles');
  profile
    .command('list')
    .description('List profiles')
    .action(
      wrapAction(state, 'profile list', async ({ store, effective }) => {
        const rows = Object.entries(store.snapshot.profiles).map(([name, item]) => ({
          name,
          active: name === store.snapshot.activeProfile ? 'yes' : '',
          apiUrl: item.apiUrl,
          output: item.output ?? 'table',
        }));
        print(rows, effective.output);
      })
    );

  profile
    .command('show')
    .argument('[name]', 'Profile name')
    .description('Show one profile')
    .action(
      wrapAction(state, 'profile show', async ({ store, effective }, [name]) => {
        const selected = store.selectedProfileName(
          typeof name === 'string' ? name : undefined,
          effective.profile
        );
        const item = store.profile(selected);
        if (!item) {
          throw new Error(`profile '${selected}' not found`);
        }
        print(
          {
            name: selected,
            active: selected === store.snapshot.activeProfile,
            apiUrl: item.apiUrl,
            output: item.output ?? 'table',
          },
          effective.output
        );
      })
    );

  profile
    .command('use')
    .argument('<name>', 'Profile name')
    .description('Set the active profile')
    .action(
      wrapAction(state, 'profile use', async ({ store }, [name]) => {
        if (typeof name !== 'string') {
          throw new Error('profile name is required');
        }
        store.setActiveProfile(name);
        store.save();
        success(`active profile set to '${name}'`);
      })
    );

  const config = program.command('config').description('Inspect and update CLI config');
  config
    .command('show')
    .description('Print the current config')
    .action(
      wrapAction(state, 'config show', async ({ store, effective }) => {
        print(store.snapshot, effective.output);
      })
    );

  config
    .command('path')
    .description('Show the config path')
    .action(
      wrapAction(state, 'config path', async ({ store, effective }) => {
        print({ configPath: store.configPath }, effective.output);
      })
    );

  config
    .command('set-url')
    .argument('<url>', 'API base URL')
    .description('Set the API URL on a profile')
    .action(
      wrapAction(state, 'config set-url', async ({ store, effective }, [url]) => {
        if (typeof url !== 'string' || !url.trim()) {
          throw new Error('url is required');
        }
        const profile = store.ensureProfile(effective.profile);
        profile.apiUrl = trimSlashes(url);
        store.save();
        success(`profile '${effective.profile}' API URL updated`);
      })
    );

  config
    .command('set-output')
    .argument('<format>', 'table or json')
    .description('Set the default output mode on a profile')
    .action(
      wrapAction(state, 'config set-output', async ({ store, effective }, [value]) => {
        if (value !== 'table' && value !== 'json') {
          throw new Error("format must be 'table' or 'json'");
        }
        const profile = store.ensureProfile(effective.profile);
        profile.output = value;
        store.save();
        success(`profile '${effective.profile}' output updated`);
      })
    );

  const run = program.command('run').description('Run local repo-aware Reality Fork workflows');
  run
    .command('launch')
    .option('--repo <path>', 'Repository path', '.')
    .option('--focus <path...>', 'Limit analysis to specific subpaths inside the repo')
    .option('--prompt <text>', 'Launch question', 'Should we ship this now?')
    .option('--title <text>', 'Report title')
    .option('--output-dir <path>', 'Directory for decision.md, report.html, and trace.json')
    .option('--open', 'Open report.html in default browser after run')
    .description('Stress-test a repo launch and emit shareable artifacts')
    .action(
      wrapAction(state, 'run launch', async ({ effective }, [options]) => {
        const launchOptions = (options ?? {}) as {
          repo?: string;
          focus?: string[];
          prompt?: string;
          title?: string;
          outputDir?: string;
          open?: boolean;
        };
        const repoPath = path.resolve(launchOptions.repo || '.');
        const runResult = await createRealityForkLaunchRun({
          repoPath,
          focusPaths: Array.isArray(launchOptions.focus) ? launchOptions.focus : undefined,
          prompt: launchOptions.prompt,
          title: launchOptions.title,
        });
        const outputDir = launchOptions.outputDir
          ? path.resolve(launchOptions.outputDir)
          : defaultRealityForkLaunchOutputDir(repoPath, runResult.generatedAt);
        const artifacts = await writeRealityForkLaunchArtifacts(runResult, outputDir);

        if (effective.output === 'json') {
          printLaunchRunJson(runResult, artifacts);
        } else if (!effective.quiet) {
          await renderLaunchProgress(runResult, artifacts);
        }

        if (launchOptions.open) {
          openInBrowser(artifacts.reportPath);
        }
      })
    );

  run
    .command('diff')
    .argument('<before>', 'Path to first trace.json or output directory')
    .argument('<after>', 'Path to second trace.json or output directory')
    .option('--output-dir <path>', 'Write diff.md and diff.html to this directory')
    .description('Compare two launch runs and show score deltas')
    .action(
      wrapAction(state, 'run diff', async ({ effective }, [beforeArg, afterArg, options]) => {
        const diffOptions = (options ?? {}) as { outputDir?: string };

        function resolveTrace(arg: unknown): string {
          const p = path.resolve(String(arg));
          if (p.endsWith('.json')) return p;
          return path.join(p, 'trace.json');
        }

        const beforePath = resolveTrace(beforeArg);
        const afterPath = resolveTrace(afterArg);
        const beforeRun = JSON.parse(fs.readFileSync(beforePath, 'utf8')) as RealityForkLaunchRun;
        const afterRun = JSON.parse(fs.readFileSync(afterPath, 'utf8')) as RealityForkLaunchRun;
        const diff = diffLaunchRuns(beforeRun, afterRun);

        if (effective.output === 'json') {
          print(diff, 'json');
        } else if (!effective.quiet) {
          const w = process.stderr.write.bind(process.stderr);
          w(`\n  ${chalk.dim('reality fork')} ${chalk.magenta('\u5206\u5c90\u73fe\u754c')}\n\n`);
          w(
            `  ${chalk.dim(diff.before.generatedAt)} \u2192 ${chalk.dim(diff.after.generatedAt)}\n\n`
          );

          const rColor =
            diff.readinessDelta > 0.005
              ? chalk.cyan
              : diff.readinessDelta < -0.005
                ? chalk.magenta
                : chalk.dim;
          const rSign = diff.readinessDelta > 0 ? '+' : '';
          w(
            `  ${chalk.dim('readiness')} ${formatPercent(diff.before.readiness)} \u2192 ${formatPercent(diff.after.readiness)} ${rColor(`${rSign}${Math.round(diff.readinessDelta * 100)}%`)}\n`
          );

          if (diff.verdictChanged) {
            w(
              `  ${chalk.dim('verdict')}   ${diff.before.verdictLabel} \u2192 ${chalk.cyan(diff.after.verdictLabel)}\n`
            );
          }
          w('\n');

          const padLen = Math.max(...diff.axes.map(a => a.label.length));
          for (const axis of diff.axes) {
            const label = axis.label.padEnd(padLen);
            const dSign = axis.delta > 0 ? '+' : '';
            const dText = `${dSign}${Math.round(axis.delta * 100)}%`;
            const indicator =
              axis.direction === 'up'
                ? chalk.cyan(`\u25b2 ${dText}`)
                : axis.direction === 'down'
                  ? chalk.magenta(`\u25bc ${dText}`)
                  : chalk.dim(`\u2500 ${dText}`);
            w(
              `  ${chalk.dim(label)}  ${formatPercent(axis.before).padStart(4)} \u2192 ${formatPercent(axis.after).padStart(4)}  ${indicator}\n`
            );
          }
          w('\n');
        }

        if (diffOptions.outputDir) {
          const outDir = path.resolve(diffOptions.outputDir);
          const { promises: fsp } = await import('node:fs');
          await fsp.mkdir(outDir, { recursive: true });
          await fsp.writeFile(path.join(outDir, 'diff.md'), renderDiffMarkdown(diff), 'utf8');
          await fsp.writeFile(path.join(outDir, 'diff.html'), renderDiffHtml(diff), 'utf8');
          if (!effective.quiet && effective.output !== 'json') {
            info(`diff artifacts written to ${displayPathFromCwd(outDir)}`);
          }
        }
      })
    );

  run
    .command('watch')
    .option('--repo <path>', 'Repository path', '.')
    .option('--focus <path...>', 'Limit analysis to specific subpaths inside the repo')
    .option('--prompt <text>', 'Launch question', 'Should we ship this now?')
    .option('--title <text>', 'Report title')
    .option('--output-dir <path>', 'Directory for artifacts')
    .option('--open', 'Open report.html after each run')
    .description('Watch a repo and re-run launch analysis on file changes')
    .action(
      wrapAction(state, 'run watch', async ({ effective }, [options]) => {
        const watchOptions = (options ?? {}) as {
          repo?: string;
          focus?: string[];
          prompt?: string;
          title?: string;
          outputDir?: string;
          open?: boolean;
        };
        const repoPath = path.resolve(watchOptions.repo || '.');
        const { watch } = await import('node:fs');

        let running = false;
        let queued = false;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        async function runOnce() {
          if (running) {
            queued = true;
            return;
          }
          running = true;
          process.stderr.write('\x1b[2J\x1b[H');
          try {
            const runResult = await createRealityForkLaunchRun({
              repoPath,
              focusPaths: Array.isArray(watchOptions.focus) ? watchOptions.focus : undefined,
              prompt: watchOptions.prompt,
              title: watchOptions.title,
            });
            const outputDir = watchOptions.outputDir
              ? path.resolve(watchOptions.outputDir)
              : defaultRealityForkLaunchOutputDir(repoPath, runResult.generatedAt);
            const artifacts = await writeRealityForkLaunchArtifacts(runResult, outputDir);

            if (effective.output === 'json') {
              printLaunchRunJson(runResult, artifacts);
            } else {
              await renderLaunchProgress(runResult, artifacts);
            }

            if (watchOptions.open) openInBrowser(artifacts.reportPath);
          } catch (err) {
            error(err instanceof Error ? err.message : 'run failed');
          }
          running = false;
          process.stderr.write(chalk.dim('  watching for changes...\n'));
          if (queued) {
            queued = false;
            runOnce();
          }
        }

        const ignoreDirs = new Set(['.git', '.reality-fork', 'node_modules', 'dist', 'target']);

        watch(repoPath, { recursive: true }, (_event, filename) => {
          if (!filename) return;
          const first = filename.split(path.sep)[0];
          if (ignoreDirs.has(first)) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(runOnce, 500);
        });

        await runOnce();

        await new Promise<void>(resolve => {
          process.on('SIGINT', () => {
            resolve();
          });
        });
      })
    );

  run
    .command('share')
    .option('--output-dir <path>', 'Directory containing run artifacts')
    .option('--repo <path>', 'Repository path (used to find latest run)', '.')
    .description('Share the latest launch run as a GitHub gist')
    .action(
      wrapAction(state, 'run share', async ({ effective }, [options]) => {
        const shareOptions = (options ?? {}) as { outputDir?: string; repo?: string };
        const { promises: fsp } = await import('node:fs');

        let outputDir: string;
        if (shareOptions.outputDir) {
          outputDir = path.resolve(shareOptions.outputDir);
        } else {
          const repoPath = path.resolve(shareOptions.repo || '.');
          const runsDir = path.join(repoPath, '.reality-fork', 'runs');
          let entries: string[];
          try {
            entries = (await fsp.readdir(runsDir))
              .filter(e => e.startsWith('launch-'))
              .sort()
              .reverse();
          } catch {
            throw new Error(`no runs found in ${runsDir}`);
          }
          if (entries.length === 0) throw new Error(`no launch runs found in ${runsDir}`);
          outputDir = path.join(runsDir, entries[0]);
        }

        const decisionPath = path.join(outputDir, 'decision.md');
        const tracePath = path.join(outputDir, 'trace.json');

        for (const f of [decisionPath, tracePath]) {
          try {
            await fsp.access(f);
          } catch {
            throw new Error(`missing artifact: ${f}`);
          }
        }

        try {
          const result = execFileSync(
            'gh',
            [
              'gist',
              'create',
              '--public',
              '--desc',
              'Reality Fork launch run',
              decisionPath,
              tracePath,
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
          ).trim();

          if (effective.output === 'json') {
            print({ gistUrl: result, outputDir }, 'json');
          } else {
            success(`gist created: ${result}`);
          }
        } catch {
          const decision = await fsp.readFile(decisionPath, 'utf8');
          try {
            const pbcopy =
              process.platform === 'darwin'
                ? 'pbcopy'
                : process.platform === 'win32'
                  ? 'clip'
                  : 'xclip';
            const { execSync } = await import('node:child_process');
            execSync(pbcopy, { input: decision, stdio: ['pipe', 'ignore', 'ignore'] });
            success('decision.md copied to clipboard (install gh cli to create gists)');
          } catch {
            error('gh cli not found and clipboard copy failed. install gh: https://cli.github.com');
          }
        }
      })
    );

  const fixtures = program.command('fixtures').description('Browse bundled Reality Fork fixtures');
  fixtures
    .command('list')
    .description('List fixture scenarios')
    .action(
      wrapAction(state, 'fixtures list', async ({ effective }) => {
        const items = await listFixtureScenarios();
        print(effective.output === 'json' ? items : buildFixtureTableRows(items), effective.output);
      })
    );

  fixtures
    .command('show')
    .argument('<id>', 'Fixture id or slug')
    .description('Show one fixture scenario')
    .action(
      wrapAction(state, 'fixtures show', async ({ effective }, [id]) => {
        if (typeof id !== 'string') {
          throw new Error('fixture id is required');
        }
        const scenario = await loadFixtureScenario(id);
        if (effective.output === 'json') {
          print(scenario, effective.output);
          return;
        }

        info(chalk.bold(scenario.title));
        dim(`${scenario.id} | ${scenario.status} | ${scenario.sourceLabel}`);
        info(scenario.summary);
        info(`winner: ${scenario.decision.winnerLabel ?? '—'}`);
        info(
          `branches: ${scenario.branches.length} | replay events: ${scenario.replay.events.length}`
        );
      })
    );

  fixtures
    .command('replay')
    .argument('<id>', 'Fixture id or slug')
    .description('Print the replay timeline for a fixture')
    .action(
      wrapAction(state, 'fixtures replay', async ({ effective }, [id]) => {
        if (typeof id !== 'string') {
          throw new Error('fixture id is required');
        }
        const scenario = await loadFixtureScenario(id);
        print(
          effective.output === 'json'
            ? scenario.replay.events
            : scenario.replay.events.map((event: (typeof scenario.replay.events)[number]) => ({
                phase: event.phase,
                title: event.title,
                branch: event.branchLabel ?? '—',
                tone: event.tone,
              })),
          effective.output
        );
      })
    );

  const uploads = program
    .command('uploads')
    .description('Upload local files to a remote Reality Fork API');
  uploads
    .command('add')
    .argument('<paths...>', 'File paths')
    .description('Upload files and return upload ids')
    .action(
      wrapAction(state, 'uploads add', async ({ effective }, [pathsArg]) => {
        const paths = Array.isArray(pathsArg) ? pathsArg : [];
        if (paths.length === 0) {
          throw new Error('at least one file path is required');
        }
        const formData = new FormData();
        for (const filePath of paths) {
          const absolutePath = path.resolve(String(filePath));
          const bytes = fs.readFileSync(absolutePath);
          formData.append(
            'files',
            new Blob([bytes], { type: guessMimeType(absolutePath) }),
            path.basename(absolutePath)
          );
        }
        const result = await createClient(effective.apiUrl).createUploads(formData);
        print(result.uploads, effective.output);
      })
    );

  const projects = program
    .command('projects')
    .description('Operate on remote Reality Fork projects');
  projects
    .command('list')
    .description('List projects from the configured API')
    .action(
      wrapAction(state, 'projects list', async ({ effective }) => {
        const result = await createClient(effective.apiUrl).listProjects();
        print(
          effective.output === 'json' ? result.projects : buildProjectTableRows(result.projects),
          effective.output
        );
      })
    );

  projects
    .command('get')
    .argument('<projectId>', 'Project id')
    .description('Fetch project detail')
    .action(
      wrapAction(state, 'projects get', async ({ effective }, [projectId]) => {
        if (typeof projectId !== 'string') {
          throw new Error('project id is required');
        }
        const project = await createClient(effective.apiUrl).getProject(projectId);
        if (effective.output === 'json') {
          print(project, effective.output);
          return;
        }
        printProjectSummary(project);
        const top = latestSimulation(project);
        if (top) {
          info(`top simulation: ${top.title} (${top.probability}% / impact ${top.impactScore})`);
        }
      })
    );

  projects
    .command('create')
    .description('Create a new project on a remote Reality Fork API')
    .requiredOption('--prompt <prompt>', 'Prompt or claim to evaluate')
    .option('--title <title>', 'Project title')
    .option('--description <text>', 'Project description')
    .option(
      '--tag <tag>',
      'Attach a tag',
      (value, acc: string[]) => {
        acc.push(value);
        return acc;
      },
      []
    )
    .option(
      '--url <url>',
      'Attach a URL source',
      (value, acc: string[]) => {
        acc.push(value);
        return acc;
      },
      []
    )
    .option(
      '--file <path>',
      'Upload a local file',
      (value, acc: string[]) => {
        acc.push(value);
        return acc;
      },
      []
    )
    .option('--text <text>', 'Attach pasted text')
    .option('--decision-mode <mode>', 'score_only, score_then_truth_court, truth_court_required')
    .option('--wait', 'Poll the initial job until it finishes')
    .action(
      wrapAction(state, 'projects create', async ({ effective }, [options]) => {
        const commandOptions = options as {
          prompt: string;
          title?: string;
          description?: string;
          tag: string[];
          url: string[];
          file: string[];
          text?: string;
          decisionMode?: CreateRealityForkProjectInput['decisionMode'];
          wait?: boolean;
        };
        const client = createClient(effective.apiUrl);
        let uploadIds: string[] | undefined;

        if (commandOptions.file.length > 0) {
          const formData = new FormData();
          for (const filePath of commandOptions.file) {
            const absolutePath = path.resolve(filePath);
            formData.append(
              'files',
              new Blob([fs.readFileSync(absolutePath)], { type: guessMimeType(absolutePath) }),
              path.basename(absolutePath)
            );
          }
          const uploadResponse = await client.createUploads(formData);
          uploadIds = uploadResponse.uploads.map(
            (item: (typeof uploadResponse.uploads)[number]) => item.id
          );
        }

        const body: CreateRealityForkProjectInput = {
          title: commandOptions.title,
          prompt: commandOptions.prompt,
          description: commandOptions.description,
          tags: commandOptions.tag.length > 0 ? commandOptions.tag : undefined,
          uploadIds,
          pastedText: commandOptions.text,
          urls: commandOptions.url.length > 0 ? commandOptions.url : undefined,
          decisionMode: commandOptions.decisionMode,
        };
        const created = await client.createProject(body);

        if (commandOptions.wait) {
          const finalJob = await waitForJob(created.id, created.initialJob.id, effective);
          print(
            effective.output === 'json'
              ? { project: created, job: finalJob }
              : {
                  projectId: created.id,
                  status: finalJob.status,
                  stage: finalJob.currentStage,
                  progress: finalJob.progress,
                },
            effective.output
          );
          return;
        }

        print(
          effective.output === 'json'
            ? created
            : {
                id: created.id,
                title: created.title,
                status: created.status,
                initialJobId: created.initialJob.id,
                initialJobStage: created.initialJob.currentStage,
              },
          effective.output
        );
      })
    );

  projects
    .command('publish')
    .argument('<projectId>', 'Project id')
    .option('--wait', 'Poll the publish job until it finishes')
    .description('Queue a publish job')
    .action(
      wrapAction(state, 'projects publish', async ({ effective }, [projectId, options]) => {
        if (typeof projectId !== 'string') {
          throw new Error('project id is required');
        }
        const job = await createClient(effective.apiUrl).publish(projectId);
        if ((options as { wait?: boolean }).wait) {
          const finalJob = await waitForJob(projectId, job.id, effective);
          print(finalJob, effective.output);
          return;
        }
        print(job, effective.output);
      })
    );

  projects
    .command('retry')
    .argument('<projectId>', 'Project id')
    .option('--wait', 'Poll the retry job until it finishes')
    .description('Queue a full rerun')
    .action(
      wrapAction(state, 'projects retry', async ({ effective }, [projectId, options]) => {
        if (typeof projectId !== 'string') {
          throw new Error('project id is required');
        }
        const job = await createClient(effective.apiUrl).retry(projectId);
        if ((options as { wait?: boolean }).wait) {
          const finalJob = await waitForJob(projectId, job.id, effective);
          print(finalJob, effective.output);
          return;
        }
        print(job, effective.output);
      })
    );

  projects
    .command('watch')
    .argument('<projectId>', 'Project id')
    .description('Stream project events until the server closes the stream')
    .action(
      wrapAction(state, 'projects watch', async ({ effective }, [projectId]) => {
        if (typeof projectId !== 'string') {
          throw new Error('project id is required');
        }
        const events: RealityForkProjectEvent[] = [];
        for await (const event of createClient(effective.apiUrl).streamProject(projectId)) {
          events.push(event);
          if (effective.output === 'json') {
            process.stdout.write(`${JSON.stringify(event)}\n`);
          } else {
            info(`${new Date(event.createdAt).toISOString()} ${event.eventType}`);
          }
        }
        if (effective.output === 'table') {
          dim(`stream closed after ${events.length} events`);
        }
      })
    );

  const workflow = program.command('workflow').description('Run local declarative workflows');
  workflow
    .command('list')
    .description('List configured workflows')
    .action(
      wrapAction(state, 'workflow list', async ({ store, effective }) => {
        const rows = Object.entries(store.snapshot.workflows).map(([name, item]) => ({
          name,
          steps: item.steps.length,
          description: item.description ?? '—',
        }));
        print(rows, effective.output);
      })
    );

  workflow
    .command('validate')
    .argument('[name]', 'Workflow name')
    .description('Validate one workflow or all workflows')
    .action(
      wrapAction(state, 'workflow validate', async ({ store, effective }, [name]) => {
        const entries =
          typeof name === 'string'
            ? ([[name, store.snapshot.workflows[name]]] as const)
            : Object.entries(store.snapshot.workflows);
        if (entries.length === 0) {
          throw new Error('no workflows configured');
        }

        const results = entries.map(([workflowName, workflowDef]) => {
          if (!workflowDef) {
            throw new Error(`workflow '${workflowName}' not found`);
          }
          const rendered = workflowDef.steps.map(step =>
            renderWorkflowStep(step, workflowSampleArgs(workflowDef), effective)
          );
          for (const step of rendered) {
            const tokens = tokenizeLine(step, store.snapshot.aliases);
            if (tokens[0] === 'workflow' && tokens[1] === 'run') {
              throw new Error(`workflow '${workflowName}' contains nested workflow execution`);
            }
          }
          return { name: workflowName, status: 'valid', steps: rendered };
        });

        print(results, effective.output);
      })
    );

  workflow
    .command('run')
    .argument('<name>', 'Workflow name')
    .argument('[args...]', 'Workflow args')
    .option('--dry-run', 'Render steps without executing them')
    .description('Render and execute a workflow')
    .action(
      wrapAction(
        state,
        'workflow run',
        async ({ store, effective, runNested }, [name, workflowArgs, options]) => {
          if (typeof name !== 'string') {
            throw new Error('workflow name is required');
          }
          const workflowDef = store.snapshot.workflows[name];
          if (!workflowDef) {
            throw new Error(`workflow '${name}' not found`);
          }
          const args = Array.isArray(workflowArgs) ? workflowArgs.map(String) : [];
          const rendered = workflowDef.steps.map(step => renderWorkflowStep(step, args, effective));

          if ((options as { dryRun?: boolean }).dryRun) {
            print(
              rendered.map((step, index) => ({ step: index + 1, command: step })),
              effective.output
            );
            return;
          }

          for (const step of rendered) {
            dim(`workflow ${name}: ${step}`);
            await runNested(tokenizeLine(step, store.snapshot.aliases), {
              source: 'workflow',
              rawInput: step,
            });
          }
        }
      )
    );

  const session = program.command('session').description('Export and replay shell sessions');
  session
    .command('export')
    .argument('[file]', 'Session log path')
    .option('--limit <count>', 'Limit number of entries', value => parseInt(value, 10))
    .description('Print the session log')
    .action(
      wrapAction(state, 'session export', async ({ store, effective }, [filePath, options]) => {
        const entries = readSessionEntries(
          typeof filePath === 'string' && filePath.trim() ? filePath : store.sessionLogPath
        );
        const limit = Number.isFinite((options as { limit?: number }).limit)
          ? Math.max(0, (options as { limit?: number }).limit || 0)
          : undefined;
        const selected = limit ? entries.slice(-limit) : entries;
        print(selected, effective.output);
      })
    );

  session
    .command('replay')
    .argument('[file]', 'Session log path')
    .option('--execute', 'Re-run commands instead of printing them')
    .option('--limit <count>', 'Limit number of entries', value => parseInt(value, 10))
    .description('Replay a recorded session')
    .action(
      wrapAction(
        state,
        'session replay',
        async ({ store, effective, runNested }, [filePath, options]) => {
          const entries = readSessionEntries(
            typeof filePath === 'string' && filePath.trim() ? filePath : store.sessionLogPath
          );
          const limit = Number.isFinite((options as { limit?: number }).limit)
            ? Math.max(0, (options as { limit?: number }).limit || 0)
            : undefined;
          const selected = limit ? entries.slice(-limit) : entries;

          if (!(options as { execute?: boolean }).execute) {
            print(
              selected.map(entry => ({
                timestamp: entry.timestamp,
                profile: entry.profile,
                command: entry.command,
              })),
              effective.output
            );
            return;
          }

          for (const entry of selected) {
            dim(`replay: ${entry.command}`);
            await runNested(tokenizeLine(entry.command, store.snapshot.aliases), {
              source: 'session-replay',
              rawInput: entry.command,
              defaults: {
                profile: entry.profile,
                apiUrl: effective.apiUrl,
                output: effective.output,
                quiet: effective.quiet,
                verbose: effective.verbose,
              },
            });
          }
        }
      )
    );

  program
    .command('shell')
    .description('Start the interactive shell')
    .action(
      wrapAction(state, 'shell', async ({ store, effective, runNested }) => {
        banner();
        dim('interactive shell');
        dim("type 'help' for command help, 'exit' to quit");

        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: true,
          historySize: 200,
          removeHistoryDuplicates: true,
        });

        const historyPath = store.historyPath;
        const existingHistory = fs.existsSync(historyPath)
          ? fs.readFileSync(historyPath, 'utf8').split('\n').filter(Boolean)
          : [];
        const internal = rl as unknown as { history?: string[] };
        internal.history = [...existingHistory].reverse();
        const appendedHistory: string[] = [];

        try {
          for (;;) {
            const line = (await rl.question(`${rootProgramName()}(${effective.profile})> `)).trim();
            if (!line) continue;
            if (line === 'exit' || line === 'quit') break;

            appendedHistory.push(line);

            if (line === 'help' || line === '?') {
              program.outputHelp();
              continue;
            }
            if (line.startsWith('help ') || line.startsWith('? ')) {
              const query = line.replace(/^(help|\?)\s+/, '');
              await runNested([...tokenizeLine(query, store.snapshot.aliases), '--help'], {
                source: 'shell',
                rawInput: undefined,
                logSession: false,
              });
              continue;
            }

            try {
              await runNested(tokenizeLine(line, store.snapshot.aliases), {
                source: 'shell',
                rawInput: line,
              });
            } catch (cause) {
              error(cause instanceof Error ? cause.message : String(cause));
            }
          }
        } finally {
          rl.close();
          const nextHistory = [...existingHistory, ...appendedHistory].slice(-500);
          fs.mkdirSync(path.dirname(historyPath), { recursive: true, mode: 0o700 });
          fs.writeFileSync(
            historyPath,
            nextHistory.join('\n') + (nextHistory.length > 0 ? '\n' : ''),
            'utf8'
          );
        }
      })
    );

  return program;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const store = ConfigStore.load();
  await runCli(argv, {
    store,
    source: 'cli',
    defaults: {},
    rawInput: rawInputFromArgv(argv),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(cause => {
    debug(cause instanceof Error ? cause.stack || cause.message : String(cause));
    error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
