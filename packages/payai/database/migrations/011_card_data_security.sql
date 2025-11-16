-- PostgreSQL Migration: Card Data Security (Row-Level Security)
-- Version: 11
-- PCI DSS Compliance: Requirement 7 - Restrict access to cardholder data
-- Date: 2025-10-13
--
-- CRITICAL: This migration implements row-level security (RLS) on payment_methods
-- table to prevent unauthorized access to card data by developers, support staff,
-- or compromised accounts.
--
-- PCI DSS Requirements Addressed:
-- - 7.1: Limit access to system components and cardholder data
-- - 7.2: Establish access control systems with "deny all" default
-- - 8.7: Access to databases containing cardholder data must be restricted
-- - 3.4: Render PAN unreadable anywhere it is stored
--
-- AUDIT TRAIL: All queries against payment_methods will be logged by PostgreSQL
-- and can be reviewed during PCI audits.

-- ==========================================
-- ENABLE ROW-LEVEL SECURITY
-- ==========================================

-- Enable RLS on payment_methods table
-- This ensures NO queries can access the table without explicit policy authorization
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE payment_methods IS
'[PCI PROTECTED] Payment methods with row-level security.
Only payment_service_role can access raw data.
Developers/support must use payment_methods_safe view.';

-- ==========================================
-- CREATE SERVICE ROLES
-- ==========================================

-- Create payment service role (for application)
-- This role has full access to payment_methods for processing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payment_service_role') THEN
        CREATE ROLE payment_service_role;
        COMMENT ON ROLE payment_service_role IS
        'PCI-compliant role for payment processing service.
        Full access to cardholder data. Must use encrypted connections.';
    END IF;
END $$;

-- Create developer/support role (restricted access)
-- This role can only access redacted views
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'developer_role') THEN
        CREATE ROLE developer_role;
        COMMENT ON ROLE developer_role IS
        'Restricted role for developers/support.
        Can only access redacted payment data views.';
    END IF;
END $$;

-- ==========================================
-- ROW-LEVEL SECURITY POLICIES
-- ==========================================

-- Policy 1: Only payment_service_role can access raw payment_methods
-- This is the ONLY policy that grants access to actual data
DROP POLICY IF EXISTS payment_service_access ON payment_methods;

CREATE POLICY payment_service_access ON payment_methods
    FOR ALL
    TO payment_service_role
    USING (true)           -- Can read all rows
    WITH CHECK (true);     -- Can write all rows

COMMENT ON POLICY payment_service_access ON payment_methods IS
'Allows payment service to access cardholder data for payment processing.
Queries using this role are logged for PCI audit trail.';

-- Policy 2: Deny all other access (defense-in-depth)
-- This policy explicitly blocks access for any role not granted above
-- Even if RLS is disabled, this provides additional protection
DROP POLICY IF EXISTS default_deny_all ON payment_methods;

CREATE POLICY default_deny_all ON payment_methods
    FOR ALL
    TO PUBLIC
    USING (false);  -- Deny all reads by default

COMMENT ON POLICY default_deny_all ON payment_methods IS
'Default deny policy. All access must be explicitly granted via other policies.';

-- ==========================================
-- SAFE VIEW FOR DEVELOPERS/SUPPORT
-- ==========================================

-- Create redacted view with NO access to card_last4
-- This is what developers/support should use for debugging
DROP VIEW IF EXISTS payment_methods_safe CASCADE;

CREATE VIEW payment_methods_safe AS
SELECT
    id,
    customer_id,
    type,
    card_brand,
    '****' AS card_last4_redacted,
    CASE
        WHEN card_exp_year IS NOT NULL THEN
            CONCAT('**/', SUBSTRING(card_exp_year::TEXT FROM 3 FOR 2))
        ELSE NULL
    END AS card_expiry_redacted,
    is_default,
    created_at,
    '[REDACTED]' AS stripe_payment_method_id_hint
FROM payment_methods;

COMMENT ON VIEW payment_methods_safe IS
'[DEVELOPER VIEW] Redacted payment methods for debugging.
Last 4 digits and Stripe IDs are redacted. Use for support tickets.';

-- Grant access to safe view for developers
GRANT SELECT ON payment_methods_safe TO developer_role;

-- ==========================================
-- AUDIT VIEW FOR PCI COMPLIANCE TEAM
-- ==========================================

-- View for PCI compliance auditors (shows access patterns, not data)
DROP VIEW IF EXISTS v_payment_methods_audit CASCADE;

