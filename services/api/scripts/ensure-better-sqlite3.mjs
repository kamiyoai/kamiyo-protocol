import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

async function probe() {
  try {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(':memory:');
    db.pragma('journal_mode = MEMORY');
    db.close();
    return null;
  } catch (error) {
    return error;
  }
}

const firstError = await probe();
if (!firstError) {
  process.exit(0);
}

console.warn(
  '[ensure-better-sqlite3] Native bindings missing, attempting rebuild...'
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '../../..');
const rebuild = spawnSync('pnpm', ['rebuild', 'better-sqlite3'], {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

if (rebuild.status !== 0) {
  console.error('[ensure-better-sqlite3] Rebuild failed.');
  process.exit(rebuild.status ?? 1);
}

const secondError = await probe();
if (!secondError) {
  console.warn('[ensure-better-sqlite3] Rebuild complete.');
  process.exit(0);
}

console.error(
  '[ensure-better-sqlite3] Native binding still unavailable after rebuild.'
);
console.error(secondError instanceof Error ? secondError.message : String(secondError));
process.exit(1);
