import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type OutputFormat = 'table' | 'json';
export type HookStage = 'pre' | 'post';

export type Profile = {
  apiUrl: string;
  output?: OutputFormat;
};

export type Workflow = {
  description?: string;
  steps: string[];
};

export type Hook = {
  command: string;
  run: string;
  stage: HookStage;
  required?: boolean;
  enabled?: boolean;
};

export type SessionLogConfig = {
  enabled: boolean;
  path?: string;
};

export type CliConfig = {
  activeProfile: string;
  profiles: Record<string, Profile>;
  workflows: Record<string, Workflow>;
  hooks: Hook[];
  sessionLog: SessionLogConfig;
  aliases: Record<string, string>;
};

export const DEFAULT_PROFILE = 'default';
export const DEFAULT_API_URL = 'http://127.0.0.1:3000';

function configHome(dirOverride?: string): string {
  return dirOverride || process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Ignore chmod failures on filesystems that do not honor POSIX modes.
  }
}

function setPrivateFileMode(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Ignore chmod failures on filesystems that do not honor POSIX modes.
  }
}

function normalizeConfig(input: Partial<CliConfig> | null | undefined): CliConfig {
  const profiles =
    input?.profiles && Object.keys(input.profiles).length > 0
      ? input.profiles
      : { [DEFAULT_PROFILE]: { apiUrl: DEFAULT_API_URL } };
  const activeProfile =
    input?.activeProfile && profiles[input.activeProfile]
      ? input.activeProfile
      : Object.keys(profiles)[0] || DEFAULT_PROFILE;

  return {
    activeProfile,
    profiles,
    workflows: input?.workflows ?? {},
    hooks: Array.isArray(input?.hooks) ? input!.hooks : [],
    sessionLog: {
      enabled: input?.sessionLog?.enabled ?? true,
      path: input?.sessionLog?.path,
    },
    aliases: input?.aliases ?? {},
  };
}

export class ConfigStore {
  private readonly dirPath: string;
  private readonly filePath: string;
  private config: CliConfig;

  private constructor(dirPath: string, filePath: string, config: CliConfig) {
    this.dirPath = dirPath;
    this.filePath = filePath;
    this.config = config;
  }

  static load(dirOverride?: string): ConfigStore {
    const dirPath = path.join(configHome(dirOverride), 'kamiyo', 'reality-fork-cli');
    ensurePrivateDir(dirPath);
    const filePath = path.join(dirPath, 'config.json');
    if (!fs.existsSync(filePath)) {
      return new ConfigStore(dirPath, filePath, normalizeConfig(undefined));
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<CliConfig>;
      return new ConfigStore(dirPath, filePath, normalizeConfig(parsed));
    } catch {
      const backupPath = `${filePath}.broken-${Date.now()}`;
      try {
        fs.renameSync(filePath, backupPath);
      } catch {
        // Ignore backup failures and fall back to a fresh config.
      }
      return new ConfigStore(dirPath, filePath, normalizeConfig(undefined));
    }
  }

  get snapshot(): CliConfig {
    return this.config;
  }

  get configPath(): string {
    return this.filePath;
  }

  get historyPath(): string {
    return path.join(this.dirPath, 'history');
  }

  get sessionLogPath(): string {
    const configured = this.config.sessionLog.path;
    if (configured) {
      ensurePrivateDir(path.dirname(configured));
      return configured;
    }
    return path.join(this.dirPath, 'sessions.jsonl');
  }

  save(): void {
    ensurePrivateDir(this.dirPath);
    fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), 'utf8');
    setPrivateFileMode(this.filePath);
  }

  selectedProfileName(
    requested?: string | null,
    fallback?: string | null,
    allowCreate = false
  ): string {
    const candidate = [requested, fallback, this.config.activeProfile]
      .find(value => typeof value === 'string' && value.trim().length > 0)
      ?.trim();

    if (!candidate) {
      return DEFAULT_PROFILE;
    }

    if (this.config.profiles[candidate]) {
      return candidate;
    }

    if (allowCreate) {
      return candidate;
    }

    throw new Error(`profile '${candidate}' not found`);
  }

  profile(name: string): Profile | undefined {
    return this.config.profiles[name];
  }

  ensureProfile(name: string): Profile {
    if (!this.config.profiles[name]) {
      this.config.profiles[name] = { apiUrl: DEFAULT_API_URL };
    }
    return this.config.profiles[name];
  }

  setActiveProfile(name: string): void {
    if (!this.config.profiles[name]) {
      throw new Error(`profile '${name}' not found`);
    }
    this.config.activeProfile = name;
  }
}