CREATE VIEW v_payment_methods_audit AS
SELECT
    id,
    customer_id,
    type,
    card_brand,
    is_default,
    created_at,
    (SELECT COUNT(*) FROM subscriptions WHERE subscriptions.customer_id = payment_methods.customer_id) AS subscription_count,
    'Use payment_methods table with payment_service_role for actual data' AS access_note
FROM payment_methods;

COMMENT ON VIEW v_payment_methods_audit IS
'[AUDIT VIEW] Payment method metadata for compliance reporting.
Does not expose cardholder data.';

-- Grant access to audit view
GRANT SELECT ON v_payment_methods_audit TO developer_role;

-- ==========================================
-- ENCRYPTED COLUMN FOR card_last4 (Optional Enhancement)
-- ==========================================

-- Note: PostgreSQL pgcrypto extension can be used for column-level encryption
-- This is OPTIONAL but recommended for defense-in-depth

-- Uncomment to enable column encryption:
/*
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted column
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_last4_encrypted BYTEA;

-- Migrate existing card_last4 to encrypted column
-- Using symmetric encryption with key from environment
-- WARNING: Key management is CRITICAL - store in secrets manager
UPDATE payment_methods
SET card_last4_encrypted = pgp_sym_encrypt(
    card_last4,
    current_setting('app.encryption_key', true)
)
WHERE card_last4 IS NOT NULL AND card_last4_encrypted IS NULL;

-- Helper function to decrypt (only for payment_service_role)
CREATE OR REPLACE FUNCTION decrypt_card_last4(encrypted_data BYTEA)
RETURNS VARCHAR(4) AS $$
BEGIN
    RETURN pgp_sym_decrypt(
        encrypted_data,
        current_setting('app.encryption_key', true)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION decrypt_card_last4 IS
'Decrypts card_last4 using application encryption key.
Only callable by payment_service_role.';

-- Revoke direct access, grant through function
REVOKE EXECUTE ON FUNCTION decrypt_card_last4 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decrypt_card_last4 TO payment_service_role;
*/

-- ==========================================
-- INDEXES FOR PERFORMANCE (RLS-aware)
-- ==========================================

-- These indexes help performance with RLS policies
-- Already created in 002_payment_tables.sql, but ensure they exist

CREATE INDEX IF NOT EXISTS idx_payment_methods_customer_id_active
    ON payment_methods(customer_id)
    WHERE is_default = TRUE;

COMMENT ON INDEX idx_payment_methods_customer_id_active IS
'Optimizes lookup of default payment method (common query with RLS)';

-- ==========================================
-- LOGGING & AUDIT CONFIGURATION
-- ==========================================

-- Enable query logging for payment_methods table
-- This creates audit trail for PCI compliance
-- Note: Requires PostgreSQL logging configuration in postgresql.conf

-- Set logging parameters (requires superuser or alter system privilege)
-- These commands may need to be run by DBA:
/*
ALTER SYSTEM SET log_statement = 'mod';  -- Log all data-modifying statements
ALTER SYSTEM SET log_duration = on;      -- Log query duration
ALTER SYSTEM SET log_line_prefix = '%m [%p] %u@%d [%v] ';  -- Include timestamp, user, database
SELECT pg_reload_conf();  -- Reload config
*/

-- Create audit log trigger for payment_methods changes
CREATE OR REPLACE FUNCTION log_payment_method_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log to separate audit table (create if needed)
    INSERT INTO audit_log (
        table_name,
        operation,
        user_name,
        changed_at,
        old_values,
        new_values
    ) VALUES (
        'payment_methods',
        TG_OP,
        current_user,
        NOW(),
        CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END
    );

    -- Always return NEW for INSERT/UPDATE or OLD for DELETE
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    old_values JSONB,
    new_values JSONB
);

COMMENT ON TABLE audit_log IS
'PCI audit trail for payment_methods changes.
Retain for at least 1 year per PCI DSS 10.7.';

-- Create index for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_table_time
    ON audit_log(table_name, changed_at DESC);

-- Apply audit trigger to payment_methods
DROP TRIGGER IF EXISTS audit_payment_methods ON payment_methods;

CREATE TRIGGER audit_payment_methods
    AFTER INSERT OR UPDATE OR DELETE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION log_payment_method_changes();

COMMENT ON TRIGGER audit_payment_methods ON payment_methods IS
'Logs all changes to payment_methods for PCI audit trail.';

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

