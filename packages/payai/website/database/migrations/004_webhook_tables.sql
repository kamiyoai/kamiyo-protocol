-- Migration 004: Stripe Webhook Tables
-- Day 8: Webhook event tracking and processing
-- Created: 2025-10-07

-- ==========================================
-- WEBHOOK EVENTS TABLE
-- ==========================================
-- Stores all incoming webhook events for audit trail and idempotent processing

CREATE TABLE IF NOT EXISTS webhook_events (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL UNIQUE,  -- Stripe event ID (e.g., evt_...)
    event_type VARCHAR(100) NOT NULL,        -- Event type (e.g., customer.created)
    payload JSONB NOT NULL,                  -- Full event payload from Stripe
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, processing, processed, failed
    processing_attempts INTEGER DEFAULT 0,   -- Number of processing attempts
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,                  -- When processing completed
    CONSTRAINT webhook_events_status_check CHECK (status IN ('pending', 'processing', 'processed', 'failed'))
);

-- Indexes for webhook_events
CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);
CREATE INDEX idx_webhook_events_type_status ON webhook_events(event_type, status);

-- Composite index for finding unprocessed events
CREATE INDEX idx_webhook_events_unprocessed ON webhook_events(status, created_at)
    WHERE status IN ('pending', 'failed');

-- GIN index for JSONB payload queries
CREATE INDEX idx_webhook_events_payload ON webhook_events USING GIN(payload);

COMMENT ON TABLE webhook_events IS 'Stores all Stripe webhook events for idempotent processing';
COMMENT ON COLUMN webhook_events.event_id IS 'Unique Stripe event ID (evt_...)';
COMMENT ON COLUMN webhook_events.event_type IS 'Stripe event type (e.g., customer.subscription.updated)';
COMMENT ON COLUMN webhook_events.payload IS 'Full JSON payload from Stripe webhook';
COMMENT ON COLUMN webhook_events.status IS 'Processing status: pending, processing, processed, failed';


-- ==========================================
-- WEBHOOK FAILURES TABLE
-- ==========================================
-- Tracks failed webhook processing attempts for retry logic

CREATE TABLE IF NOT EXISTS webhook_failures (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,          -- References webhook_events.event_id
    error_message TEXT NOT NULL,             -- Error message from failure
    error_type VARCHAR(100),                 -- Type of error (validation, database, stripe_api, etc.)
    stack_trace TEXT,                        -- Full stack trace for debugging
    retry_count INTEGER DEFAULT 0,           -- Number of retry attempts
    last_retry_at TIMESTAMP,                 -- When last retry was attempted
    next_retry_at TIMESTAMP,                 -- When next retry is scheduled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES webhook_events(event_id) ON DELETE CASCADE
);

-- Indexes for webhook_failures
CREATE INDEX idx_webhook_failures_event_id ON webhook_failures(event_id);
CREATE INDEX idx_webhook_failures_retry_count ON webhook_failures(retry_count);
CREATE INDEX idx_webhook_failures_next_retry ON webhook_failures(next_retry_at);
CREATE INDEX idx_webhook_failures_error_type ON webhook_failures(error_type);

-- Index for finding events to retry
CREATE INDEX idx_webhook_failures_retry_queue ON webhook_failures(next_retry_at, retry_count)
    WHERE next_retry_at IS NOT NULL AND retry_count < 5;

COMMENT ON TABLE webhook_failures IS 'Tracks failed webhook processing attempts with retry information';
COMMENT ON COLUMN webhook_failures.retry_count IS 'Number of retry attempts (max 5)';
COMMENT ON COLUMN webhook_failures.next_retry_at IS 'Scheduled time for next retry attempt';


-- ==========================================
-- WEBHOOK PROCESSING LOG TABLE
-- ==========================================
-- Detailed log of each processing attempt for debugging

CREATE TABLE IF NOT EXISTS webhook_processing_log (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    processor_name VARCHAR(100) NOT NULL,    -- Which processor handled this event
    status VARCHAR(50) NOT NULL,             -- success, failure, skipped
    duration_ms INTEGER,                     -- Processing duration in milliseconds
    message TEXT,                            -- Log message or error
    metadata JSONB,                          -- Additional context
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES webhook_events(event_id) ON DELETE CASCADE
);

-- Indexes for webhook_processing_log
CREATE INDEX idx_webhook_processing_log_event_id ON webhook_processing_log(event_id);
CREATE INDEX idx_webhook_processing_log_processor ON webhook_processing_log(processor_name);
CREATE INDEX idx_webhook_processing_log_status ON webhook_processing_log(status);
CREATE INDEX idx_webhook_processing_log_created_at ON webhook_processing_log(created_at DESC);

