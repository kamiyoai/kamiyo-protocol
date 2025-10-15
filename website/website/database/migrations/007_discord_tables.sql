-- Discord Integration Tables
-- Migration 007: Discord guilds, channels, and alert tracking

-- Discord guilds (servers) connected to the platform
CREATE TABLE IF NOT EXISTS discord_guilds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id BIGINT UNIQUE NOT NULL,
    guild_name TEXT NOT NULL,
    owner_id BIGINT NOT NULL,
    user_id INTEGER,  -- Link to platform user account
    tier TEXT DEFAULT 'free',  -- free, basic, pro, enterprise
    max_channels INTEGER DEFAULT 1,  -- Tier-based limit
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Discord channels subscribed to alerts
CREATE TABLE IF NOT EXISTS discord_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    channel_name TEXT,
    min_amount_usd REAL DEFAULT 0,  -- Minimum exploit amount
    chain_filter TEXT,  -- Comma-separated list of chains
    category_filter TEXT,  -- Comma-separated list of categories
    enable_threads BOOLEAN DEFAULT 0,  -- Create threads for high-value exploits
    daily_digest BOOLEAN DEFAULT 0,  -- Send daily digest
    digest_time TEXT DEFAULT '09:00',  -- UTC time for digest
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, channel_id)
);

-- Discord alerts sent (for deduplication and tracking)
CREATE TABLE IF NOT EXISTS discord_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exploit_id INTEGER NOT NULL,
    guild_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    message_id BIGINT,  -- Discord message ID
    thread_id BIGINT,  -- Discord thread ID (if created)
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exploit_id) REFERENCES exploits(id) ON DELETE CASCADE
);

-- Discord OAuth2 authorization tokens
CREATE TABLE IF NOT EXISTS discord_oauth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id BIGINT UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_type TEXT DEFAULT 'Bearer',
    expires_at DATETIME NOT NULL,
    scope TEXT,  -- OAuth2 scopes granted
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discord bot statistics
CREATE TABLE IF NOT EXISTS discord_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE UNIQUE NOT NULL,
    total_guilds INTEGER DEFAULT 0,
    active_channels INTEGER DEFAULT 0,
    alerts_sent INTEGER DEFAULT 0,
    commands_executed INTEGER DEFAULT 0,
    threads_created INTEGER DEFAULT 0,
    digests_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_discord_guilds_guild_id ON discord_guilds(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_guilds_user_id ON discord_guilds(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_guilds_active ON discord_guilds(is_active);

CREATE INDEX IF NOT EXISTS idx_discord_channels_guild ON discord_channels(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_channels_channel ON discord_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_channels_active ON discord_channels(is_active);

CREATE INDEX IF NOT EXISTS idx_discord_alerts_exploit ON discord_alerts(exploit_id);
CREATE INDEX IF NOT EXISTS idx_discord_alerts_guild ON discord_alerts(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_alerts_channel ON discord_alerts(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_alerts_sent ON discord_alerts(sent_at);

CREATE INDEX IF NOT EXISTS idx_discord_oauth_guild ON discord_oauth_tokens(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_stats_date ON discord_stats(date);

-- Views for analytics

-- Active Discord subscriptions summary
CREATE VIEW IF NOT EXISTS v_discord_subscriptions AS
SELECT
    dg.guild_id,
    dg.guild_name,
    dg.tier,
    COUNT(dc.id) as active_channels,
    dg.max_channels,
    dg.created_at as guild_joined
FROM discord_guilds dg
LEFT JOIN discord_channels dc ON dg.guild_id = dc.guild_id AND dc.is_active = 1
WHERE dg.is_active = 1
GROUP BY dg.guild_id;

-- Discord alert statistics by guild
CREATE VIEW IF NOT EXISTS v_discord_guild_stats AS
SELECT
    dg.guild_id,
    dg.guild_name,
    dg.tier,
    COUNT(DISTINCT dc.channel_id) as channels,
    COUNT(da.id) as total_alerts,
    COUNT(DISTINCT da.exploit_id) as unique_exploits,
    MAX(da.sent_at) as last_alert
FROM discord_guilds dg
LEFT JOIN discord_channels dc ON dg.guild_id = dc.guild_id
LEFT JOIN discord_alerts da ON dg.guild_id = da.guild_id
WHERE dg.is_active = 1
GROUP BY dg.guild_id;

-- Recent Discord alerts
CREATE VIEW IF NOT EXISTS v_recent_discord_alerts AS
SELECT
    da.id,
    da.guild_id,
    da.channel_id,
    da.message_id,
    e.protocol,
    e.chain,
    e.amount_usd,
    e.timestamp as exploit_timestamp,
    da.sent_at as alert_sent
FROM discord_alerts da
JOIN exploits e ON da.exploit_id = e.id
ORDER BY da.sent_at DESC
LIMIT 100;

-- Triggers for updated_at

-- discord_guilds trigger
CREATE TRIGGER IF NOT EXISTS update_discord_guilds_timestamp
AFTER UPDATE ON discord_guilds
BEGIN
    UPDATE discord_guilds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- discord_channels trigger
CREATE TRIGGER IF NOT EXISTS update_discord_channels_timestamp
AFTER UPDATE ON discord_channels
BEGIN
    UPDATE discord_channels SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- discord_oauth_tokens trigger
CREATE TRIGGER IF NOT EXISTS update_discord_oauth_tokens_timestamp
AFTER UPDATE ON discord_oauth_tokens
BEGIN
    UPDATE discord_oauth_tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- PostgreSQL version (for production)
-- This migration is compatible with both SQLite (development) and PostgreSQL (production)
-- PostgreSQL-specific syntax:
/*
-- For PostgreSQL, use BIGSERIAL and TIMESTAMP instead:

CREATE TABLE IF NOT EXISTS discord_guilds (
    id BIGSERIAL PRIMARY KEY,
    guild_id BIGINT UNIQUE NOT NULL,
    guild_name VARCHAR(255) NOT NULL,
    owner_id BIGINT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tier VARCHAR(50) DEFAULT 'free',
    max_channels INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Similar changes for other tables...

-- PostgreSQL triggers use different syntax:
CREATE OR REPLACE FUNCTION update_discord_guilds_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_discord_guilds_timestamp
BEFORE UPDATE ON discord_guilds
FOR EACH ROW
EXECUTE FUNCTION update_discord_guilds_timestamp();

*/
