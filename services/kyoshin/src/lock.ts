import fs from 'node:fs';
import path from 'node:path';

type LockPayload = {
  pid: number;
  startedAt: string;
  metadata?: Record<string, unknown>;
};

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPayload(lockPath: string): LockPayload | null {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as LockPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Number.isInteger(parsed.pid)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export class ProcessLock {
  private acquired = false;

  constructor(
    private readonly lockPath: string,
    private readonly metadata?: Record<string, unknown>
  ) {}

  acquire(): void {
    fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
    this.tryAcquire(0);
    this.acquired = true;
  }

  release(): void {
    if (!this.acquired) return;
    this.acquired = false;

    const payload = readLockPayload(this.lockPath);
    if (payload && payload.pid !== process.pid) return;

    try {
      fs.unlinkSync(this.lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private tryAcquire(attempt: number): void {
    const payload: LockPayload = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      metadata: this.metadata,
    };

    try {
      const fd = fs.openSync(this.lockPath, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(payload), { encoding: 'utf8' });
      } finally {
        fs.closeSync(fd);
      }
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }

    const existing = readLockPayload(this.lockPath);
    if (existing && existing.pid === process.pid) return;
    if (existing && isPidAlive(existing.pid)) {
      throw new Error(`lock_held_by_pid_${existing.pid}`);
    }

    try {
      fs.unlinkSync(this.lockPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw err;
    }

    if (attempt >= 1) {
      throw new Error('lock_acquire_failed_after_cleanup');
    }
    this.tryAcquire(attempt + 1);
  }
}
