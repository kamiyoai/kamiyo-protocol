-- PostgreSQL Migration: Payment Tables for Stripe Integration
-- Version: 2.0
-- Day 6: Stripe API Integration
-- Creates tables for customers, subscriptions, payments, and payment methods

-- ==========================================
-- CUSTOMERS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

COMMENT ON TABLE customers IS 'Stripe customers linked to Kamiyo users';
COMMENT ON COLUMN customers.stripe_customer_id IS 'Stripe customer ID (cus_...)';
COMMENT ON COLUMN customers.user_id IS 'Link to users table';
COMMENT ON COLUMN customers.metadata IS 'Additional metadata stored as JSON';

-- ==========================================
-- SUBSCRIPTIONS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    tier VARCHAR(50) NOT NULL,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

COMMENT ON TABLE subscriptions IS 'Active and historical subscriptions';
COMMENT ON COLUMN subscriptions.stripe_subscription_id IS 'Stripe subscription ID (sub_...)';
COMMENT ON COLUMN subscriptions.status IS 'Subscription status: active, canceled, past_due, etc.';
COMMENT ON COLUMN subscriptions.tier IS 'Subscription tier: basic, pro, enterprise';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'Whether subscription will cancel at period end';

-- ==========================================
-- PAYMENTS HISTORY TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS payments_history (
    id SERIAL PRIMARY KEY,
    stripe_payment_id VARCHAR(255) UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL,
    subscription_id INTEGER,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'usd',
    status VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
);

COMMENT ON TABLE payments_history IS 'Complete payment transaction history from Stripe';
COMMENT ON COLUMN payments_history.stripe_payment_id IS 'Stripe payment intent ID (pi_...) or charge ID (ch_...)';
COMMENT ON COLUMN payments_history.status IS 'Payment status: succeeded, failed, pending, refunded';
COMMENT ON COLUMN payments_history.amount IS 'Payment amount in dollars';

-- ==========================================
-- PAYMENT METHODS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    card_brand VARCHAR(50),
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

COMMENT ON TABLE payment_methods IS 'Stored payment methods for customers';
COMMENT ON COLUMN payment_methods.stripe_payment_method_id IS 'Stripe payment method ID (pm_...)';
COMMENT ON COLUMN payment_methods.type IS 'Payment method type: card, bank_account, etc.';
COMMENT ON COLUMN payment_methods.is_default IS 'Whether this is the default payment method';

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

-- Customers indexes
CREATE INDEX idx_customers_stripe_id ON customers(stripe_customer_id);
CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_customers_email ON customers(email);

-- Subscriptions indexes
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_tier ON subscriptions(tier);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- Payments history indexes
CREATE INDEX idx_payments_stripe_id ON payments_history(stripe_payment_id);
CREATE INDEX idx_payments_customer_id ON payments_history(customer_id);
CREATE INDEX idx_payments_subscription_id ON payments_history(subscription_id);
CREATE INDEX idx_payments_status ON payments_history(status);
CREATE INDEX idx_payments_created_at ON payments_history(created_at DESC);

-- Payment methods indexes
CREATE INDEX idx_payment_methods_stripe_id ON payment_methods(stripe_payment_method_id);
CREATE INDEX idx_payment_methods_customer_id ON payment_methods(customer_id);
CREATE INDEX idx_payment_methods_is_default ON payment_methods(is_default);

-- ==========================================
-- VIEWS FOR COMMON QUERIES
-- ==========================================

-- Active subscriptions view
CREATE OR REPLACE VIEW v_active_subscriptions AS
SELECT
    s.id,
    s.stripe_subscription_id,
    s.customer_id,
    c.stripe_customer_id,
    c.email,
    s.tier,
    s.status,
    s.current_period_start,
    s.current_period_end,
    s.cancel_at_period_end,
    s.created_at
FROM subscriptions s
JOIN customers c ON s.customer_id = c.id
WHERE s.status IN ('active', 'trialing')
ORDER BY s.created_at DESC;

COMMENT ON VIEW v_active_subscriptions IS 'All currently active subscriptions with customer details';

-- Revenue by tier view
CREATE OR REPLACE VIEW v_revenue_by_tier AS
SELECT
    s.tier,
    COUNT(DISTINCT s.id) as subscription_count,
    SUM(ph.amount) as total_revenue,
    AVG(ph.amount) as average_payment,
    COUNT(ph.id) as payment_count
FROM subscriptions s
LEFT JOIN payments_history ph ON s.id = ph.subscription_id AND ph.status = 'succeeded'
GROUP BY s.tier
ORDER BY total_revenue DESC;

