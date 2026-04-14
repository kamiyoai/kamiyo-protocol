import { spawnSync } from 'node:child_process';
import type { CliConfig, HookStage } from './config.js';
import { warn } from './output.js';

export type HookContext = {
  commandPath: string;
  profile: string;
  apiUrl: string;
  source: string;
};

export function runHooks(
  config: CliConfig,
  stage: HookStage,
  context: HookContext,
  result?: { exitStatus: number; durationMs: number }
): void {
  for (const hook of config.hooks) {
    if (!hook.enabled && hook.enabled !== undefined) continue;
    if (hook.stage !== stage || hook.command !== context.commandPath) continue;

    const shell = process.env.SHELL || '/bin/sh';
    const child = spawnSync(shell, ['-lc', hook.run], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        REALITY_FORK_HOOK_STAGE: stage,
        REALITY_FORK_COMMAND_PATH: context.commandPath,
        REALITY_FORK_PROFILE: context.profile,
        REALITY_FORK_API_URL: context.apiUrl,
        REALITY_FORK_SOURCE: context.source,
        ...(result
          ? {
              REALITY_FORK_EXIT_STATUS: String(result.exitStatus),
              REALITY_FORK_DURATION_MS: String(result.durationMs),
            }
          : {}),
      },
    });

    if (child.status === 0) {
      continue;
    }

    const message = `${stage}-hook failed for '${context.commandPath}': ${hook.run}`;
    if (stage === 'pre' && hook.required) {
      throw new Error(message);
    }
    warn(message);
  }
}
