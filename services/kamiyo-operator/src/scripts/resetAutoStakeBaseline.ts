import Database from 'better-sqlite3';
import path from 'node:path';

import { env } from '../config.js';
import { loadOperatorKeypair } from '../wallet.js';

function readFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const pubkeyFlag = readFlag('--pubkey');
  const pubkey = pubkeyFlag ?? loadOperatorKeypair(env).keypair.publicKey.toBase58();
  const key = `auto_stake_baseline:${pubkey}`;

  const dbPath = path.resolve(env.KAMIYO_DB_PATH);
  const db = new Database(dbPath);
  const before = db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  if (!before) {
    console.log(`no baseline row for ${pubkey} (key=${key}, db=${dbPath})`);
    return;
  }
  db.prepare(`DELETE FROM kv WHERE key = ?`).run(key);
  console.log(`deleted baseline row for ${pubkey}: was ${before.value}`);
  console.log('next auto-stake tick will reseed baseline from current wallet balance');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
