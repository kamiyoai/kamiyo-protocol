-- =====================================================
-- Migration 006: Telegram Integration Tables
-- Created: 2025-10-08
-- Description: Tables for Telegram bot integration, user management, and alert delivery
-- =====================================================

-- Create telegram_users table
CREATE TABLE IF NOT EXISTS telegram_users (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT UNIQUE NOT NULL,
    user_id VARCHAR(255), -- Link to platform user (nullable for unregistered users)
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_blocked BOOLEAN DEFAULT FALSE, -- User blocked the bot

    -- Subscription tier (default to 'free' if not linked to platform user)
    tier VARCHAR(50) DEFAULT 'free',

    -- Metadata
    language_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    FOREIGN KEY (tier) REFERENCES subscription_tiers(name)
);

-- Create indexes for telegram_users
CREATE INDEX idx_telegram_users_chat_id ON telegram_users(chat_id);
CREATE INDEX idx_telegram_users_user_id ON telegram_users(user_id);
CREATE INDEX idx_telegram_users_active ON telegram_users(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_telegram_users_tier ON telegram_users(tier);


-- Create telegram_subscriptions table
CREATE TABLE IF NOT EXISTS telegram_subscriptions (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,

    -- Filter settings
    chains TEXT[], -- e.g., ['Ethereum', 'BSC', 'Polygon']
    min_amount_usd DECIMAL(20, 2) DEFAULT 0,
    protocols TEXT[], -- e.g., ['Uniswap', 'Aave']
    categories TEXT[], -- e.g., ['Flash Loan', 'Reentrancy']

    -- Alert preferences
    instant_alerts BOOLEAN DEFAULT TRUE,
    daily_digest BOOLEAN DEFAULT FALSE,
    weekly_summary BOOLEAN DEFAULT FALSE,

    -- Notification settings
    include_analysis BOOLEAN DEFAULT TRUE,
    include_tx_link BOOLEAN DEFAULT TRUE,
    max_alerts_per_day INTEGER DEFAULT 5, -- Based on tier

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    FOREIGN KEY (chat_id) REFERENCES telegram_users(chat_id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT positive_min_amount CHECK (min_amount_usd >= 0),
    CONSTRAINT positive_max_alerts CHECK (max_alerts_per_day > 0)
);

-- Create indexes for telegram_subscriptions
CREATE INDEX idx_telegram_subscriptions_chat_id ON telegram_subscriptions(chat_id);
CREATE INDEX idx_telegram_subscriptions_active ON telegram_subscriptions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_telegram_subscriptions_chains ON telegram_subscriptions USING GIN(chains);
CREATE INDEX idx_telegram_subscriptions_protocols ON telegram_subscriptions USING GIN(protocols);


-- Create telegram_alerts table (tracks sent alerts)
CREATE TABLE IF NOT EXISTS telegram_alerts (
    id BIGSERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    exploit_id INTEGER NOT NULL, -- Reference to exploits table

    -- Alert details
    message_id BIGINT, -- Telegram message ID
    alert_type VARCHAR(50) NOT NULL, -- instant, digest, summary

    -- Status
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered BOOLEAN DEFAULT TRUE,
    error_message TEXT,

    -- Metadata
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Foreign Keys
    FOREIGN KEY (chat_id) REFERENCES telegram_users(chat_id) ON DELETE CASCADE,
    FOREIGN KEY (exploit_id) REFERENCES exploits(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT valid_alert_type CHECK (alert_type IN ('instant', 'digest', 'summary'))
) PARTITION BY RANGE (date);

-- Create indexes for telegram_alerts
CREATE INDEX idx_telegram_alerts_chat_id ON telegram_alerts(chat_id, date);
CREATE INDEX idx_telegram_alerts_exploit_id ON telegram_alerts(exploit_id);
CREATE INDEX idx_telegram_alerts_sent_at ON telegram_alerts(sent_at DESC);
CREATE INDEX idx_telegram_alerts_type ON telegram_alerts(alert_type);

-- Create partitions for telegram_alerts (current and next 12 months)
DO $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
    month_offset INTEGER;
BEGIN
    FOR month_offset IN 0..12 LOOP
        start_date := DATE_TRUNC('month', CURRENT_DATE + (month_offset || ' months')::INTERVAL);
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'telegram_alerts_' || TO_CHAR(start_date, 'YYYY_MM');

        -- Create partition if it doesn't exist
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF telegram_alerts FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );

        RAISE NOTICE 'Created partition: %', partition_name;
    END LOOP;
END $$;


-- Create telegram_commands table (audit trail of bot commands)
CREATE TABLE IF NOT EXISTS telegram_commands (
    id BIGSERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    command VARCHAR(100) NOT NULL,
    arguments TEXT,

    -- Response
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,

    -- Metadata
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    FOREIGN KEY (chat_id) REFERENCES telegram_users(chat_id) ON DELETE CASCADE
);

-- Create indexes for telegram_commands
CREATE INDEX idx_telegram_commands_chat_id ON telegram_commands(chat_id);
CREATE INDEX idx_telegram_commands_command ON telegram_commands(command);
CREATE INDEX idx_telegram_commands_executed_at ON telegram_commands(executed_at DESC);


-- Create telegram_rate_limits table (track daily alert counts per user)
CREATE TABLE IF NOT EXISTS telegram_rate_limits (
    chat_id BIGINT NOT NULL,
    date DATE NOT NULL,
    alert_count INTEGER DEFAULT 0,

    PRIMARY KEY (chat_id, date),

    -- Foreign Keys
    FOREIGN KEY (chat_id) REFERENCES telegram_users(chat_id) ON DELETE CASCADE
);

-- Create index for telegram_rate_limits
CREATE INDEX idx_telegram_rate_limits_date ON telegram_rate_limits(date);


-- Create view for telegram analytics
CREATE OR REPLACE VIEW v_telegram_analytics AS
SELECT
    tier,
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE is_active = TRUE) as active_users,
    COUNT(*) FILTER (WHERE is_blocked = TRUE) as blocked_users,
    COUNT(*) FILTER (WHERE last_interaction >= CURRENT_TIMESTAMP - INTERVAL '7 days') as weekly_active_users,
    COUNT(*) FILTER (WHERE last_interaction >= CURRENT_TIMESTAMP - INTERVAL '30 days') as monthly_active_users,
    AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 86400) as avg_user_age_days
