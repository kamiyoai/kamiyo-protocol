import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { ProcessLock } from './lock.js';

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kyoshin-lock-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempDirAsync<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kyoshin-lock-'));
  try {
    return await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('process lock acquires and releases file lock', () => {
  withTempDir(tmpDir => {
    const lockPath = path.join(tmpDir, 'runtime.lock');
    const lock = new ProcessLock(lockPath, { test: true });
    lock.acquire();
    assert.equal(fs.existsSync(lockPath), true);
    lock.release();
    assert.equal(fs.existsSync(lockPath), false);
  });
});

test('process lock cleans stale lock for dead pid', () => {
  withTempDir(tmpDir => {
    const lockPath = path.join(tmpDir, 'runtime.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 999_999,
        startedAt: new Date().toISOString(),
      })
    );

    const lock = new ProcessLock(lockPath, { test: 'stale-cleanup' });
    lock.acquire();
    assert.equal(fs.existsSync(lockPath), true);
    const payload = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number };
    assert.equal(payload.pid, process.pid);
    lock.release();
  });
});

test('process lock rejects when held by another live pid', async () => {
  await withTempDirAsync(async tmpDir => {
    const lockPath = path.join(tmpDir, 'runtime.lock');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      detached: true,
    });
    if (!child.pid) {
      throw new Error('child_pid_missing');
    }

    try {
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          pid: child.pid,
          startedAt: new Date().toISOString(),
        })
      );

      const lock = new ProcessLock(lockPath);
      assert.throws(() => lock.acquire(), /lock_held_by_pid_/);
    } finally {
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {}
    }
  });
});
