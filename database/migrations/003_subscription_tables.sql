-- =====================================================
-- Migration 003: Subscription Management Tables
-- Created: 2025-10-07
-- Description: Tables for subscription tiers, user subscriptions, and usage tracking
-- =====================================================

-- Create subscription_tiers table
CREATE TABLE IF NOT EXISTS subscription_tiers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    price_monthly_usd DECIMAL(10, 2) NOT NULL,

    -- Rate Limits
    api_requests_per_day INTEGER NOT NULL,
    api_requests_per_hour INTEGER NOT NULL,
    api_requests_per_minute INTEGER NOT NULL,

    -- Alert Features
    email_alerts BOOLEAN DEFAULT TRUE,
    discord_alerts BOOLEAN DEFAULT FALSE,
    telegram_alerts BOOLEAN DEFAULT FALSE,
    webhook_alerts BOOLEAN DEFAULT FALSE,

    -- Data Access
    historical_data_days INTEGER NOT NULL,
    real_time_alerts BOOLEAN DEFAULT FALSE,

    -- Support
    support_level VARCHAR(50) NOT NULL,

    -- Advanced Features
    custom_integrations BOOLEAN DEFAULT FALSE,
    dedicated_account_manager BOOLEAN DEFAULT FALSE,
    sla_guarantee BOOLEAN DEFAULT FALSE,
    white_label BOOLEAN DEFAULT FALSE,

    -- Export Features
    csv_export BOOLEAN DEFAULT TRUE,
    json_export BOOLEAN DEFAULT TRUE,
    api_access BOOLEAN DEFAULT TRUE,

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on tier name
CREATE INDEX idx_subscription_tiers_name ON subscription_tiers(name);

-- Insert default tiers
INSERT INTO subscription_tiers
(name, display_name, price_monthly_usd, api_requests_per_day, api_requests_per_hour,
 api_requests_per_minute, email_alerts, discord_alerts, telegram_alerts, webhook_alerts,
 historical_data_days, real_time_alerts, support_level, custom_integrations,
 dedicated_account_manager, sla_guarantee, white_label)
VALUES
    -- Free Tier
    ('free', 'Free', 0.00, 100, 20, 5, TRUE, FALSE, FALSE, FALSE, 7, FALSE, 'community', FALSE, FALSE, FALSE, FALSE),

    -- Basic Tier
    ('basic', 'Basic', 29.00, 1000, 100, 10, TRUE, TRUE, FALSE, FALSE, 30, TRUE, 'email', FALSE, FALSE, FALSE, FALSE),

    -- Pro Tier
    ('pro', 'Pro', 99.00, 10000, 1000, 50, TRUE, TRUE, TRUE, TRUE, 90, TRUE, 'priority', FALSE, FALSE, FALSE, FALSE),

    -- Enterprise Tier
    ('enterprise', 'Enterprise', 499.00, 999999, 99999, 1000, TRUE, TRUE, TRUE, TRUE, 36500, TRUE, 'dedicated', TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (name) DO NOTHING;


-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, cancelled, expired, past_due

    -- Stripe Integration
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    stripe_payment_method_id VARCHAR(255),

    -- Billing Period
    current_period_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days',

    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMP,

    -- Trial
    trial_start TIMESTAMP,
    trial_end TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    FOREIGN KEY (tier) REFERENCES subscription_tiers(name),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'trialing'))
);

-- Create indexes for user_subscriptions
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_tier ON user_subscriptions(tier);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);
CREATE INDEX idx_user_subscriptions_stripe_subscription ON user_subscriptions(stripe_subscription_id);
CREATE INDEX idx_user_subscriptions_period_end ON user_subscriptions(current_period_end);

-- Create composite index for active user lookups
CREATE INDEX idx_user_subscriptions_active ON user_subscriptions(user_id, status)
WHERE status = 'active';


-- Create usage_history table (partitioned by month)
CREATE TABLE IF NOT EXISTS usage_history (
    id BIGSERIAL,
    user_id VARCHAR(255) NOT NULL,
    tier VARCHAR(50) NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'GET',
    status_code INTEGER,
    response_time_ms INTEGER,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Metadata
    ip_address INET,
    user_agent TEXT,

    -- Foreign Keys
    FOREIGN KEY (tier) REFERENCES subscription_tiers(name),

    PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

-- Create indexes for usage_history
CREATE INDEX idx_usage_history_user_id ON usage_history(user_id, date);
CREATE INDEX idx_usage_history_tier ON usage_history(tier, date);
CREATE INDEX idx_usage_history_endpoint ON usage_history(endpoint, date);
CREATE INDEX idx_usage_history_timestamp ON usage_history(timestamp);

-- Create partitions for current and next 12 months
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
        partition_name := 'usage_history_' || TO_CHAR(start_date, 'YYYY_MM');

        -- Create partition if it doesn't exist
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF usage_history FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );

        RAISE NOTICE 'Created partition: %', partition_name;
    END LOOP;
END $$;


-- Create subscription_events table for audit trail
CREATE TABLE IF NOT EXISTS subscription_events (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- created, upgraded, downgraded, cancelled, renewed, expired
    old_tier VARCHAR(50),
    new_tier VARCHAR(50),
    stripe_event_id VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    FOREIGN KEY (old_tier) REFERENCES subscription_tiers(name),
    FOREIGN KEY (new_tier) REFERENCES subscription_tiers(name)
);

