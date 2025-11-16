-- Migration 008: Protocol Watchlists (Enterprise Feature)
-- Date: 2025-10-10

-- Create protocol_watchlists table
CREATE TABLE IF NOT EXISTS protocol_watchlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    protocols TEXT NOT NULL,  -- JSON array of protocol names
    chains TEXT,              -- JSON array of chains (optional filter)
    min_amount_usd REAL,      -- Minimum amount filter (optional)
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create watchlist_matches table to track when exploits match watchlists
CREATE TABLE IF NOT EXISTS watchlist_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_id INTEGER NOT NULL,
    exploit_id INTEGER NOT NULL,
    matched_at TEXT DEFAULT (datetime('now')),
    notified INTEGER DEFAULT 0,
    FOREIGN KEY (watchlist_id) REFERENCES protocol_watchlists(id) ON DELETE CASCADE,
    FOREIGN KEY (exploit_id) REFERENCES exploits(id) ON DELETE CASCADE,
    UNIQUE(watchlist_id, exploit_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON protocol_watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_active ON protocol_watchlists(is_active);
CREATE INDEX IF NOT EXISTS idx_watchlist_matches_watchlist ON watchlist_matches(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_matches_exploit ON watchlist_matches(exploit_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_matches_notified ON watchlist_matches(notified);