FROM telegram_users
GROUP BY tier;


-- Create view for telegram alert stats
CREATE OR REPLACE VIEW v_telegram_alert_stats AS
SELECT
    DATE_TRUNC('day', sent_at) as day,
    alert_type,
    COUNT(*) as total_alerts,
    COUNT(DISTINCT chat_id) as unique_users,
    COUNT(*) FILTER (WHERE delivered = TRUE) as successful_alerts,
    COUNT(*) FILTER (WHERE delivered = FALSE) as failed_alerts,
    AVG(CASE WHEN delivered THEN 1 ELSE 0 END) * 100 as delivery_rate
FROM telegram_alerts
WHERE sent_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', sent_at), alert_type
ORDER BY day DESC, alert_type;


-- Create function to check rate limit
CREATE OR REPLACE FUNCTION check_telegram_rate_limit(
    p_chat_id BIGINT,
    p_tier VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
    current_count INTEGER;
    max_alerts INTEGER;
BEGIN
    -- Get max alerts for tier
    SELECT
        CASE
            WHEN p_tier = 'free' THEN 5
            WHEN p_tier = 'basic' THEN 20
            WHEN p_tier = 'pro' THEN 999999
            WHEN p_tier = 'enterprise' THEN 999999
            ELSE 5
        END
    INTO max_alerts;

    -- Get current alert count for today
    SELECT COALESCE(alert_count, 0)
    INTO current_count
    FROM telegram_rate_limits
    WHERE chat_id = p_chat_id AND date = CURRENT_DATE;

    -- Check if under limit
    RETURN current_count < max_alerts;
END;
$$ LANGUAGE plpgsql;


-- Create function to increment rate limit counter
CREATE OR REPLACE FUNCTION increment_telegram_rate_limit(p_chat_id BIGINT)
RETURNS void AS $$
BEGIN
    INSERT INTO telegram_rate_limits (chat_id, date, alert_count)
    VALUES (p_chat_id, CURRENT_DATE, 1)
    ON CONFLICT (chat_id, date)
    DO UPDATE SET alert_count = telegram_rate_limits.alert_count + 1;
END;
$$ LANGUAGE plpgsql;


-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_telegram_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_telegram_users_updated_at BEFORE UPDATE ON telegram_users
    FOR EACH ROW EXECUTE FUNCTION update_telegram_updated_at();

CREATE TRIGGER update_telegram_subscriptions_updated_at BEFORE UPDATE ON telegram_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_telegram_updated_at();


-- Create function to link Telegram user to platform user
CREATE OR REPLACE FUNCTION link_telegram_user(
    p_chat_id BIGINT,
    p_user_id VARCHAR(255)
) RETURNS void AS $$
DECLARE
    user_tier VARCHAR(50);
BEGIN
    -- Get user's subscription tier
    SELECT tier INTO user_tier
    FROM user_subscriptions
    WHERE user_id = p_user_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Default to free if no active subscription
    IF user_tier IS NULL THEN
        user_tier := 'free';
    END IF;

    -- Update telegram user
    UPDATE telegram_users
    SET user_id = p_user_id,
        tier = user_tier,
        updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = p_chat_id;

    -- Update max_alerts_per_day in subscription based on tier
    UPDATE telegram_subscriptions
    SET max_alerts_per_day = CASE
        WHEN user_tier = 'free' THEN 5
        WHEN user_tier = 'basic' THEN 20
        WHEN user_tier = 'pro' THEN 999999
        WHEN user_tier = 'enterprise' THEN 999999
        ELSE 5
    END
    WHERE chat_id = p_chat_id;
END;
$$ LANGUAGE plpgsql;


-- Create function to clean up old telegram alerts (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_telegram_alerts()
RETURNS void AS $$
DECLARE
    partition_name TEXT;
    oldest_date DATE;
BEGIN
    oldest_date := CURRENT_DATE - INTERVAL '90 days';

    FOR partition_name IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'telegram_alerts_%'
        AND tablename < 'telegram_alerts_' || TO_CHAR(oldest_date, 'YYYY_MM')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I', partition_name);
        RAISE NOTICE 'Dropped old partition: %', partition_name;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL ON telegram_users TO kamiyo_app;
-- GRANT ALL ON telegram_subscriptions TO kamiyo_app;
-- GRANT ALL ON telegram_alerts TO kamiyo_app;
-- GRANT ALL ON telegram_commands TO kamiyo_app;
-- GRANT ALL ON telegram_rate_limits TO kamiyo_app;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 006 completed successfully';
    RAISE NOTICE 'Created tables: telegram_users, telegram_subscriptions, telegram_alerts, telegram_commands, telegram_rate_limits';
    RAISE NOTICE 'Created views: v_telegram_analytics, v_telegram_alert_stats';
    RAISE NOTICE 'Created functions: check_telegram_rate_limit, increment_telegram_rate_limit, link_telegram_user, cleanup_old_telegram_alerts';
END $$;
