import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';

const DATA_DIR = './data';
const DB_PATH = `${DATA_DIR}/companion.db`;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

// Initialize schema
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

  CREATE TABLE IF NOT EXISTS processed_tweets (
    tweet_id TEXT PRIMARY KEY,
    processed_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_tx ON payments(tx_signature);
  CREATE INDEX IF NOT EXISTS idx_escrow_wallet ON escrow_sessions(wallet);
  CREATE INDEX IF NOT EXISTS idx_escrow_session ON escrow_sessions(session_id);
  CREATE INDEX IF NOT EXISTS idx_daily_counts ON daily_message_counts(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_processed_tweets_at ON processed_tweets(processed_at);
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

// User operations
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
    // Tier expired, downgrade to free
    db.prepare('UPDATE users SET tier = ?, tier_expires_at = NULL WHERE id = ?').run('free', userId);
    return { tier: 'free', expired: true };
  }

  return { tier: user.tier, expired: false };
}

// Conversation operations
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

// Session operations
export function startSession(userId: string, escrowTx?: string): number {
  const result = db.prepare('INSERT INTO sessions (user_id, escrow_tx) VALUES (?, ?)').run(userId, escrowTx || null);
  return result.lastInsertRowid as number;
}

export function endSession(sessionId: number): void {
  db.prepare('UPDATE sessions SET ended_at = unixepoch() WHERE id = ?').run(sessionId);
}

export function incrementSessionMessages(sessionId: number): void {
  db.prepare('UPDATE sessions SET message_count = message_count + 1 WHERE id = ?').run(sessionId);
}

export function rateSession(sessionId: number, rating: number): void {
  db.prepare('UPDATE sessions SET rating = ? WHERE id = ?').run(rating, sessionId);
}

export function getActiveSession(userId: string): Session | null {
  return db.prepare('SELECT * FROM sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
    .get(userId) as Session | null;
}

export function releaseEscrow(sessionId: number): void {
  db.prepare('UPDATE sessions SET escrow_released = 1 WHERE id = ?').run(sessionId);
}

// Payment operations
export function recordPayment(userId: string, txSignature: string, amountLamports: number, tier: string, durationDays: number): void {
  db.prepare('INSERT INTO payments (user_id, tx_signature, amount_lamports, tier, duration_days) VALUES (?, ?, ?, ?, ?)')
    .run(userId, txSignature, amountLamports, tier, durationDays);
}

export function paymentExists(txSignature: string): boolean {
  const row = db.prepare('SELECT 1 FROM payments WHERE tx_signature = ?').get(txSignature);
  return !!row;
}

// Stats
export function getUserStats(userId: string): { totalSessions: number; avgRating: number | null; totalMessages: number } {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as totalSessions,
      AVG(rating) as avgRating,
      SUM(message_count) as totalMessages
    FROM sessions WHERE user_id = ?
  `).get(userId) as { totalSessions: number; avgRating: number | null; totalMessages: number };

  return stats;
}

// Escrow session operations
export function recordEscrowSession(
  userId: string,
  wallet: string,
  sessionId: string,
  escrowPda: string,
  amountLamports: number,
  tier: string,
  txSignature?: string
): number {
  const result = db.prepare(`
    INSERT INTO escrow_sessions (user_id, wallet, session_id, escrow_pda, amount_lamports, tier, tx_signature, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(userId, wallet, sessionId, escrowPda, amountLamports, tier, txSignature || null);
  return result.lastInsertRowid as number;
}

export function getEscrowSession(sessionId: string): EscrowSession | null {
  return db.prepare('SELECT * FROM escrow_sessions WHERE session_id = ?').get(sessionId) as EscrowSession | null;
}

export function getActiveEscrowByWallet(wallet: string): EscrowSession | null {
  return db.prepare(`
    SELECT * FROM escrow_sessions
    WHERE wallet = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(wallet) as EscrowSession | null;
}

export function getActiveEscrowByUser(userId: string): EscrowSession | null {
  return db.prepare(`
    SELECT * FROM escrow_sessions
    WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(userId) as EscrowSession | null;
}

export function updateEscrowStatus(
  sessionId: string,
  status: 'released' | 'refunded',
  rating?: number
): void {
  db.prepare(`
    UPDATE escrow_sessions
    SET status = ?, rating = ?, released_at = unixepoch()
    WHERE session_id = ?
  `).run(status, rating || null, sessionId);
}

export function getPendingEscrows(olderThanDays: number = 7): EscrowSession[] {
  const cutoff = Math.floor(Date.now() / 1000) - (olderThanDays * 24 * 60 * 60);
  return db.prepare(`
    SELECT * FROM escrow_sessions
    WHERE status = 'active' AND created_at < ?
  `).all(cutoff) as EscrowSession[];
}

// Daily message count operations (persistent)
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

// Cleanup old message counts (call periodically)
export function cleanupOldMessageCounts(daysToKeep: number = 7): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoff = cutoffDate.toISOString().split('T')[0];

  db.prepare('DELETE FROM daily_message_counts WHERE date < ?').run(cutoff);
}

// Processed tweets (deduplication)
export function isProcessed(tweetId: string): boolean {
  const row = db.prepare('SELECT 1 FROM processed_tweets WHERE tweet_id = ?').get(tweetId);
  return !!row;
}

export function markProcessed(tweetId: string): void {
  db.prepare('INSERT OR IGNORE INTO processed_tweets (tweet_id) VALUES (?)').run(tweetId);
}

export function cleanupOldProcessedTweets(daysToKeep: number = 7): void {
  const cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
  db.prepare('DELETE FROM processed_tweets WHERE processed_at < ?').run(cutoff);
}

// Bot state (persist lastSeenId across restarts)
export function getBotState(key: string): string | null {
  const row = db.prepare('SELECT value FROM bot_state WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function setBotState(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)').run(key, value);
}

export default db;
