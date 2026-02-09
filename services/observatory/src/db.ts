import fs from 'fs';
import path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';

export type Db = DatabaseType;

export function openDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      signature TEXT NOT NULL,
      slot INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      escrow_pda TEXT NOT NULL,
      transaction_id TEXT,
      agent TEXT,
      api TEXT,
      amount TEXT,
      quality_score INTEGER,
      refund_percentage INTEGER,
      refund_amount TEXT,
      raw_json TEXT NOT NULL,
      received_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS events_escrow_pda ON events(escrow_pda);
    CREATE INDEX IF NOT EXISTS events_transaction_id ON events(transaction_id);
    CREATE INDEX IF NOT EXISTS events_signature ON events(signature);
    CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS events_type ON events(type);

    CREATE TABLE IF NOT EXISTS escrows (
      escrow_pda TEXT PRIMARY KEY,
      transaction_id TEXT,
      agent TEXT,
      api TEXT,
      amount TEXT,
      status TEXT NOT NULL,
      created_at INTEGER,
      disputed_at INTEGER,
      resolved_at INTEGER,
      released_at INTEGER,
      quality_score INTEGER,
      refund_percentage INTEGER,
      refund_amount TEXT,
      last_signature TEXT,
      last_slot INTEGER,
      last_ts INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS escrows_transaction_id ON escrows(transaction_id);
    CREATE INDEX IF NOT EXISTS escrows_status ON escrows(status);
    CREATE INDEX IF NOT EXISTS escrows_updated_at ON escrows(updated_at);
  `);
}

