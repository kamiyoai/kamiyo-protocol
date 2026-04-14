import fs from 'node:fs';
import type { CliConfig } from './config.js';

export type SessionEntry = {
  timestamp: string;
  profile: string;
  command: string;
  exitStatus: number;
  durationMs: number;
};

export class SessionLogger {
  private readonly enabled: boolean;
  private readonly filePath: string;

  constructor(config: CliConfig, filePath: string) {
    this.enabled = config.sessionLog.enabled;
    this.filePath = filePath;
  }

  append(entry: SessionEntry): void {
    if (!this.enabled) return;
    fs.mkdirSync(requireParent(this.filePath), { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    try {
      fs.chmodSync(this.filePath, 0o600);
    } catch {
      // Ignore chmod failures on filesystems that do not honor POSIX modes.
    }
  }
}

export function readSessionEntries(filePath: string): SessionEntry[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.trimStart().startsWith('[')) {
    return JSON.parse(raw) as SessionEntry[];
  }

  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as SessionEntry);
}

function requireParent(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  if (index === -1) {
    return '.';
  }
  return filePath.slice(0, index);
}
