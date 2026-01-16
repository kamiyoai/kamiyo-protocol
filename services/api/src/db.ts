import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || './data';
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

  CREATE TABLE IF NOT EXISTS replied_conversations (
    conversation_id TEXT PRIMARY KEY,
    replied_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wallet_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    nonce TEXT NOT NULL,
    message TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    verified INTEGER DEFAULT 0,
    UNIQUE(user_id, wallet)
  );

  CREATE TABLE IF NOT EXISTS api_rate_limits (
    wallet TEXT PRIMARY KEY,
    minute_count INTEGER DEFAULT 0,
    minute_reset_at INTEGER NOT NULL,
    day_count INTEGER DEFAULT 0,
    day_reset_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lookup_rate_limits (
    user_id TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    reset_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mitama_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT,
    commitment TEXT NOT NULL,
    nullifier TEXT NOT NULL,
    proof_a TEXT NOT NULL,
    proof_b TEXT NOT NULL,
    proof_c TEXT NOT NULL,
    signal_type INTEGER NOT NULL,
    direction INTEGER NOT NULL,
    confidence INTEGER NOT NULL,
    magnitude INTEGER NOT NULL,
    stake_amount TEXT NOT NULL,
    revealed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS mitama_proof_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    window_start INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_tx ON payments(tx_signature);
  CREATE INDEX IF NOT EXISTS idx_escrow_wallet ON escrow_sessions(wallet);
  CREATE INDEX IF NOT EXISTS idx_escrow_session ON escrow_sessions(session_id);
  CREATE INDEX IF NOT EXISTS idx_daily_counts ON daily_message_counts(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_processed_tweets_at ON processed_tweets(processed_at);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON api_rate_limits(day_reset_at);
  CREATE INDEX IF NOT EXISTS idx_mitama_signals_tweet ON mitama_signals(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_mitama_signals_commitment ON mitama_signals(commitment);
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

// Atomic payment record - prevents race conditions
// Returns true if payment was recorded, false if it already existed
export function tryRecordPayment(userId: string, txSignature: string, amountLamports: number, tier: string, durationDays: number): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO payments (user_id, tx_signature, amount_lamports, tier, duration_days)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, txSignature, amountLamports, tier, durationDays);

  return result.changes > 0;
}

// Transaction wrapper for atomic operations
export function runTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

// Atomic payment + tier update in a single transaction
// Returns true if successful, false if transaction already processed
export function processPaymentTransaction(
  userId: string,
  txSignature: string,
  amountLamports: number,
  tier: string,
  durationDays: number,
  expiresAt: number
): boolean {
  return db.transaction(() => {
    // Try to record the payment first
    const result = db.prepare(`
      INSERT OR IGNORE INTO payments (user_id, tx_signature, amount_lamports, tier, duration_days)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, txSignature, amountLamports, tier, durationDays);

    if (result.changes === 0) {
      // Transaction already processed
      return false;
    }

    // Update user tier
    db.prepare('UPDATE users SET tier = ?, tier_expires_at = ?, updated_at = unixepoch() WHERE id = ?')
      .run(tier, expiresAt, userId);

    return true;
  })();
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

const VALID_ESCROW_STATUSES = ['pending', 'active', 'released', 'refunded'] as const;
type EscrowStatus = typeof VALID_ESCROW_STATUSES[number];

function isValidEscrowStatus(status: string): status is EscrowStatus {
  return VALID_ESCROW_STATUSES.includes(status as EscrowStatus);
}

export function updateEscrowStatus(
  sessionId: string,
  status: 'released' | 'refunded',
  rating?: number
): void {
  // Validate status to prevent injection
  if (!isValidEscrowStatus(status)) {
    throw new Error(`Invalid escrow status: ${status}`);
  }

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

// Conversation tracking (prevent multiple replies in same thread)
export function hasRepliedToConversation(conversationId: string): boolean {
  const row = db.prepare('SELECT 1 FROM replied_conversations WHERE conversation_id = ?').get(conversationId);
  return !!row;
}

export function markConversationReplied(conversationId: string): void {
  db.prepare('INSERT OR IGNORE INTO replied_conversations (conversation_id) VALUES (?)').run(conversationId);
}

export function cleanupOldConversations(daysToKeep: number = 7): void {
  const cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
  db.prepare('DELETE FROM replied_conversations WHERE replied_at < ?').run(cutoff);
}

// Bot state (persist lastSeenId across restarts)
export function getBotState(key: string): string | null {
  const row = db.prepare('SELECT value FROM bot_state WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function setBotState(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)').run(key, value);
}

// Wallet challenge operations
export interface WalletChallengeRecord {
  id: number;
  user_id: string;
  wallet: string;
  nonce: string;
  message: string;
  expires_at: number;
  created_at: number;
  verified: number;
}

export function storeWalletChallenge(
  userId: string,
  wallet: string,
  nonce: string,
  message: string,
  expiresAt: number
): void {
  // Replace any existing challenge for this user/wallet pair
  db.prepare(`
    INSERT OR REPLACE INTO wallet_challenges (user_id, wallet, nonce, message, expires_at, verified)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(userId, wallet, nonce, message, Math.floor(expiresAt / 1000));
}

export function getWalletChallenge(userId: string, wallet: string): WalletChallengeRecord | null {
  return db.prepare(`
    SELECT * FROM wallet_challenges
    WHERE user_id = ? AND wallet = ? AND verified = 0
  `).get(userId, wallet) as WalletChallengeRecord | null;
}

export function getPendingChallengeForUser(userId: string): WalletChallengeRecord | null {
  return db.prepare(`
    SELECT * FROM wallet_challenges
    WHERE user_id = ? AND verified = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(userId) as WalletChallengeRecord | null;
}

export function markChallengeVerified(userId: string, wallet: string): void {
  db.prepare(`
    UPDATE wallet_challenges
    SET verified = 1
    WHERE user_id = ? AND wallet = ?
  `).run(userId, wallet);
}

export function cleanupExpiredChallenges(): number {
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare('DELETE FROM wallet_challenges WHERE expires_at < ? AND verified = 0').run(now);
  return result.changes;
}

// API Rate Limit operations (persisted)
export interface ApiRateLimitEntry {
  wallet: string;
  minute_count: number;
  minute_reset_at: number;
  day_count: number;
  day_reset_at: number;
}

export function getApiRateLimit(wallet: string): ApiRateLimitEntry | null {
  const now = Date.now();
  const row = db.prepare('SELECT * FROM api_rate_limits WHERE wallet = ?').get(wallet) as ApiRateLimitEntry | undefined;

  if (!row) return null;

  // Reset windows if expired
  let needsUpdate = false;
  if (row.minute_reset_at < now) {
    row.minute_count = 0;
    row.minute_reset_at = now + 60000;
    needsUpdate = true;
  }
  if (row.day_reset_at < now) {
    row.day_count = 0;
    row.day_reset_at = now + 86400000;
    needsUpdate = true;
  }

  if (needsUpdate) {
    db.prepare(`
      UPDATE api_rate_limits
      SET minute_count = ?, minute_reset_at = ?, day_count = ?, day_reset_at = ?
      WHERE wallet = ?
    `).run(row.minute_count, row.minute_reset_at, row.day_count, row.day_reset_at, wallet);
  }

  return row;
}

export function incrementApiRateLimit(wallet: string): ApiRateLimitEntry {
  const now = Date.now();
  const existing = getApiRateLimit(wallet);

  if (existing) {
    existing.minute_count++;
    existing.day_count++;
    db.prepare(`
      UPDATE api_rate_limits
      SET minute_count = ?, day_count = ?
      WHERE wallet = ?
    `).run(existing.minute_count, existing.day_count, wallet);
    return existing;
  }

  // Create new entry
  const entry: ApiRateLimitEntry = {
    wallet,
    minute_count: 1,
    minute_reset_at: now + 60000,
    day_count: 1,
    day_reset_at: now + 86400000,
  };

  db.prepare(`
    INSERT INTO api_rate_limits (wallet, minute_count, minute_reset_at, day_count, day_reset_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(wallet, entry.minute_count, entry.minute_reset_at, entry.day_count, entry.day_reset_at);

  return entry;
}

export function cleanupOldRateLimits(): number {
  const cutoff = Date.now() - 86400000 * 2; // Remove entries older than 2 days
  const result = db.prepare('DELETE FROM api_rate_limits WHERE day_reset_at < ?').run(cutoff);
  // Also clean up lookup rate limits
  db.prepare('DELETE FROM lookup_rate_limits WHERE reset_at < ?').run(cutoff);
  return result.changes;
}

// Lookup rate limiting (per user, 10 lookups per minute)
const LOOKUP_RATE_LIMIT = 10;
const LOOKUP_RATE_WINDOW = 60000; // 1 minute

export function isLookupRateLimited(userId: string): boolean {
  const now = Date.now();
  const row = db.prepare('SELECT count, reset_at FROM lookup_rate_limits WHERE user_id = ?').get(userId) as { count: number; reset_at: number } | undefined;

  if (!row) return false;

  // Reset if window expired
  if (row.reset_at < now) {
    db.prepare('UPDATE lookup_rate_limits SET count = 0, reset_at = ? WHERE user_id = ?').run(now + LOOKUP_RATE_WINDOW, userId);
    return false;
  }

  return row.count >= LOOKUP_RATE_LIMIT;
}

export function incrementLookupCount(userId: string): void {
  const now = Date.now();
  const row = db.prepare('SELECT count, reset_at FROM lookup_rate_limits WHERE user_id = ?').get(userId) as { count: number; reset_at: number } | undefined;

  if (!row) {
    db.prepare('INSERT INTO lookup_rate_limits (user_id, count, reset_at) VALUES (?, 1, ?)').run(userId, now + LOOKUP_RATE_WINDOW);
    return;
  }

  if (row.reset_at < now) {
    // Window expired, reset
    db.prepare('UPDATE lookup_rate_limits SET count = 1, reset_at = ? WHERE user_id = ?').run(now + LOOKUP_RATE_WINDOW, userId);
  } else {
    // Increment count
    db.prepare('UPDATE lookup_rate_limits SET count = count + 1 WHERE user_id = ?').run(userId);
  }
}

// Database shutdown
export function closeDatabase(): void {
  db.close();
}

// Mitama ZK signal storage
export interface MitamaSignal {
  id: number;
  tweet_id: string | null;
  commitment: string;
  nullifier: string;
  proof_a: string;
  proof_b: string;
  proof_c: string;
  signal_type: number;
  direction: number;
  confidence: number;
  magnitude: number;
  stake_amount: string;
  revealed: number;
  created_at: number;
}

export function storeMitamaSignal(
  tweetId: string | null,
  commitment: string,
  nullifier: string,
  proofA: string,
  proofB: string,
  proofC: string,
  signalType: number,
  direction: number,
  confidence: number,
  magnitude: number,
  stakeAmount: string
): number {
  const result = db.prepare(`
    INSERT INTO mitama_signals (tweet_id, commitment, nullifier, proof_a, proof_b, proof_c, signal_type, direction, confidence, magnitude, stake_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tweetId, commitment, nullifier, proofA, proofB, proofC, signalType, direction, confidence, magnitude, stakeAmount);
  return result.lastInsertRowid as number;
}

export function getMitamaSignalByTweet(tweetId: string): MitamaSignal | null {
  return db.prepare('SELECT * FROM mitama_signals WHERE tweet_id = ?').get(tweetId) as MitamaSignal | null;
}

export function getMitamaSignalByCommitment(commitment: string): MitamaSignal | null {
  return db.prepare('SELECT * FROM mitama_signals WHERE commitment = ?').get(commitment) as MitamaSignal | null;
}

export function markMitamaSignalRevealed(id: number): void {
  db.prepare('UPDATE mitama_signals SET revealed = 1 WHERE id = ?').run(id);
}

export function getRecentMitamaSignals(limit = 100): MitamaSignal[] {
  return db.prepare('SELECT * FROM mitama_signals ORDER BY created_at DESC LIMIT ?').all(limit) as MitamaSignal[];
}

export function getMitamaSignals(limit = 10): MitamaSignal[] {
  return db.prepare('SELECT * FROM mitama_signals ORDER BY created_at DESC LIMIT ?').all(limit) as MitamaSignal[];
}

export function getMitamaStats(): {
  total: number;
  long: number;
  short: number;
  neutral: number;
  sentiment: number;
  technical: number;
  onChain: number;
  news: number;
  avgConfidence: number;
  avgMagnitude: number;
  last24h: number;
} {
  const total = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals').get() as { count: number }).count;
  const long = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals WHERE direction = 1').get() as { count: number }).count;
  const short = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals WHERE direction = 0').get() as { count: number }).count;
  const neutral = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals WHERE direction = 2').get() as { count: number }).count;
  const sentiment = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals WHERE signal_type = 0').get() as { count: number }).count;
  const technical = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals WHERE signal_type = 1').get() as { count: number }).count;
  const onChain = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals WHERE signal_type = 2').get() as { count: number }).count;
  const news = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals WHERE signal_type = 3').get() as { count: number }).count;
  const avgs = db.prepare('SELECT AVG(confidence) as avgConf, AVG(magnitude) as avgMag FROM mitama_signals').get() as { avgConf: number | null; avgMag: number | null };
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const last24h = (db.prepare('SELECT COUNT(*) as count FROM mitama_signals WHERE created_at > ?').get(dayAgo) as { count: number }).count;

  return {
    total,
    long,
    short,
    neutral,
    sentiment,
    technical,
    onChain,
    news,
    avgConfidence: Math.round(avgs.avgConf || 0),
    avgMagnitude: Math.round(avgs.avgMag || 0),
    last24h,
  };
}

// Mitama proof generation rate limiting
const PROOF_RATE_LIMIT = 10; // proofs per window
const PROOF_RATE_WINDOW = 60000; // 1 minute

export function isProofRateLimited(key = 'global'): boolean {
  const now = Date.now();
  const row = db.prepare('SELECT count, window_start FROM mitama_proof_rate_limits WHERE key = ?').get(key) as { count: number; window_start: number } | undefined;

  if (!row) return false;

  // Reset if window expired
  if (row.window_start + PROOF_RATE_WINDOW < now) {
    db.prepare('UPDATE mitama_proof_rate_limits SET count = 0, window_start = ? WHERE key = ?').run(now, key);
    return false;
  }

  return row.count >= PROOF_RATE_LIMIT;
}

export function incrementProofCount(key = 'global'): void {
  const now = Date.now();
  const row = db.prepare('SELECT count, window_start FROM mitama_proof_rate_limits WHERE key = ?').get(key) as { count: number; window_start: number } | undefined;

  if (!row) {
    db.prepare('INSERT INTO mitama_proof_rate_limits (key, count, window_start) VALUES (?, 1, ?)').run(key, now);
    return;
  }

  if (row.window_start + PROOF_RATE_WINDOW < now) {
    // Window expired, reset
    db.prepare('UPDATE mitama_proof_rate_limits SET count = 1, window_start = ? WHERE key = ?').run(now, key);
  } else {
    // Increment count
    db.prepare('UPDATE mitama_proof_rate_limits SET count = count + 1 WHERE key = ?').run(key);
  }
}

export default db;
