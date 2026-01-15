import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = `${DATA_DIR}/holder-api.db`;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    wallet TEXT,
    tier TEXT DEFAULT 'free',
    tier_expires_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    started_at INTEGER DEFAULT (unixepoch()),
    ended_at INTEGER,
    message_count INTEGER DEFAULT 0,
    rating INTEGER,
    escrow_tx TEXT,
    escrow_released INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    tx_signature TEXT UNIQUE NOT NULL,
    amount_lamports INTEGER NOT NULL,
    tier TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS escrow_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    session_id TEXT UNIQUE NOT NULL,
    escrow_pda TEXT NOT NULL,
    amount_lamports INTEGER NOT NULL,
    tier TEXT NOT NULL,
    tx_signature TEXT,
    status TEXT DEFAULT 'pending',
    rating INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    released_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS daily_message_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS api_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_tx ON payments(tx_signature);
  CREATE INDEX IF NOT EXISTS idx_escrow_wallet ON escrow_sessions(wallet);
  CREATE INDEX IF NOT EXISTS idx_escrow_session ON escrow_sessions(session_id);
  CREATE INDEX IF NOT EXISTS idx_daily_counts ON daily_message_counts(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_api_conversations_wallet ON api_conversations(wallet);
`);

export interface User {
  id: string;
  platform: string;
  wallet: string | null;
  tier: string;
  tier_expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: number;
  user_id: string;
  started_at: number;
  ended_at: number | null;
  message_count: number;
  rating: number | null;
  escrow_tx: string | null;
  escrow_released: number;
}

export interface EscrowSession {
  id: number;
  user_id: string;
  wallet: string;
  session_id: string;
  escrow_pda: string;
  amount_lamports: number;
  tier: string;
  tx_signature: string | null;
  status: 'pending' | 'active' | 'released' | 'refunded';
  rating: number | null;
  created_at: number;
  released_at: number | null;
}

export function getOrCreateUser(id: string, platform: string): User {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  if (existing) return existing;

  db.prepare('INSERT INTO users (id, platform) VALUES (?, ?)').run(id, platform);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
}

export function updateUserWallet(userId: string, wallet: string): void {
  db.prepare('UPDATE users SET wallet = ?, updated_at = unixepoch() WHERE id = ?').run(wallet, userId);
}

export function updateUserTier(userId: string, tier: string, expiresAt: number): void {
  db.prepare('UPDATE users SET tier = ?, tier_expires_at = ?, updated_at = unixepoch() WHERE id = ?')
    .run(tier, expiresAt, userId);
}

export function getUserTier(userId: string): { tier: string; expired: boolean } {
  const user = db.prepare('SELECT tier, tier_expires_at FROM users WHERE id = ?').get(userId) as User | undefined;
  if (!user) return { tier: 'free', expired: false };

  const now = Math.floor(Date.now() / 1000);
  if (user.tier !== 'free' && user.tier_expires_at && user.tier_expires_at < now) {
    db.prepare('UPDATE users SET tier = ?, tier_expires_at = NULL WHERE id = ?').run('free', userId);
    return { tier: 'free', expired: true };
  }

  return { tier: user.tier, expired: false };
}

export function getConversationHistory(userId: string, limit = 20): Message[] {
  const rows = db.prepare(`
    SELECT role, content FROM conversations
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit) as Message[];

  return rows.reverse();
}

export function addMessage(userId: string, role: 'user' | 'assistant', content: string): void {
  db.prepare('INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)').run(userId, role, content);
}

export function clearConversationHistory(userId: string): void {
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
}

export function getDailyMessageCount(userId: string, date: string): number {
  const row = db.prepare('SELECT count FROM daily_message_counts WHERE user_id = ? AND date = ?')
    .get(userId, date) as { count: number } | undefined;
  return row?.count || 0;
}

export function incrementDailyMessageCount(userId: string, date: string): number {
  db.prepare(`
    INSERT INTO daily_message_counts (user_id, date, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
  `).run(userId, date);

  return getDailyMessageCount(userId, date);
}

export function getApiConversationHistory(wallet: string, limit = 10): Array<{ role: string; content: string }> {
  return db.prepare(`
    SELECT role, content FROM api_conversations
    WHERE wallet = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(wallet, limit).reverse() as Array<{ role: string; content: string }>;
}

export function addApiMessage(wallet: string, role: string, content: string): void {
  db.prepare('INSERT INTO api_conversations (wallet, role, content) VALUES (?, ?, ?)').run(wallet, role, content);
  db.prepare(`
    DELETE FROM api_conversations WHERE wallet = ? AND id NOT IN (
      SELECT id FROM api_conversations WHERE wallet = ? ORDER BY created_at DESC LIMIT 50
    )
  `).run(wallet, wallet);
}

export function clearApiConversationHistory(wallet: string): void {
  db.prepare('DELETE FROM api_conversations WHERE wallet = ?').run(wallet);
}

export default db;