-- Create indexes for subscription_events
CREATE INDEX idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX idx_subscription_events_type ON subscription_events(event_type);
CREATE INDEX idx_subscription_events_created_at ON subscription_events(created_at DESC);
CREATE INDEX idx_subscription_events_metadata ON subscription_events USING GIN(metadata);


-- Create API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL, -- First few chars for identification
    name VARCHAR(255), -- User-defined name for the key

    -- Permissions
    scopes TEXT[], -- e.g., ['read:exploits', 'write:alerts']

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Usage tracking
    last_used_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,

    -- Expiration
    expires_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for api_keys
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;


-- Create view for subscription analytics
CREATE OR REPLACE VIEW v_subscription_analytics AS
SELECT
    tier,
    COUNT(*) as total_subscriptions,
    COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_subscriptions,
    COUNT(*) FILTER (WHERE cancel_at_period_end = TRUE) as pending_cancellations,
    AVG(EXTRACT(EPOCH FROM (current_period_end - current_period_start)) / 86400) as avg_subscription_days,
    MIN(created_at) as first_subscription_date,
    MAX(created_at) as last_subscription_date
FROM user_subscriptions
GROUP BY tier;


-- Create view for usage analytics
CREATE OR REPLACE VIEW v_usage_analytics AS
SELECT
    DATE_TRUNC('day', timestamp) as day,
    tier,
    COUNT(*) as total_requests,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(response_time_ms) as avg_response_time_ms,
    COUNT(*) FILTER (WHERE status_code < 400) as successful_requests,
    COUNT(*) FILTER (WHERE status_code >= 400) as failed_requests,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_response_time_ms
FROM usage_history
WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', timestamp), tier
ORDER BY day DESC, tier;


-- Create view for tier revenue (monthly)
CREATE OR REPLACE VIEW v_monthly_revenue AS
SELECT
    DATE_TRUNC('month', current_period_start) as month,
    tier,
    COUNT(*) as subscriptions,
    st.price_monthly_usd,
    COUNT(*) * st.price_monthly_usd as monthly_revenue
FROM user_subscriptions us
JOIN subscription_tiers st ON us.tier = st.name
WHERE status = 'active'
GROUP BY DATE_TRUNC('month', current_period_start), tier, st.price_monthly_usd
ORDER BY month DESC, tier;


-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_subscription_tiers_updated_at BEFORE UPDATE ON subscription_tiers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Create function to log subscription events
CREATE OR REPLACE FUNCTION log_subscription_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO subscription_events (user_id, event_type, new_tier, metadata)
        VALUES (NEW.user_id, 'created', NEW.tier, jsonb_build_object('subscription_id', NEW.id));

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.tier != NEW.tier THEN
            IF OLD.tier < NEW.tier THEN
                INSERT INTO subscription_events (user_id, event_type, old_tier, new_tier, metadata)
                VALUES (NEW.user_id, 'upgraded', OLD.tier, NEW.tier, jsonb_build_object('subscription_id', NEW.id));
            ELSE
                INSERT INTO subscription_events (user_id, event_type, old_tier, new_tier, metadata)
                VALUES (NEW.user_id, 'downgraded', OLD.tier, NEW.tier, jsonb_build_object('subscription_id', NEW.id));
            END IF;
        END IF;

        IF OLD.status = 'active' AND NEW.status = 'cancelled' THEN
            INSERT INTO subscription_events (user_id, event_type, old_tier, metadata)
            VALUES (NEW.user_id, 'cancelled', NEW.tier, jsonb_build_object('subscription_id', NEW.id));
        END IF;

        IF OLD.status != 'expired' AND NEW.status = 'expired' THEN
            INSERT INTO subscription_events (user_id, event_type, old_tier, metadata)
            VALUES (NEW.user_id, 'expired', NEW.tier, jsonb_build_object('subscription_id', NEW.id));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for subscription events
CREATE TRIGGER log_subscription_changes AFTER INSERT OR UPDATE ON user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION log_subscription_event();


-- Create function to clean up old usage history (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_usage_history()
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
        AND tablename LIKE 'usage_history_%'
        AND tablename < 'usage_history_' || TO_CHAR(oldest_date, 'YYYY_MM')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I', partition_name);
        RAISE NOTICE 'Dropped old partition: %', partition_name;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT ON subscription_tiers TO kamiyo_app;
-- GRANT ALL ON user_subscriptions TO kamiyo_app;
-- GRANT ALL ON usage_history TO kamiyo_app;
-- GRANT ALL ON subscription_events TO kamiyo_app;
-- GRANT ALL ON api_keys TO kamiyo_app;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 003 completed successfully';
    RAISE NOTICE 'Created tables: subscription_tiers, user_subscriptions, usage_history, subscription_events, api_keys';
    RAISE NOTICE 'Created views: v_subscription_analytics, v_usage_analytics, v_monthly_revenue';
    RAISE NOTICE 'Created functions and triggers for automatic event logging and timestamp updates';
END $$;
