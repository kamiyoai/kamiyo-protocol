import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';

// schema migrations ported from mn-core sqlite wrapper (internal)
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = `${DATA_DIR}/companion.db`;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better crash recovery and concurrency
db.pragma('journal_mode = WAL');
// Enable foreign key enforcement (off by default in SQLite)
db.pragma('foreign_keys = ON');
// Performance optimizations
db.pragma('synchronous = NORMAL'); // Safe with WAL mode
db.pragma('cache_size = -64000'); // 64MB cache
db.pragma('temp_store = MEMORY');

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

  CREATE TABLE IF NOT EXISTS swarmteams_signals (
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

  CREATE TABLE IF NOT EXISTS swarmteams_proof_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    window_start INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_tx ON payments(tx_signature);
  CREATE INDEX IF NOT EXISTS idx_escrow_wallet ON escrow_sessions(wallet);
  CREATE INDEX IF NOT EXISTS idx_escrow_session ON escrow_sessions(session_id);
  CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_sessions(status);
  CREATE INDEX IF NOT EXISTS idx_escrow_status_created ON escrow_sessions(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_daily_counts ON daily_message_counts(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_processed_tweets_at ON processed_tweets(processed_at);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON api_rate_limits(day_reset_at);
  CREATE INDEX IF NOT EXISTS idx_swarmteams_signals_tweet ON swarmteams_signals(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_swarmteams_signals_commitment ON swarmteams_signals(commitment);

  CREATE TABLE IF NOT EXISTS pending_tips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    sender_wallet TEXT NOT NULL,
    recipient_username TEXT NOT NULL,
    recipient_id TEXT,
    amount_lamports INTEGER NOT NULL,
    token TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    tx_signature TEXT,
    tweet_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    claimed_at INTEGER,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tip_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    amount_lamports INTEGER NOT NULL,
    token TEXT NOT NULL,
    tx_signature TEXT NOT NULL,
    tweet_id TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_pending_tips_recipient ON pending_tips(recipient_username);
  CREATE INDEX IF NOT EXISTS idx_pending_tips_sender ON pending_tips(sender_id);
  CREATE INDEX IF NOT EXISTS idx_pending_tips_status ON pending_tips(status);
  CREATE INDEX IF NOT EXISTS idx_pending_tips_status_expires ON pending_tips(status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_tip_history_sender ON tip_history(sender_id);
  CREATE INDEX IF NOT EXISTS idx_tip_history_recipient ON tip_history(recipient_id);

  CREATE TABLE IF NOT EXISTS credits (
    wallet TEXT PRIMARY KEY,
    balance_micro INTEGER DEFAULT 0,
    total_deposited_micro INTEGER DEFAULT 0,
    total_spent_micro INTEGER DEFAULT 0,
    last_deposit_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS credit_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    tx_signature TEXT UNIQUE NOT NULL,
    kamiyo_amount TEXT NOT NULL,
    credit_amount_micro INTEGER NOT NULL,
    rate_used TEXT NOT NULL,
    status TEXT DEFAULT 'confirmed',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS credit_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    amount_micro INTEGER NOT NULL,
    description TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_credit_deposits_wallet ON credit_deposits(wallet);
  CREATE INDEX IF NOT EXISTS idx_credit_deposits_tx ON credit_deposits(tx_signature);
  CREATE INDEX IF NOT EXISTS idx_credit_usage_wallet ON credit_usage(wallet);
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
  db.prepare('UPDATE users SET wallet = ?, updated_at = unixepoch() WHERE id = ?').run(
    wallet,
    userId
  );
}

export function updateUserTier(userId: string, tier: string, expiresAt: number): void {
  db.prepare(
    'UPDATE users SET tier = ?, tier_expires_at = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(tier, expiresAt, userId);
}

export function getUserTier(userId: string): { tier: string; expired: boolean } {
  const user = db.prepare('SELECT tier, tier_expires_at FROM users WHERE id = ?').get(userId) as
    | User
    | undefined;
  if (!user) return { tier: 'free', expired: false };

  const now = Math.floor(Date.now() / 1000);
  if (user.tier !== 'free' && user.tier_expires_at && user.tier_expires_at < now) {
    // Tier expired, downgrade to free
    db.prepare('UPDATE users SET tier = ?, tier_expires_at = NULL WHERE id = ?').run(
      'free',
      userId
    );
    return { tier: 'free', expired: true };
  }

  return { tier: user.tier, expired: false };
}

// Conversation operations
export function getConversationHistory(userId: string, limit = 20): Message[] {
  const rows = db
    .prepare(
      `
    SELECT role, content FROM conversations
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(userId, limit) as Message[];

  return rows.reverse();
}

export function addMessage(userId: string, role: 'user' | 'assistant', content: string): void {
  db.prepare('INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)').run(
    userId,
    role,
    content
  );
}

export function clearConversationHistory(userId: string): void {
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
}

// Session operations
export function startSession(userId: string, escrowTx?: string): number {
  const result = db
    .prepare('INSERT INTO sessions (user_id, escrow_tx) VALUES (?, ?)')
    .run(userId, escrowTx || null);
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
  return db
    .prepare(
      'SELECT * FROM sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(userId) as Session | null;
}

export function releaseEscrow(sessionId: number): void {
  db.prepare('UPDATE sessions SET escrow_released = 1 WHERE id = ?').run(sessionId);
}

// Payment operations
export function recordPayment(
  userId: string,
  txSignature: string,
  amountLamports: number,
  tier: string,
  durationDays: number
): void {
  db.prepare(
    'INSERT INTO payments (user_id, tx_signature, amount_lamports, tier, duration_days) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, txSignature, amountLamports, tier, durationDays);
}

export function paymentExists(txSignature: string): boolean {
  const row = db.prepare('SELECT 1 FROM payments WHERE tx_signature = ?').get(txSignature);
  return !!row;
}

// Atomic payment record - prevents race conditions
// Returns true if payment was recorded, false if it already existed
export function tryRecordPayment(
  userId: string,
  txSignature: string,
  amountLamports: number,
  tier: string,
  durationDays: number
): boolean {
  const result = db
    .prepare(
      `
    INSERT OR IGNORE INTO payments (user_id, tx_signature, amount_lamports, tier, duration_days)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .run(userId, txSignature, amountLamports, tier, durationDays);

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
    const result = db
      .prepare(
        `
      INSERT OR IGNORE INTO payments (user_id, tx_signature, amount_lamports, tier, duration_days)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(userId, txSignature, amountLamports, tier, durationDays);

    if (result.changes === 0) {
      // Transaction already processed
      return false;
    }

    // Update user tier
    db.prepare(
      'UPDATE users SET tier = ?, tier_expires_at = ?, updated_at = unixepoch() WHERE id = ?'
    ).run(tier, expiresAt, userId);

    return true;
  })();
}

// Stats
export function getUserStats(userId: string): {
  totalSessions: number;
  avgRating: number | null;
  totalMessages: number;
} {
  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) as totalSessions,
      AVG(rating) as avgRating,
      SUM(message_count) as totalMessages
    FROM sessions WHERE user_id = ?
  `
    )
    .get(userId) as { totalSessions: number; avgRating: number | null; totalMessages: number };

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
  const result = db
    .prepare(
      `
    INSERT INTO escrow_sessions (user_id, wallet, session_id, escrow_pda, amount_lamports, tier, tx_signature, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `
    )
    .run(userId, wallet, sessionId, escrowPda, amountLamports, tier, txSignature || null);
  return result.lastInsertRowid as number;
}

export function getEscrowSession(sessionId: string): EscrowSession | null {
  return db
    .prepare('SELECT * FROM escrow_sessions WHERE session_id = ?')
    .get(sessionId) as EscrowSession | null;
}

export function getActiveEscrowByWallet(wallet: string): EscrowSession | null {
  return db
    .prepare(
      `
    SELECT * FROM escrow_sessions
    WHERE wallet = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `
    )
    .get(wallet) as EscrowSession | null;
}

export function getActiveEscrowByUser(userId: string): EscrowSession | null {
  return db
    .prepare(
      `
    SELECT * FROM escrow_sessions
    WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `
    )
    .get(userId) as EscrowSession | null;
}

const VALID_ESCROW_STATUSES = ['pending', 'active', 'released', 'refunded'] as const;
type EscrowStatus = (typeof VALID_ESCROW_STATUSES)[number];

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

  db.prepare(
    `
    UPDATE escrow_sessions
    SET status = ?, rating = ?, released_at = unixepoch()
    WHERE session_id = ?
  `
  ).run(status, rating || null, sessionId);
}

export function getPendingEscrows(olderThanDays: number = 7): EscrowSession[] {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanDays * 24 * 60 * 60;
  return db
    .prepare(
      `
    SELECT * FROM escrow_sessions
    WHERE status = 'active' AND created_at < ?
  `
    )
    .all(cutoff) as EscrowSession[];
}

// Daily message count operations (persistent)
export function getDailyMessageCount(userId: string, date: string): number {
  const row = db
    .prepare('SELECT count FROM daily_message_counts WHERE user_id = ? AND date = ?')
    .get(userId, date) as { count: number } | undefined;
  return row?.count || 0;
}

export function incrementDailyMessageCount(userId: string, date: string): number {
  db.prepare(
    `
    INSERT INTO daily_message_counts (user_id, date, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
  `
  ).run(userId, date);

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
  const cutoff = Math.floor(Date.now() / 1000) - daysToKeep * 24 * 60 * 60;
  db.prepare('DELETE FROM processed_tweets WHERE processed_at < ?').run(cutoff);
}

// Conversation tracking (prevent multiple replies in same thread)
export function hasRepliedToConversation(conversationId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM replied_conversations WHERE conversation_id = ?')
    .get(conversationId);
  return !!row;
}

export function markConversationReplied(conversationId: string): void {
  db.prepare('INSERT OR IGNORE INTO replied_conversations (conversation_id) VALUES (?)').run(
    conversationId
  );
}

export function cleanupOldConversations(daysToKeep: number = 7): void {
  const cutoff = Math.floor(Date.now() / 1000) - daysToKeep * 24 * 60 * 60;
  db.prepare('DELETE FROM replied_conversations WHERE replied_at < ?').run(cutoff);
}

// Bot state (persist lastSeenId across restarts)
export function getBotState(key: string): string | null {
  const row = db.prepare('SELECT value FROM bot_state WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
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
  db.prepare(
    `
    INSERT OR REPLACE INTO wallet_challenges (user_id, wallet, nonce, message, expires_at, verified)
    VALUES (?, ?, ?, ?, ?, 0)
  `
  ).run(userId, wallet, nonce, message, Math.floor(expiresAt / 1000));
}

export function getWalletChallenge(userId: string, wallet: string): WalletChallengeRecord | null {
  return db
    .prepare(
      `
    SELECT * FROM wallet_challenges
    WHERE user_id = ? AND wallet = ? AND verified = 0
  `
    )
    .get(userId, wallet) as WalletChallengeRecord | null;
}

export function getPendingChallengeForUser(userId: string): WalletChallengeRecord | null {
  return db
    .prepare(
      `
    SELECT * FROM wallet_challenges
    WHERE user_id = ? AND verified = 0
    ORDER BY created_at DESC LIMIT 1
  `
    )
    .get(userId) as WalletChallengeRecord | null;
}

export function markChallengeVerified(userId: string, wallet: string): void {
  db.prepare(
    `
    UPDATE wallet_challenges
    SET verified = 1
    WHERE user_id = ? AND wallet = ?
  `
  ).run(userId, wallet);
}

export function cleanupExpiredChallenges(): number {
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare('DELETE FROM wallet_challenges WHERE expires_at < ? AND verified = 0')
    .run(now);
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
  const row = db.prepare('SELECT * FROM api_rate_limits WHERE wallet = ?').get(wallet) as
    | ApiRateLimitEntry
    | undefined;

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
    db.prepare(
      `
      UPDATE api_rate_limits
      SET minute_count = ?, minute_reset_at = ?, day_count = ?, day_reset_at = ?
      WHERE wallet = ?
    `
    ).run(row.minute_count, row.minute_reset_at, row.day_count, row.day_reset_at, wallet);
  }

  return row;
}

export function incrementApiRateLimit(wallet: string): ApiRateLimitEntry {
  const now = Date.now();
  const existing = getApiRateLimit(wallet);

  if (existing) {
    existing.minute_count++;
    existing.day_count++;
    db.prepare(
      `
      UPDATE api_rate_limits
      SET minute_count = ?, day_count = ?
      WHERE wallet = ?
    `
    ).run(existing.minute_count, existing.day_count, wallet);
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

  db.prepare(
    `
    INSERT INTO api_rate_limits (wallet, minute_count, minute_reset_at, day_count, day_reset_at)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(wallet, entry.minute_count, entry.minute_reset_at, entry.day_count, entry.day_reset_at);

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
  const row = db
    .prepare('SELECT count, reset_at FROM lookup_rate_limits WHERE user_id = ?')
    .get(userId) as { count: number; reset_at: number } | undefined;

  if (!row) return false;

  // Reset if window expired
  if (row.reset_at < now) {
    db.prepare('UPDATE lookup_rate_limits SET count = 0, reset_at = ? WHERE user_id = ?').run(
      now + LOOKUP_RATE_WINDOW,
      userId
    );
    return false;
  }

  return row.count >= LOOKUP_RATE_LIMIT;
}

export function incrementLookupCount(userId: string): void {
  const now = Date.now();
  const row = db
    .prepare('SELECT count, reset_at FROM lookup_rate_limits WHERE user_id = ?')
    .get(userId) as { count: number; reset_at: number } | undefined;

  if (!row) {
    db.prepare('INSERT INTO lookup_rate_limits (user_id, count, reset_at) VALUES (?, 1, ?)').run(
      userId,
      now + LOOKUP_RATE_WINDOW
    );
    return;
  }

  if (row.reset_at < now) {
    // Window expired, reset
    db.prepare('UPDATE lookup_rate_limits SET count = 1, reset_at = ? WHERE user_id = ?').run(
      now + LOOKUP_RATE_WINDOW,
      userId
    );
  } else {
    // Increment count
    db.prepare('UPDATE lookup_rate_limits SET count = count + 1 WHERE user_id = ?').run(userId);
  }
}

// Database shutdown
export function closeDatabase(): void {
  db.close();
}

// Hive ZK signal storage
export interface HiveSignal {
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

export function storeHiveSignal(
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
  const result = db
    .prepare(
      `
    INSERT INTO swarmteams_signals (tweet_id, commitment, nullifier, proof_a, proof_b, proof_c, signal_type, direction, confidence, magnitude, stake_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      tweetId,
      commitment,
      nullifier,
      proofA,
      proofB,
      proofC,
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount
    );
  return result.lastInsertRowid as number;
}

export function getHiveSignalByTweet(tweetId: string): HiveSignal | null {
  return db
    .prepare('SELECT * FROM swarmteams_signals WHERE tweet_id = ?')
    .get(tweetId) as HiveSignal | null;
}

export function getHiveSignalByCommitment(commitment: string): HiveSignal | null {
  return db
    .prepare('SELECT * FROM swarmteams_signals WHERE commitment = ?')
    .get(commitment) as HiveSignal | null;
}

export function markHiveSignalRevealed(id: number): void {
  db.prepare('UPDATE swarmteams_signals SET revealed = 1 WHERE id = ?').run(id);
}

export function getRecentHiveSignals(limit = 100): HiveSignal[] {
  return db
    .prepare('SELECT * FROM swarmteams_signals ORDER BY created_at DESC LIMIT ?')
    .all(limit) as HiveSignal[];
}

export function getHiveSignals(limit = 10): HiveSignal[] {
  return db
    .prepare('SELECT * FROM swarmteams_signals ORDER BY created_at DESC LIMIT ?')
    .all(limit) as HiveSignal[];
}

export function getHiveStats(): {
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
  const total = (
    db.prepare('SELECT COUNT(*) as count FROM swarmteams_signals').get() as { count: number }
  ).count;
  const long = (
    db.prepare('SELECT COUNT(*) as count FROM swarmteams_signals WHERE direction = 1').get() as {
      count: number;
    }
  ).count;
  const short = (
    db.prepare('SELECT COUNT(*) as count FROM swarmteams_signals WHERE direction = 0').get() as {
      count: number;
    }
  ).count;
  const neutral = (
    db.prepare('SELECT COUNT(*) as count FROM swarmteams_signals WHERE direction = 2').get() as {
      count: number;
    }
  ).count;
  const sentiment = (
    db.prepare('SELECT COUNT(*) as count FROM swarmteams_signals WHERE signal_type = 0').get() as {
      count: number;
    }
  ).count;
  const technical = (
    db.prepare('SELECT COUNT(*) as count FROM swarmteams_signals WHERE signal_type = 1').get() as {
      count: number;
    }
  ).count;
  const onChain = (
    db.prepare('SELECT COUNT(*) as count FROM swarmteams_signals WHERE signal_type = 2').get() as {
      count: number;
    }
  ).count;
  const news = (
    db.prepare('SELECT COUNT(*) as count FROM swarmteams_signals WHERE signal_type = 3').get() as {
      count: number;
    }
  ).count;
  const avgs = db
    .prepare('SELECT AVG(confidence) as avgConf, AVG(magnitude) as avgMag FROM swarmteams_signals')
    .get() as { avgConf: number | null; avgMag: number | null };
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const last24h = (
    db
      .prepare('SELECT COUNT(*) as count FROM swarmteams_signals WHERE created_at > ?')
      .get(dayAgo) as { count: number }
  ).count;

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

// Hive proof generation rate limiting
const PROOF_RATE_LIMIT = 10; // proofs per window
const PROOF_RATE_WINDOW = 60000; // 1 minute

export function isProofRateLimited(key = 'global'): boolean {
  const now = Date.now();
  const row = db
    .prepare('SELECT count, window_start FROM swarmteams_proof_rate_limits WHERE key = ?')
    .get(key) as { count: number; window_start: number } | undefined;

  if (!row) return false;

  // Reset if window expired
  if (row.window_start + PROOF_RATE_WINDOW < now) {
    db.prepare(
      'UPDATE swarmteams_proof_rate_limits SET count = 0, window_start = ? WHERE key = ?'
    ).run(now, key);
    return false;
  }

  return row.count >= PROOF_RATE_LIMIT;
}

export function incrementProofCount(key = 'global'): void {
  const now = Date.now();
  const row = db
    .prepare('SELECT count, window_start FROM swarmteams_proof_rate_limits WHERE key = ?')
    .get(key) as { count: number; window_start: number } | undefined;

  if (!row) {
    db.prepare(
      'INSERT INTO swarmteams_proof_rate_limits (key, count, window_start) VALUES (?, 1, ?)'
    ).run(key, now);
    return;
  }

  if (row.window_start + PROOF_RATE_WINDOW < now) {
    // Window expired, reset
    db.prepare(
      'UPDATE swarmteams_proof_rate_limits SET count = 1, window_start = ? WHERE key = ?'
    ).run(now, key);
  } else {
    // Increment count
    db.prepare('UPDATE swarmteams_proof_rate_limits SET count = count + 1 WHERE key = ?').run(key);
  }
}

// Tip bot interfaces
export interface PendingTip {
  id: number;
  sender_id: string;
  sender_wallet: string;
  recipient_username: string;
  recipient_id: string | null;
  amount_lamports: number;
  token: string;
  status: 'pending' | 'claimed' | 'expired' | 'cancelled';
  tx_signature: string | null;
  tweet_id: string | null;
  created_at: number;
  claimed_at: number | null;
  expires_at: number;
}

export interface TipHistoryEntry {
  id: number;
  sender_id: string;
  recipient_id: string;
  amount_lamports: number;
  token: string;
  tx_signature: string;
  tweet_id: string | null;
  created_at: number;
}

// Tip rate limiting - two tiers: hourly and daily
const TIP_HOURLY_LIMIT = 10; // tips per hour
const TIP_DAILY_LIMIT = 50; // tips per day
const TIP_HOURLY_WINDOW = 3600; // 1 hour in seconds
const TIP_DAILY_WINDOW = 86400; // 24 hours in seconds

export interface TipRateLimitInfo {
  limited: boolean;
  hourlyCount: number;
  dailyCount: number;
  hourlyRemaining: number;
  dailyRemaining: number;
}

export function getTipRateLimitInfo(senderId: string): TipRateLimitInfo {
  const now = Math.floor(Date.now() / 1000);
  const hourStart = now - TIP_HOURLY_WINDOW;
  const dayStart = now - TIP_DAILY_WINDOW;

  const hourly = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM pending_tips
    WHERE sender_id = ? AND created_at > ?
  `
    )
    .get(senderId, hourStart) as { count: number };

  const daily = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM pending_tips
    WHERE sender_id = ? AND created_at > ?
  `
    )
    .get(senderId, dayStart) as { count: number };

  return {
    limited: hourly.count >= TIP_HOURLY_LIMIT || daily.count >= TIP_DAILY_LIMIT,
    hourlyCount: hourly.count,
    dailyCount: daily.count,
    hourlyRemaining: Math.max(0, TIP_HOURLY_LIMIT - hourly.count),
    dailyRemaining: Math.max(0, TIP_DAILY_LIMIT - daily.count),
  };
}

export function isTipRateLimited(senderId: string): boolean {
  return getTipRateLimitInfo(senderId).limited;
}

// Pending tip operations
export function createPendingTip(
  senderId: string,
  senderWallet: string,
  recipientUsername: string,
  amountLamports: number,
  token: string,
  tweetId?: string
): number {
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
  const result = db
    .prepare(
      `
    INSERT INTO pending_tips (sender_id, sender_wallet, recipient_username, amount_lamports, token, tweet_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      senderId,
      senderWallet,
      recipientUsername.toLowerCase(),
      amountLamports,
      token,
      tweetId || null,
      expiresAt
    );
  return result.lastInsertRowid as number;
}

export function getPendingTip(tipId: number): PendingTip | null {
  return db.prepare('SELECT * FROM pending_tips WHERE id = ?').get(tipId) as PendingTip | null;
}

export function getPendingTipsForRecipient(recipientUsername: string): PendingTip[] {
  return db
    .prepare(
      `
    SELECT * FROM pending_tips
    WHERE recipient_username = ? AND status = 'pending' AND expires_at > unixepoch()
    ORDER BY created_at DESC
  `
    )
    .all(recipientUsername.toLowerCase()) as PendingTip[];
}

export function getPendingTipsBySender(senderId: string): PendingTip[] {
  return db
    .prepare(
      `
    SELECT * FROM pending_tips
    WHERE sender_id = ? AND status = 'pending' AND expires_at > unixepoch()
    ORDER BY created_at DESC
  `
    )
    .all(senderId) as PendingTip[];
}

export function updatePendingTipRecipientId(tipId: number, recipientId: string): void {
  db.prepare('UPDATE pending_tips SET recipient_id = ? WHERE id = ?').run(recipientId, tipId);
}

export function markTipClaimed(tipId: number, txSignature: string): void {
  db.prepare(
    `
    UPDATE pending_tips
    SET status = 'claimed', tx_signature = ?, claimed_at = unixepoch()
    WHERE id = ?
  `
  ).run(txSignature, tipId);
}

export function markTipCancelled(tipId: number): void {
  db.prepare(`UPDATE pending_tips SET status = 'cancelled' WHERE id = ?`).run(tipId);
}

export function markExpiredTips(): number {
  const result = db
    .prepare(
      `
    UPDATE pending_tips
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < unixepoch()
  `
    )
    .run();
  return result.changes;
}

// Tip history operations
export function recordTipHistory(
  senderId: string,
  recipientId: string,
  amountLamports: number,
  token: string,
  txSignature: string,
  tweetId?: string
): number {
  const result = db
    .prepare(
      `
    INSERT INTO tip_history (sender_id, recipient_id, amount_lamports, token, tx_signature, tweet_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `
    )
    .run(senderId, recipientId, amountLamports, token, txSignature, tweetId || null);
  return result.lastInsertRowid as number;
}

export function getTipHistoryForUser(userId: string, limit = 20): TipHistoryEntry[] {
  return db
    .prepare(
      `
    SELECT * FROM tip_history
    WHERE sender_id = ? OR recipient_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(userId, userId, limit) as TipHistoryEntry[];
}

export function getTipStats(userId: string): {
  totalSent: number;
  totalReceived: number;
  tipsSent: number;
  tipsReceived: number;
} {
  const sent = db
    .prepare(
      `
    SELECT COUNT(*) as count, COALESCE(SUM(amount_lamports), 0) as total
    FROM tip_history WHERE sender_id = ?
  `
    )
    .get(userId) as { count: number; total: number };

  const received = db
    .prepare(
      `
    SELECT COUNT(*) as count, COALESCE(SUM(amount_lamports), 0) as total
    FROM tip_history WHERE recipient_id = ?
  `
    )
    .get(userId) as { count: number; total: number };

  return {
    totalSent: sent.total,
    totalReceived: received.total,
    tipsSent: sent.count,
    tipsReceived: received.count,
  };
}

// User lookup by wallet
export function getUserByWallet(wallet: string): User | null {
  return db.prepare('SELECT * FROM users WHERE wallet = ?').get(wallet) as User | null;
}

export function getUserById(userId: string): User | null {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | null;
}

// Credit system interfaces
export interface CreditAccount {
  wallet: string;
  balance_micro: number;
  total_deposited_micro: number;
  total_spent_micro: number;
  last_deposit_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreditDeposit {
  id: number;
  wallet: string;
  tx_signature: string;
  kamiyo_amount: string;
  credit_amount_micro: number;
  rate_used: string;
  status: string;
  created_at: number;
}

export interface CreditUsage {
  id: number;
  wallet: string;
  endpoint: string;
  amount_micro: number;
  description: string | null;
  created_at: number;
}

// 1M $KAMIYO = $10 credits (adjustable via KAMIYO_CREDIT_RATE)
const KAMIYO_TO_CREDIT_RATE = parseFloat(process.env.KAMIYO_CREDIT_RATE || '0.00001');

export function kamiyoToCredits(kamiyoAmount: number): number {
  return Math.floor(kamiyoAmount * KAMIYO_TO_CREDIT_RATE * 1_000_000);
}

export function creditsToUsd(creditsMicro: number): number {
  return creditsMicro / 1_000_000;
}

export function usdToCredits(usd: number): number {
  return Math.floor(usd * 1_000_000);
}

export function getCreditAccount(wallet: string): CreditAccount | null {
  return db.prepare('SELECT * FROM credits WHERE wallet = ?').get(wallet) as CreditAccount | null;
}

export function getOrCreateCreditAccount(wallet: string): CreditAccount {
  const existing = getCreditAccount(wallet);
  if (existing) return existing;

  db.prepare('INSERT INTO credits (wallet) VALUES (?)').run(wallet);
  return getCreditAccount(wallet)!;
}

export function getCreditBalance(wallet: string): number {
  const account = getCreditAccount(wallet);
  return account?.balance_micro || 0;
}

export function getCreditBalanceUsd(wallet: string): number {
  return creditsToUsd(getCreditBalance(wallet));
}

export function depositCredits(
  wallet: string,
  txSignature: string,
  kamiyoAmount: string,
  creditAmountMicro: number
): boolean {
  return db.transaction(() => {
    const existing = db
      .prepare('SELECT 1 FROM credit_deposits WHERE tx_signature = ?')
      .get(txSignature);
    if (existing) return false;

    db.prepare(
      `
      INSERT INTO credit_deposits (wallet, tx_signature, kamiyo_amount, credit_amount_micro, rate_used)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(wallet, txSignature, kamiyoAmount, creditAmountMicro, String(KAMIYO_TO_CREDIT_RATE));

    const account = getCreditAccount(wallet);
    if (account) {
      db.prepare(
        `
        UPDATE credits
        SET balance_micro = balance_micro + ?,
            total_deposited_micro = total_deposited_micro + ?,
            last_deposit_at = unixepoch(),
            updated_at = unixepoch()
        WHERE wallet = ?
      `
      ).run(creditAmountMicro, creditAmountMicro, wallet);
    } else {
      db.prepare(
        `
        INSERT INTO credits (wallet, balance_micro, total_deposited_micro, last_deposit_at)
        VALUES (?, ?, ?, unixepoch())
      `
      ).run(wallet, creditAmountMicro, creditAmountMicro);
    }

    return true;
  })();
}

export function deductCredits(
  wallet: string,
  amountMicro: number,
  endpoint: string,
  description?: string
): boolean {
  return db.transaction(() => {
    const account = getCreditAccount(wallet);
    if (!account || account.balance_micro < amountMicro) {
      return false;
    }

    db.prepare(
      `
      UPDATE credits
      SET balance_micro = balance_micro - ?,
          total_spent_micro = total_spent_micro + ?,
          updated_at = unixepoch()
      WHERE wallet = ?
    `
    ).run(amountMicro, amountMicro, wallet);

    db.prepare(
      `
      INSERT INTO credit_usage (wallet, endpoint, amount_micro, description)
      VALUES (?, ?, ?, ?)
    `
    ).run(wallet, endpoint, amountMicro, description || null);

    return true;
  })();
}

export function isDepositProcessed(txSignature: string): boolean {
  const row = db.prepare('SELECT 1 FROM credit_deposits WHERE tx_signature = ?').get(txSignature);
  return !!row;
}

export function getCreditDeposits(wallet: string, limit = 20): CreditDeposit[] {
  return db
    .prepare(
      `
    SELECT * FROM credit_deposits
    WHERE wallet = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(wallet, limit) as CreditDeposit[];
}

export function getCreditUsage(wallet: string, limit = 50): CreditUsage[] {
  return db
    .prepare(
      `
    SELECT * FROM credit_usage
    WHERE wallet = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(wallet, limit) as CreditUsage[];
}

export function getCreditStats(): {
  totalAccounts: number;
  totalDepositedMicro: number;
  totalSpentMicro: number;
  activeAccounts: number;
} {
  const totals = db
    .prepare(
      `
    SELECT
      COUNT(*) as totalAccounts,
      COALESCE(SUM(total_deposited_micro), 0) as totalDepositedMicro,
      COALESCE(SUM(total_spent_micro), 0) as totalSpentMicro
    FROM credits
  `
    )
    .get() as { totalAccounts: number; totalDepositedMicro: number; totalSpentMicro: number };

  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const active = db
    .prepare(
      `
    SELECT COUNT(DISTINCT wallet) as count FROM credit_usage WHERE created_at > ?
  `
    )
    .get(dayAgo) as { count: number };

  return {
    ...totals,
    activeAccounts: active.count,
  };
}

// Linked wallets table (Twitter ID -> Wallet mappings from dApp)
db.exec(`
  CREATE TABLE IF NOT EXISTS linked_wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    twitter_id TEXT NOT NULL,
    twitter_username TEXT,
    wallet TEXT NOT NULL,
    signature TEXT NOT NULL,
    message TEXT NOT NULL,
    linked_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(twitter_id, wallet)
  );

  CREATE INDEX IF NOT EXISTS idx_linked_wallets_twitter ON linked_wallets(twitter_id);
  CREATE INDEX IF NOT EXISTS idx_linked_wallets_wallet ON linked_wallets(wallet);

  CREATE TABLE IF NOT EXISTS swarm_teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'SOL',
    daily_limit REAL NOT NULL DEFAULT 0,
    pool_balance REAL NOT NULL DEFAULT 0,
    pool_balance_sol REAL NOT NULL DEFAULT 0,
    owner_wallet TEXT, -- Wallet that owns this team (for auth)
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS swarm_team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    draw_limit REAL NOT NULL DEFAULT 0,
    drawn_today REAL NOT NULL DEFAULT 0,
    last_draw_reset INTEGER DEFAULT (unixepoch()),
    added_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
  );

  CREATE TABLE IF NOT EXISTS swarm_draws (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    amount REAL NOT NULL,
    purpose TEXT,
    payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
  );

  CREATE TABLE IF NOT EXISTS swarm_fund_deposits (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    crypto_address TEXT,
    crypto_amount TEXT,
    expires_at TEXT,
    confirmed_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
  );

  CREATE INDEX IF NOT EXISTS idx_swarm_members_team ON swarm_team_members(team_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_draws_team ON swarm_draws(team_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_draws_agent ON swarm_draws(agent_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_fund_deposits_team ON swarm_fund_deposits(team_id);

  CREATE TABLE IF NOT EXISTS swarm_task_proposals (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    action_hash TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    budget REAL NOT NULL,
    min_bid REAL DEFAULT 0,
    vote_deadline INTEGER NOT NULL,
    reveal_deadline INTEGER NOT NULL,
    status TEXT DEFAULT 'voting',
    winning_member_id TEXT,
    winning_bid REAL,
    task_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
  );

  CREATE TABLE IF NOT EXISTS swarm_vote_bids (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    vote_nullifier TEXT NOT NULL UNIQUE,
    vote_commitment TEXT NOT NULL,
    bid_commitment TEXT NOT NULL,
    vote_value INTEGER,
    bid_amount REAL,
    revealed_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (proposal_id) REFERENCES swarm_task_proposals(id),
    UNIQUE(proposal_id, member_id)
  );

  CREATE INDEX IF NOT EXISTS idx_proposals_team ON swarm_task_proposals(team_id);
  CREATE INDEX IF NOT EXISTS idx_proposals_status ON swarm_task_proposals(status);
  CREATE INDEX IF NOT EXISTS idx_vote_bids_proposal ON swarm_vote_bids(proposal_id);

  CREATE TABLE IF NOT EXISTS swarm_runs (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    requested_by_wallet TEXT,
    mission TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    status TEXT NOT NULL,
    max_parallel INTEGER NOT NULL,
    fail_fast INTEGER NOT NULL,
    execution_mode TEXT NOT NULL DEFAULT 'execute',
    idempotency_key TEXT,
    snapshot_hash TEXT,
    counterfactual_case_id TEXT,
    counterfactual_branch_id TEXT,
    total_reserved REAL NOT NULL DEFAULT 0,
    total_spent REAL NOT NULL DEFAULT 0,
    error TEXT,
    kiroku_receipt TEXT,
    kiroku_url TEXT,
    kiroku_error TEXT,
    started_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
  );

  CREATE INDEX IF NOT EXISTS idx_swarm_runs_team_started ON swarm_runs(team_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_swarm_runs_status_started ON swarm_runs(status, started_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_swarm_runs_team_idempotency ON swarm_runs(team_id, idempotency_key);
  CREATE INDEX IF NOT EXISTS idx_swarm_runs_case ON swarm_runs(counterfactual_case_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_runs_branch ON swarm_runs(counterfactual_branch_id);

  CREATE TABLE IF NOT EXISTS swarm_run_nodes (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    depends_on_json TEXT NOT NULL,
    description TEXT NOT NULL,
    budget_reserved REAL NOT NULL,
    amount_drawn REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    reuse_key TEXT,
    output_json TEXT,
    error TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (run_id) REFERENCES swarm_runs(id)
  );

  CREATE INDEX IF NOT EXISTS idx_swarm_run_nodes_run ON swarm_run_nodes(run_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_run_nodes_run_status ON swarm_run_nodes(run_id, status);
  CREATE INDEX IF NOT EXISTS idx_swarm_run_nodes_run_reuse ON swarm_run_nodes(run_id, reuse_key);

  CREATE TABLE IF NOT EXISTS counterfactual_cases (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    mission TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    snapshot_source_type TEXT NOT NULL,
    snapshot_source_ref TEXT,
    decision_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    created_by_wallet TEXT,
    winner_branch_id TEXT,
    promoted_run_id TEXT,
    error TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER,
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (team_id) REFERENCES swarm_teams(id)
  );

  CREATE INDEX IF NOT EXISTS idx_counterfactual_cases_team_created
    ON counterfactual_cases(team_id, created_at);

  CREATE TABLE IF NOT EXISTS counterfactual_branches (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    policy_pack_id TEXT NOT NULL,
    branch_kind TEXT NOT NULL,
    swarm_run_id TEXT,
    status TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    scorecard_json TEXT,
    committee_json TEXT,
    result_hash TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER,
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (case_id) REFERENCES counterfactual_cases(id)
  );

  CREATE INDEX IF NOT EXISTS idx_counterfactual_branches_case_created
    ON counterfactual_branches(case_id, created_at);

  CREATE TABLE IF NOT EXISTS counterfactual_case_events (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    branch_id TEXT,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (case_id) REFERENCES counterfactual_cases(id)
  );

  CREATE INDEX IF NOT EXISTS idx_counterfactual_case_events_case_created
    ON counterfactual_case_events(case_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_blobs (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    storage_key TEXT NOT NULL,
    mime_type TEXT,
    file_name TEXT,
    size_bytes INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS reality_fork_uploads (
    id TEXT PRIMARY KEY,
    blob_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    created_by_ip TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (blob_id) REFERENCES reality_fork_blobs(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_uploads_ip_created
    ON reality_fork_uploads(created_by_ip, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_projects (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    claim TEXT NOT NULL,
    description TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    simulation_config_json TEXT NOT NULL DEFAULT '{}',
    warnings_json TEXT NOT NULL DEFAULT '[]',
    decision_mode TEXT NOT NULL DEFAULT 'score_then_truth_court',
    created_by_ip TEXT,
    status TEXT NOT NULL,
    current_job_id TEXT,
    latest_report_id TEXT,
    latest_publication_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    published_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_projects_created
    ON reality_fork_projects(created_at);
  CREATE INDEX IF NOT EXISTS idx_reality_fork_projects_status
    ON reality_fork_projects(status);

  CREATE TABLE IF NOT EXISTS reality_fork_evidence (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'text',
    source_label TEXT,
    source_url TEXT,
    mime_type TEXT,
    blob_id TEXT,
    upload_id TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded',
    warning TEXT,
    content_text TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id),
    FOREIGN KEY (blob_id) REFERENCES reality_fork_blobs(id),
    FOREIGN KEY (upload_id) REFERENCES reality_fork_uploads(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_evidence_project_created
    ON reality_fork_evidence(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_document_chunks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    char_start INTEGER NOT NULL,
    char_end INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id),
    FOREIGN KEY (evidence_id) REFERENCES reality_fork_evidence(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_document_chunks_project_created
    ON reality_fork_document_chunks(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_reality_fork_document_chunks_evidence
    ON reality_fork_document_chunks(evidence_id, chunk_index);

  CREATE TABLE IF NOT EXISTS reality_fork_extractions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    keywords_json TEXT NOT NULL,
    facts_json TEXT NOT NULL,
    artifact_blob_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id),
    FOREIGN KEY (evidence_id) REFERENCES reality_fork_evidence(id),
    FOREIGN KEY (artifact_blob_id) REFERENCES reality_fork_blobs(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_extractions_project_created
    ON reality_fork_extractions(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_entities (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    mention_count INTEGER NOT NULL DEFAULT 0,
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_entities_project_created
    ON reality_fork_entities(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_claims (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    text TEXT NOT NULL,
    topic TEXT NOT NULL,
    sentiment REAL NOT NULL,
    confidence REAL NOT NULL,
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    entity_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_claims_project_created
    ON reality_fork_claims(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_entity_relationships (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    weight REAL NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_entity_relationships_project_created
    ON reality_fork_entity_relationships(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_artifact_citations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_artifact_citations_project_created
    ON reality_fork_artifact_citations(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_scenario_inputs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    weight REAL NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_scenario_inputs_project_created
    ON reality_fork_scenario_inputs(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_simulations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    hypothesis_id TEXT NOT NULL DEFAULT 'status_quo',
    stance TEXT NOT NULL,
    outcome TEXT NOT NULL,
    probability REAL NOT NULL,
    confidence REAL NOT NULL,
    impact_score REAL NOT NULL,
    rationale_json TEXT NOT NULL,
    lane_outlook_json TEXT NOT NULL DEFAULT '{}',
    scorecard_json TEXT,
    artifact_blob_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id),
    FOREIGN KEY (artifact_blob_id) REFERENCES reality_fork_blobs(id),
    UNIQUE(project_id, slug)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_simulations_project_created
    ON reality_fork_simulations(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_lane_rounds (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    lane TEXT NOT NULL,
    round INTEGER NOT NULL,
    sentiment REAL NOT NULL,
    conviction REAL NOT NULL,
    salience REAL NOT NULL,
    summary TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_lane_rounds_project_round
    ON reality_fork_lane_rounds(project_id, lane, round);

  CREATE TABLE IF NOT EXISTS reality_fork_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    markdown_blob_id TEXT,
    html_blob_id TEXT,
    sections_json TEXT NOT NULL DEFAULT '[]',
    decision_json TEXT,
    metrics_json TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id),
    FOREIGN KEY (markdown_blob_id) REFERENCES reality_fork_blobs(id),
    FOREIGN KEY (html_blob_id) REFERENCES reality_fork_blobs(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_reports_project_created
    ON reality_fork_reports(project_id, created_at);

  CREATE TABLE IF NOT EXISTS reality_fork_publications (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    report_id TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    bundle_blob_id TEXT,
    status TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    published_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id),
    FOREIGN KEY (report_id) REFERENCES reality_fork_reports(id),
    FOREIGN KEY (bundle_blob_id) REFERENCES reality_fork_blobs(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_publications_project_published
    ON reality_fork_publications(project_id, published_at);

  CREATE TABLE IF NOT EXISTS reality_fork_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    current_stage TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    error TEXT,
    result_json TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    started_at INTEGER,
    completed_at INTEGER,
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_jobs_project_created
    ON reality_fork_jobs(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_reality_fork_jobs_project_status
    ON reality_fork_jobs(project_id, status);

  CREATE TABLE IF NOT EXISTS reality_fork_project_events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    job_id TEXT,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (project_id) REFERENCES reality_fork_projects(id),
    FOREIGN KEY (job_id) REFERENCES reality_fork_jobs(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reality_fork_project_events_project_created
    ON reality_fork_project_events(project_id, created_at);
`);

// Migration: add owner_wallet column if it doesn't exist
try {
  db.exec('ALTER TABLE swarm_teams ADD COLUMN owner_wallet TEXT');
} catch {
  // Column already exists
}

// Migration: add pool_balance_sol column for multi-currency support
try {
  db.exec('ALTER TABLE swarm_teams ADD COLUMN pool_balance_sol REAL NOT NULL DEFAULT 0');
} catch {
  // Column already exists
}

// Migration: add idempotency_key for idempotent swarm run creation.
try {
  db.exec('ALTER TABLE swarm_runs ADD COLUMN idempotency_key TEXT');
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE swarm_runs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'execute'`);
} catch {
  // Column already exists
}

try {
  db.exec('ALTER TABLE swarm_runs ADD COLUMN snapshot_hash TEXT');
} catch {
  // Column already exists
}

try {
  db.exec('ALTER TABLE swarm_runs ADD COLUMN counterfactual_case_id TEXT');
} catch {
  // Column already exists
}

try {
  db.exec('ALTER TABLE swarm_runs ADD COLUMN counterfactual_branch_id TEXT');
} catch {
  // Column already exists
}

try {
  db.exec('ALTER TABLE swarm_run_nodes ADD COLUMN reuse_key TEXT');
} catch {
  // Column already exists
}

try {
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_swarm_runs_team_idempotency ON swarm_runs(team_id, idempotency_key)'
  );
} catch {
  // Ignore
}

try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_swarm_runs_case ON swarm_runs(counterfactual_case_id)');
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_swarm_runs_branch ON swarm_runs(counterfactual_branch_id)'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_swarm_run_nodes_run_reuse ON swarm_run_nodes(run_id, reuse_key)'
  );
} catch {
  // Ignore
}

for (const statement of [
  'ALTER TABLE reality_fork_projects ADD COLUMN prompt TEXT',
  "ALTER TABLE reality_fork_projects ADD COLUMN simulation_config_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE reality_fork_projects ADD COLUMN warnings_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE reality_fork_projects ADD COLUMN decision_mode TEXT NOT NULL DEFAULT 'score_then_truth_court'",
  'ALTER TABLE reality_fork_projects ADD COLUMN created_by_ip TEXT',
  "ALTER TABLE reality_fork_evidence ADD COLUMN source_type TEXT NOT NULL DEFAULT 'text'",
  'ALTER TABLE reality_fork_evidence ADD COLUMN upload_id TEXT',
  "ALTER TABLE reality_fork_evidence ADD COLUMN status TEXT NOT NULL DEFAULT 'uploaded'",
  'ALTER TABLE reality_fork_evidence ADD COLUMN warning TEXT',
  "ALTER TABLE reality_fork_simulations ADD COLUMN hypothesis_id TEXT NOT NULL DEFAULT 'status_quo'",
  "ALTER TABLE reality_fork_simulations ADD COLUMN lane_outlook_json TEXT NOT NULL DEFAULT '{}'",
  'ALTER TABLE reality_fork_simulations ADD COLUMN scorecard_json TEXT',
  'ALTER TABLE reality_fork_reports ADD COLUMN html_blob_id TEXT',
  "ALTER TABLE reality_fork_reports ADD COLUMN sections_json TEXT NOT NULL DEFAULT '[]'",
  'ALTER TABLE reality_fork_reports ADD COLUMN decision_json TEXT',
]) {
  try {
    db.exec(statement);
  } catch {
    // Column already exists or table not present yet.
  }
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function getTableColumns(table: string): Set<string> {
  const rows = db
    .prepare(`SELECT name FROM pragma_table_info('${table.replaceAll("'", "''")}')`)
    .all() as { name: string }[];
  return new Set(rows.map(r => r.name));
}

function renameColumnBySuffix(table: string, suffix: string, target: string) {
  const cols = getTableColumns(table);
  if (cols.has(target)) return;

  const legacy = [...cols].find(c => c.endsWith(suffix));
  if (!legacy) return;

  try {
    db.exec(
      `ALTER TABLE ${quoteIdent(table)} RENAME COLUMN ${quoteIdent(legacy)} TO ${quoteIdent(target)}`
    );
  } catch {
    // Ignore
  }
}

function dropLegacyFundingStateTables() {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ?`)
    .all('%_funding_states') as { name: string }[];

  for (const t of tables) {
    const cols = getTableColumns(t.name);
    if (!cols.has('state_token') || !cols.has('expires_at')) continue;

    try {
      db.exec(`DROP TABLE IF EXISTS ${quoteIdent(t.name)}`);
    } catch {
      // Ignore
    }
  }
}

renameColumnBySuffix('swarm_draws', '_payment_id', 'payment_id');
renameColumnBySuffix('swarm_draws', '_status', 'status');
renameColumnBySuffix('swarm_fund_deposits', '_payment_id', 'payment_id');
renameColumnBySuffix('swarm_fund_deposits', '_status', 'status');
dropLegacyFundingStateTables();

export interface LinkedWallet {
  id: number;
  twitter_id: string;
  twitter_username: string | null;
  wallet: string;
  signature: string;
  message: string;
  linked_at: number;
}

export function linkWallet(
  twitterId: string,
  twitterUsername: string | null,
  wallet: string,
  signature: string,
  message: string
): boolean {
  try {
    db.prepare(
      `
      INSERT OR REPLACE INTO linked_wallets (twitter_id, twitter_username, wallet, signature, message)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(twitterId, twitterUsername, wallet, signature, message);
    return true;
  } catch {
    return false;
  }
}

export function getLinkedWallet(twitterId: string): LinkedWallet | null {
  return db
    .prepare('SELECT * FROM linked_wallets WHERE twitter_id = ? ORDER BY linked_at DESC LIMIT 1')
    .get(twitterId) as LinkedWallet | null;
}

export function getLinkedWallets(twitterId: string): LinkedWallet[] {
  return db
    .prepare('SELECT * FROM linked_wallets WHERE twitter_id = ? ORDER BY linked_at DESC')
    .all(twitterId) as LinkedWallet[];
}

export function getTwitterIdByWallet(wallet: string): string | null {
  const row = db
    .prepare(
      'SELECT twitter_id FROM linked_wallets WHERE wallet = ? ORDER BY linked_at DESC LIMIT 1'
    )
    .get(wallet) as { twitter_id: string } | undefined;
  return row?.twitter_id ?? null;
}

export function unlinkWallet(twitterId: string, wallet: string): boolean {
  const result = db
    .prepare('DELETE FROM linked_wallets WHERE twitter_id = ? AND wallet = ?')
    .run(twitterId, wallet);
  return result.changes > 0;
}

// MCP OAuth tables
db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_secret_hash TEXT NOT NULL,
    client_name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    grant_types TEXT NOT NULL,
    response_types TEXT NOT NULL,
    scopes TEXT NOT NULL,
    token_endpoint_auth_method TEXT DEFAULT 'client_secret_basic',
    client_secret_expires_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
    code TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    code_challenge_method TEXT DEFAULT 'S256',
    scopes TEXT NOT NULL,
    user_wallet TEXT,
    resource TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (client_id) REFERENCES mcp_oauth_clients(client_id)
  );

  CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
    token_hash TEXT PRIMARY KEY,
    token_type TEXT NOT NULL,
    client_id TEXT NOT NULL,
    user_wallet TEXT,
    scopes TEXT NOT NULL,
    resource TEXT,
    expires_at INTEGER NOT NULL,
    revoked INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (client_id) REFERENCES mcp_oauth_clients(client_id)
  );

  CREATE TABLE IF NOT EXISTS mcp_sessions (
    session_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_wallet TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    last_activity_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (client_id) REFERENCES mcp_oauth_clients(client_id)
  );

  CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_client ON mcp_oauth_codes(client_id);
  CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires ON mcp_oauth_codes(expires_at);
  CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_client ON mcp_oauth_tokens(client_id);
  CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_expires ON mcp_oauth_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_mcp_sessions_client ON mcp_sessions(client_id);
`);

// MCP OAuth interfaces
export interface McpOAuthClient {
  client_id: string;
  client_secret_hash: string;
  client_name: string;
  redirect_uris: string; // JSON array
  grant_types: string; // JSON array
  response_types: string; // JSON array
  scopes: string; // JSON array
  token_endpoint_auth_method: string;
  client_secret_expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface McpOAuthCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scopes: string; // JSON array
  user_wallet: string | null;
  resource: string | null;
  expires_at: number;
  created_at: number;
}

export interface McpOAuthToken {
  token_hash: string;
  token_type: 'access' | 'refresh';
  client_id: string;
  user_wallet: string | null;
  scopes: string; // JSON array
  resource: string | null;
  expires_at: number;
  revoked: number;
  created_at: number;
}

export interface McpSession {
  session_id: string;
  client_id: string;
  user_wallet: string | null;
  created_at: number;
  last_activity_at: number;
}

// MCP OAuth client operations
export function getMcpOAuthClient(clientId: string): McpOAuthClient | null {
  return db
    .prepare('SELECT * FROM mcp_oauth_clients WHERE client_id = ?')
    .get(clientId) as McpOAuthClient | null;
}

export function createMcpOAuthClient(
  client: Omit<McpOAuthClient, 'created_at' | 'updated_at'>
): void {
  db.prepare(
    `
    INSERT INTO mcp_oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types, scopes, token_endpoint_auth_method, client_secret_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    client.client_id,
    client.client_secret_hash,
    client.client_name,
    client.redirect_uris,
    client.grant_types,
    client.response_types,
    client.scopes,
    client.token_endpoint_auth_method,
    client.client_secret_expires_at
  );
}

// MCP OAuth code operations
export function getMcpOAuthCode(code: string): McpOAuthCode | null {
  return db
    .prepare('SELECT * FROM mcp_oauth_codes WHERE code = ?')
    .get(code) as McpOAuthCode | null;
}

export function createMcpOAuthCode(codeRecord: Omit<McpOAuthCode, 'created_at'>): void {
  db.prepare(
    `
    INSERT INTO mcp_oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, scopes, user_wallet, resource, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    codeRecord.code,
    codeRecord.client_id,
    codeRecord.redirect_uri,
    codeRecord.code_challenge,
    codeRecord.code_challenge_method,
    codeRecord.scopes,
    codeRecord.user_wallet,
    codeRecord.resource,
    codeRecord.expires_at
  );
}

export function deleteMcpOAuthCode(code: string): void {
  db.prepare('DELETE FROM mcp_oauth_codes WHERE code = ?').run(code);
}

export function cleanupExpiredMcpOAuthCodes(): number {
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare('DELETE FROM mcp_oauth_codes WHERE expires_at < ?').run(now);
  return result.changes;
}

// MCP OAuth token operations
export function getMcpOAuthToken(tokenHash: string): McpOAuthToken | null {
  return db
    .prepare('SELECT * FROM mcp_oauth_tokens WHERE token_hash = ?')
    .get(tokenHash) as McpOAuthToken | null;
}

export function createMcpOAuthToken(token: Omit<McpOAuthToken, 'created_at' | 'revoked'>): void {
  db.prepare(
    `
    INSERT INTO mcp_oauth_tokens (token_hash, token_type, client_id, user_wallet, scopes, resource, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    token.token_hash,
    token.token_type,
    token.client_id,
    token.user_wallet,
    token.scopes,
    token.resource,
    token.expires_at
  );
}

export function revokeMcpOAuthToken(tokenHash: string, clientId: string): void {
  db.prepare('UPDATE mcp_oauth_tokens SET revoked = 1 WHERE token_hash = ? AND client_id = ?').run(
    tokenHash,
    clientId
  );
}

export function cleanupExpiredMcpOAuthTokens(): number {
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare('DELETE FROM mcp_oauth_tokens WHERE expires_at < ?').run(now);
  return result.changes;
}

// MCP session operations
export function getMcpSession(sessionId: string): McpSession | null {
  return db
    .prepare('SELECT * FROM mcp_sessions WHERE session_id = ?')
    .get(sessionId) as McpSession | null;
}

export function createMcpSession(
  session: Omit<McpSession, 'created_at' | 'last_activity_at'>
): void {
  db.prepare(
    `
    INSERT INTO mcp_sessions (session_id, client_id, user_wallet)
    VALUES (?, ?, ?)
  `
  ).run(session.session_id, session.client_id, session.user_wallet);
}

export function updateMcpSessionActivity(sessionId: string): void {
  db.prepare('UPDATE mcp_sessions SET last_activity_at = unixepoch() WHERE session_id = ?').run(
    sessionId
  );
}

export function deleteMcpSession(sessionId: string): void {
  db.prepare('DELETE FROM mcp_sessions WHERE session_id = ?').run(sessionId);
}

export function cleanupOldMcpSessions(olderThanHours: number = 24): number {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanHours * 60 * 60;
  const result = db.prepare('DELETE FROM mcp_sessions WHERE last_activity_at < ?').run(cutoff);
  return result.changes;
}

// Daily API spend tracking for cost control
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_api_spend (
    date TEXT PRIMARY KEY,
    spend_micro INTEGER DEFAULT 0,
    request_count INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch())
  );
`);

// Default daily spend cap: $50 USD (in micro units)
const DEFAULT_DAILY_SPEND_CAP_MICRO =
  parseInt(process.env.DAILY_SPEND_CAP_USD || '50', 10) * 1_000_000;

export function getDailySpendCapMicro(): number {
  return DEFAULT_DAILY_SPEND_CAP_MICRO;
}

export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function getDailyApiSpend(date?: string): { spend_micro: number; request_count: number } {
  const targetDate = date || getTodayDate();
  const row = db
    .prepare('SELECT spend_micro, request_count FROM daily_api_spend WHERE date = ?')
    .get(targetDate) as { spend_micro: number; request_count: number } | undefined;
  return row || { spend_micro: 0, request_count: 0 };
}

export function incrementDailyApiSpend(costMicro: number): {
  spend_micro: number;
  request_count: number;
} {
  const date = getTodayDate();
  db.prepare(
    `
    INSERT INTO daily_api_spend (date, spend_micro, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(date) DO UPDATE SET
      spend_micro = spend_micro + ?,
      request_count = request_count + 1,
      updated_at = unixepoch()
  `
  ).run(date, costMicro, costMicro);
  return getDailyApiSpend(date);
}

export function isDailySpendCapExceeded(): boolean {
  const { spend_micro } = getDailyApiSpend();
  return spend_micro >= DEFAULT_DAILY_SPEND_CAP_MICRO;
}

export function getDailySpendStatus(): {
  date: string;
  spendUsd: number;
  capUsd: number;
  requestCount: number;
  remaining: number;
  exceeded: boolean;
} {
  const date = getTodayDate();
  const { spend_micro, request_count } = getDailyApiSpend(date);
  const capMicro = DEFAULT_DAILY_SPEND_CAP_MICRO;
  return {
    date,
    spendUsd: spend_micro / 1_000_000,
    capUsd: capMicro / 1_000_000,
    requestCount: request_count,
    remaining: Math.max(0, (capMicro - spend_micro) / 1_000_000),
    exceeded: spend_micro >= capMicro,
  };
}

export default db;