COMMENT ON VIEW v_revenue_by_tier IS 'Revenue statistics broken down by subscription tier';

-- Customer lifetime value view
CREATE OR REPLACE VIEW v_customer_lifetime_value AS
SELECT
    c.id,
    c.email,
    c.stripe_customer_id,
    COUNT(DISTINCT s.id) as subscription_count,
    SUM(CASE WHEN ph.status = 'succeeded' THEN ph.amount ELSE 0 END) as total_paid,
    MAX(ph.created_at) as last_payment_date,
    MAX(s.created_at) as last_subscription_date
FROM customers c
LEFT JOIN subscriptions s ON c.id = s.customer_id
LEFT JOIN payments_history ph ON c.id = ph.customer_id
GROUP BY c.id, c.email, c.stripe_customer_id
ORDER BY total_paid DESC;

COMMENT ON VIEW v_customer_lifetime_value IS 'Customer value metrics including total paid and subscription history';

-- Subscription churn view (last 30 days)
CREATE OR REPLACE VIEW v_subscription_churn_30d AS
SELECT
    tier,
    COUNT(*) as canceled_count,
    ROUND(100.0 * COUNT(*) / NULLIF((
        SELECT COUNT(*) FROM subscriptions s2
        WHERE s2.tier = subscriptions.tier
    ), 0), 2) as churn_rate_percent
FROM subscriptions
WHERE canceled_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY tier
ORDER BY churn_rate_percent DESC;

COMMENT ON VIEW v_subscription_churn_30d IS 'Subscription cancellation metrics for last 30 days';

-- ==========================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ==========================================

-- Update customers updated_at timestamp
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update subscriptions updated_at timestamp
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- UPDATE USERS TABLE
-- ==========================================

-- Add Stripe-related columns to users table if they don't exist
DO $$
BEGIN
    -- Check if stripe_customer_id exists in users table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'stripe_customer_id'
    ) THEN
        -- Column already exists from migration 001, but ensure it's nullable
        ALTER TABLE users ALTER COLUMN stripe_customer_id DROP NOT NULL;
    END IF;

    -- Add subscription_tier if not exists (might be 'tier' in original schema)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'subscription_tier'
    ) THEN
        -- Use existing 'tier' column
        COMMENT ON COLUMN users.tier IS 'Current subscription tier: free, basic, pro, enterprise';
    END IF;
END $$;

-- ==========================================
-- CONSTRAINTS AND VALIDATION
-- ==========================================

-- Ensure subscription tier is valid
ALTER TABLE subscriptions ADD CONSTRAINT check_subscription_tier
    CHECK (tier IN ('basic', 'pro', 'enterprise'));

-- Ensure subscription status is valid
ALTER TABLE subscriptions ADD CONSTRAINT check_subscription_status
    CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'));

-- Ensure payment status is valid
ALTER TABLE payments_history ADD CONSTRAINT check_payment_status
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded'));

-- Ensure payment method type is valid
ALTER TABLE payment_methods ADD CONSTRAINT check_payment_method_type
    CHECK (type IN ('card', 'bank_account', 'us_bank_account', 'sepa_debit'));

-- Ensure only one default payment method per customer
CREATE UNIQUE INDEX idx_payment_methods_customer_default
    ON payment_methods(customer_id)
    WHERE is_default = TRUE;

-- ==========================================
-- SAMPLE DATA FOR TESTING (Optional)
-- ==========================================

-- Uncomment to insert test data
/*
-- Test customer
INSERT INTO customers (stripe_customer_id, user_id, email, name, metadata)
VALUES ('cus_test_123', 1, 'test@example.com', 'Test User', '{"test": true}')
ON CONFLICT (stripe_customer_id) DO NOTHING;

-- Test subscription
INSERT INTO subscriptions (
    stripe_subscription_id, customer_id, status, tier,
    current_period_start, current_period_end, cancel_at_period_end
)
SELECT
    'sub_test_123',
    id,
    'active',
    'pro',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '1 month',
    FALSE
FROM customers WHERE stripe_customer_id = 'cus_test_123'
ON CONFLICT (stripe_subscription_id) DO NOTHING;
*/

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 002_payment_tables.sql completed successfully';
    RAISE NOTICE 'Created tables: customers, subscriptions, payments_history, payment_methods';
    RAISE NOTICE 'Created views: v_active_subscriptions, v_revenue_by_tier, v_customer_lifetime_value, v_subscription_churn_30d';
    RAISE NOTICE 'Created indexes for all tables';
    RAISE NOTICE 'Created triggers for automatic timestamp updates';
END $$;
