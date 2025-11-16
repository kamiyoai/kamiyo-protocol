-- Audit Logging Table for ERC-8004
-- Comprehensive audit trail for compliance and security

CREATE TABLE IF NOT EXISTS erc8004_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Request metadata
    request_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- User context
    user_id UUID,
    api_key_id UUID,
    ip_address INET,
    user_agent TEXT,

    -- Request details
    method VARCHAR(10) NOT NULL,  -- GET, POST, PUT, DELETE
    endpoint TEXT NOT NULL,
    resource_type VARCHAR(50),  -- agent, feedback, payment_link
    resource_id UUID,  -- agent_uuid, feedback_id, etc.

    -- Action performed
    action VARCHAR(50) NOT NULL,  -- register, update, delete, submit_feedback, link_payment
    status VARCHAR(20) NOT NULL,  -- success, error, denied
    status_code INTEGER,

    -- Changes (for updates)
    old_values JSONB,
    new_values JSONB,

    -- Additional context
    request_body JSONB,
    response_body JSONB,
    error_message TEXT,
    duration_ms INTEGER,

    -- Compliance fields
    requires_review BOOLEAN DEFAULT FALSE,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    review_notes TEXT
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_log_timestamp ON erc8004_audit_log (timestamp DESC);
CREATE INDEX idx_audit_log_user_id ON erc8004_audit_log (user_id, timestamp DESC);
CREATE INDEX idx_audit_log_resource ON erc8004_audit_log (resource_type, resource_id);
CREATE INDEX idx_audit_log_action ON erc8004_audit_log (action, timestamp DESC);
CREATE INDEX idx_audit_log_status ON erc8004_audit_log (status, timestamp DESC);
CREATE INDEX idx_audit_log_request_id ON erc8004_audit_log (request_id);
CREATE INDEX idx_audit_log_review ON erc8004_audit_log (requires_review) WHERE requires_review = TRUE;

-- Partition table by month for better performance
-- (Optional, implement if audit log grows large)
-- CREATE TABLE erc8004_audit_log_2025_01 PARTITION OF erc8004_audit_log
-- FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Function to automatically log agent operations
CREATE OR REPLACE FUNCTION log_agent_operation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO erc8004_audit_log (
            request_id,
            resource_type,
            resource_id,
            action,
            status,
            new_values
        ) VALUES (
            gen_random_uuid(),
            'agent',
            NEW.id,
            'register',
            'success',
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO erc8004_audit_log (
            request_id,
            resource_type,
            resource_id,
            action,
            status,
            old_values,
            new_values
        ) VALUES (
            gen_random_uuid(),
            'agent',
            NEW.id,
            'update',
            'success',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO erc8004_audit_log (
            request_id,
            resource_type,
            resource_id,
            action,
            status,
            old_values
        ) VALUES (
            gen_random_uuid(),
            'agent',
            OLD.id,
            'delete',
            'success',
            to_jsonb(OLD)
        );
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic audit logging
CREATE TRIGGER audit_log_agent_operations
AFTER INSERT OR UPDATE OR DELETE ON erc8004_agents
FOR EACH ROW EXECUTE FUNCTION log_agent_operation();

-- Similar trigger for feedback
CREATE OR REPLACE FUNCTION log_feedback_operation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO erc8004_audit_log (
            request_id,
            resource_type,
            resource_id,
            action,
            status,
            new_values
        ) VALUES (
            gen_random_uuid(),
            'feedback',
            NEW.id,
            'submit_feedback',
            'success',
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Flag revocations for review
        INSERT INTO erc8004_audit_log (
            request_id,
            resource_type,
            resource_id,
            action,
            status,
            old_values,
            new_values,
            requires_review
        ) VALUES (
            gen_random_uuid(),
            'feedback',
            NEW.id,
            'revoke_feedback',
            'success',
            to_jsonb(OLD),
            to_jsonb(NEW),
            NEW.is_revoked AND NOT OLD.is_revoked
        );
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_feedback_operations
AFTER INSERT OR UPDATE ON erc8004_reputation
FOR EACH ROW EXECUTE FUNCTION log_feedback_operation();

-- View for human-readable audit log
CREATE OR REPLACE VIEW v_erc8004_audit_log AS
SELECT
    al.id,
    al.timestamp,
    u.email as user_email,
    al.ip_address,
    al.method || ' ' || al.endpoint as request,
    al.action,
    al.resource_type,
    al.resource_id,
    al.status,
    al.status_code,
    al.duration_ms,
    al.error_message,
    al.requires_review,
    al.reviewed_at,
    CASE
        WHEN al.requires_review AND al.reviewed_at IS NULL THEN 'pending_review'
        WHEN al.requires_review AND al.reviewed_at IS NOT NULL THEN 'reviewed'
        ELSE 'no_review_required'
    END as review_status
FROM erc8004_audit_log al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.timestamp DESC;

-- Audit log summary view for dashboard
CREATE OR REPLACE VIEW v_erc8004_audit_summary AS
SELECT
    date_trunc('hour', timestamp) as hour,
    action,
    status,
    COUNT(*) as count,
    AVG(duration_ms) as avg_duration_ms,
    COUNT(*) FILTER (WHERE status = 'error') as error_count
FROM erc8004_audit_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour, action, status
ORDER BY hour DESC, count DESC;

-- Retention policy: Keep audit logs for 2 years
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM erc8004_audit_log
    WHERE timestamp < NOW() - INTERVAL '2 years'
    AND reviewed_at IS NOT NULL;  -- Only delete reviewed logs

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (run monthly via cron)
-- 0 0 1 * * psql -c "SELECT cleanup_old_audit_logs();"

-- Grant permissions
GRANT SELECT ON erc8004_audit_log TO readonly_user;
GRANT SELECT ON v_erc8004_audit_log TO readonly_user;
GRANT SELECT ON v_erc8004_audit_summary TO readonly_user;

-- Comments
COMMENT ON TABLE erc8004_audit_log IS 'Comprehensive audit trail for ERC-8004 operations';
COMMENT ON COLUMN erc8004_audit_log.requires_review IS 'Flag for operations requiring manual review (e.g., feedback revocations)';
COMMENT ON FUNCTION cleanup_old_audit_logs() IS 'Removes audit logs older than 2 years (keeps unreviewed logs)';