COMMENT ON TABLE webhook_processing_log IS 'Detailed log of webhook processing attempts';
COMMENT ON COLUMN webhook_processing_log.processor_name IS 'Name of the processor that handled the event';
COMMENT ON COLUMN webhook_processing_log.duration_ms IS 'Processing time in milliseconds';


-- ==========================================
-- ADD WEBHOOK COLUMNS TO EXISTING TABLES
-- ==========================================
-- Track which webhook events updated customers/subscriptions

-- Add webhook tracking to customers table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'last_webhook_event_id'
    ) THEN
        ALTER TABLE customers
        ADD COLUMN last_webhook_event_id VARCHAR(255),
        ADD COLUMN last_webhook_updated_at TIMESTAMP;

        CREATE INDEX idx_customers_last_webhook ON customers(last_webhook_event_id);
    END IF;
END $$;

-- Add webhook tracking to subscriptions table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'last_webhook_event_id'
    ) THEN
        ALTER TABLE subscriptions
        ADD COLUMN last_webhook_event_id VARCHAR(255),
        ADD COLUMN last_webhook_updated_at TIMESTAMP;

        CREATE INDEX idx_subscriptions_last_webhook ON subscriptions(last_webhook_event_id);
    END IF;
END $$;

-- Add webhook tracking to payment_methods table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods' AND column_name = 'last_webhook_event_id'
    ) THEN
        ALTER TABLE payment_methods
        ADD COLUMN last_webhook_event_id VARCHAR(255),
        ADD COLUMN last_webhook_updated_at TIMESTAMP;

        CREATE INDEX idx_payment_methods_last_webhook ON payment_methods(last_webhook_event_id);
    END IF;
END $$;


-- ==========================================
-- WEBHOOK STATISTICS VIEW
-- ==========================================
-- Aggregated view of webhook processing stats

CREATE OR REPLACE VIEW webhook_statistics AS
SELECT
    event_type,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE status = 'processed') as processed_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000)::numeric, 2) as avg_processing_time_ms,
    MAX(created_at) as last_event_at
FROM webhook_events
GROUP BY event_type
ORDER BY total_events DESC;

COMMENT ON VIEW webhook_statistics IS 'Aggregated statistics for webhook event processing';


-- ==========================================
-- WEBHOOK HEALTH CHECK VIEW
-- ==========================================
-- Check for webhook processing issues

CREATE OR REPLACE VIEW webhook_health_check AS
SELECT
    'old_pending_events' as check_name,
    COUNT(*) as count,
    CASE
        WHEN COUNT(*) = 0 THEN 'healthy'
        WHEN COUNT(*) < 10 THEN 'warning'
        ELSE 'critical'
    END as status
FROM webhook_events
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour'

UNION ALL

SELECT
    'high_failure_rate' as check_name,
    COUNT(*) FILTER (WHERE status = 'failed') as count,
    CASE
        WHEN COUNT(*) FILTER (WHERE status = 'failed')::float / NULLIF(COUNT(*), 0) < 0.01 THEN 'healthy'
        WHEN COUNT(*) FILTER (WHERE status = 'failed')::float / NULLIF(COUNT(*), 0) < 0.05 THEN 'warning'
        ELSE 'critical'
    END as status
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT
    'events_stuck_processing' as check_name,
    COUNT(*) as count,
    CASE
        WHEN COUNT(*) = 0 THEN 'healthy'
        WHEN COUNT(*) < 5 THEN 'warning'
        ELSE 'critical'
    END as status
FROM webhook_events
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '10 minutes';

COMMENT ON VIEW webhook_health_check IS 'Health check for webhook processing system';


-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to clean up old processed webhook events (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_events
    WHERE status = 'processed'
      AND processed_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_webhook_events IS 'Deletes processed webhook events older than 30 days';


-- Function to retry failed webhook events
CREATE OR REPLACE FUNCTION reset_failed_webhook_for_retry(p_event_id VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    -- Update event status back to pending
    UPDATE webhook_events
    SET status = 'pending',
        processing_attempts = processing_attempts + 1
    WHERE event_id = p_event_id
      AND status = 'failed';

    -- Update failure record
    UPDATE webhook_failures
    SET retry_count = retry_count + 1,
        last_retry_at = NOW(),
        next_retry_at = NOW() + INTERVAL '5 minutes' * POWER(2, retry_count)  -- Exponential backoff
    WHERE event_id = p_event_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_failed_webhook_for_retry IS 'Resets a failed webhook event for retry with exponential backoff';


-- ==========================================
-- INITIAL DATA & STATS
-- ==========================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 004: Webhook tables created successfully';
    RAISE NOTICE 'Tables created: webhook_events, webhook_failures, webhook_processing_log';
    RAISE NOTICE 'Views created: webhook_statistics, webhook_health_check';
    RAISE NOTICE 'Functions created: cleanup_old_webhook_events, reset_failed_webhook_for_retry';
END $$;