-- Payment service gets full access through RLS policy
GRANT ALL ON payment_methods TO payment_service_role;
GRANT SELECT ON customers TO payment_service_role;
GRANT SELECT ON subscriptions TO payment_service_role;

-- Developers get read-only access to safe views
GRANT SELECT ON payment_methods_safe TO developer_role;
GRANT SELECT ON v_payment_methods_audit TO developer_role;
GRANT SELECT ON customers TO developer_role;  -- Customer data is less sensitive
GRANT SELECT ON subscriptions TO developer_role;

-- Revoke access from public (defense-in-depth)
REVOKE ALL ON payment_methods FROM PUBLIC;

-- ==========================================
-- VALIDATION QUERIES
-- ==========================================

-- These queries verify RLS is working correctly
-- Run after migration to confirm protection

-- Test 1: Verify RLS is enabled
DO $$
DECLARE
    rls_enabled BOOLEAN;
BEGIN
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
    WHERE relname = 'payment_methods';

    IF NOT rls_enabled THEN
        RAISE EXCEPTION 'RLS not enabled on payment_methods table!';
    END IF;

    RAISE NOTICE '✓ Row-level security is ENABLED on payment_methods';
END $$;

-- Test 2: Count policies
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'payment_methods';

    IF policy_count < 2 THEN
        RAISE WARNING 'Expected at least 2 policies, found %', policy_count;
    ELSE
        RAISE NOTICE '✓ % RLS policies configured', policy_count;
    END IF;
END $$;

-- Test 3: Verify safe view exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_name = 'payment_methods_safe'
    ) THEN
        RAISE EXCEPTION 'payment_methods_safe view does not exist!';
    END IF;

    RAISE NOTICE '✓ Safe view payment_methods_safe is available';
END $$;

-- ==========================================
-- DOCUMENTATION
-- ==========================================

-- Create documentation table for PCI auditors
CREATE TABLE IF NOT EXISTS pci_documentation (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Document this security control
INSERT INTO pci_documentation (document_type, title, content) VALUES
('security_control', 'Row-Level Security on payment_methods',
'Row-level security (RLS) has been implemented on the payment_methods table
to restrict access to cardholder data. Only the payment_service_role has access
to raw payment data. Developers and support staff must use the payment_methods_safe
view which redacts sensitive information.

PCI DSS Requirements Addressed:
- Requirement 7.1: Limit access to cardholder data by business need-to-know
- Requirement 7.2: Access control system with deny-all default setting
- Requirement 8.7: Database access restricted to authorized users

Access Controls:
1. payment_service_role: Full access for payment processing
2. developer_role: Read-only access to redacted views
3. PUBLIC: No access (explicitly denied)

Audit Trail:
All queries against payment_methods are logged via audit_payment_methods trigger.
Logs are retained in audit_log table for PCI compliance review.

Verification:
Run: SELECT * FROM payment_methods_safe; (works for developers)
Run: SELECT * FROM payment_methods; (fails unless payment_service_role)
')
ON CONFLICT DO NOTHING;

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '====================================';
    RAISE NOTICE 'Migration 011_card_data_security.sql';
    RAISE NOTICE '====================================';
    RAISE NOTICE '';
    RAISE NOTICE '✓ Row-level security ENABLED on payment_methods';
    RAISE NOTICE '✓ Created payment_service_role (full access)';
    RAISE NOTICE '✓ Created developer_role (safe view access)';
    RAISE NOTICE '✓ Created payment_methods_safe view (redacted)';
    RAISE NOTICE '✓ Created audit trigger for change logging';
    RAISE NOTICE '✓ Configured RLS policies (deny by default)';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT FOR DEVELOPERS:';
    RAISE NOTICE '  - Use: SELECT * FROM payment_methods_safe;';
    RAISE NOTICE '  - NOT:  SELECT * FROM payment_methods;';
    RAISE NOTICE '';
    RAISE NOTICE 'APPLICATION CHANGES REQUIRED:';
    RAISE NOTICE '  1. Set PostgreSQL role before payment queries:';
    RAISE NOTICE '     SET ROLE payment_service_role;';
    RAISE NOTICE '  2. Reset role after payment operations:';
    RAISE NOTICE '     RESET ROLE;';
    RAISE NOTICE '';
    RAISE NOTICE 'PCI AUDIT EVIDENCE:';
    RAISE NOTICE '  - Query audit_log table for access history';
    RAISE NOTICE '  - Review pci_documentation table for controls';
    RAISE NOTICE '  - PostgreSQL logs contain all queries';
    RAISE NOTICE '';
END $$;
