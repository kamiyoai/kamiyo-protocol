# Kamiyo Platform - Security Incident Response Plan

**Version:** 1.0
**Last Updated:** October 14, 2025
**Document Owner:** Security Team
**Review Cycle:** Quarterly

---

## Table of Contents

1. [Overview](#1-overview)
2. [Incident Classification](#2-incident-classification)
3. [Response Team Structure](#3-response-team-structure)
4. [Communication Protocols](#4-communication-protocols)
5. [Incident Response Procedures](#5-incident-response-procedures)
6. [Specific Incident Playbooks](#6-specific-incident-playbooks)
7. [Post-Incident Review](#7-post-incident-review)
8. [Contact Information](#8-contact-information)
9. [Appendix](#9-appendix)

---

## 1. Overview

### 1.1 Purpose

This Security Incident Response Plan (IRP) provides structured procedures for identifying, responding to, and recovering from security incidents affecting the Kamiyo platform. The plan ensures:

- **Rapid Detection:** Early identification of security incidents
- **Coordinated Response:** Clear roles and escalation paths
- **Minimal Impact:** Reduced business and customer impact
- **Evidence Preservation:** Maintained forensic integrity
- **Continuous Improvement:** Learning from incidents

### 1.2 Scope

**This plan covers:**
- Payment processing security incidents (PCI DSS Requirement 12.10)
- Authentication and authorization breaches
- Data breaches involving customer information
- API abuse and DDoS attacks
- Infrastructure compromises
- Third-party service incidents (Stripe, AWS, etc.)

**Out of Scope:**
- General IT support issues
- Non-security operational incidents
- Planned maintenance windows

### 1.3 Compliance Requirements

**PCI DSS v4.0 Requirements:**
- **12.10.1:** Incident response plan established and documented
- **12.10.2:** Incident response testing at least annually
- **12.10.3:** Personnel trained on incident response procedures
- **12.10.4:** Incident response plan updated based on lessons learned
- **12.10.5:** Monitoring and alerting procedures in place
- **12.10.6:** Modify and evolve incident response plan

---

## 2. Incident Classification

### 2.1 Severity Levels

#### P0: CRITICAL - Immediate Response Required

**Definition:** Severe impact to payment processing, customer data, or platform availability.

**Examples:**
- Payment card data (PAN) exposure
- Active data breach with confirmed exfiltration
- Complete platform outage (>50% users affected)
- Ransomware or destructive malware
- Compromised payment processing system
- Active DDoS attack preventing service access

**Response Time:** Immediate (15 minutes)
**Escalation:** CEO, CTO, Security Lead, Legal
**Customer Communication:** Within 2 hours (if customer-impacting)

#### P1: HIGH - Urgent Response Required

**Definition:** Significant security risk or moderate business impact.

**Examples:**
- Unauthorized access to production systems
- Suspected data breach (under investigation)
- Compromised user accounts (>10 users)
- Critical vulnerability in production code
- Stripe webhook verification failure
- JWT secret key exposure
- Partial platform outage (10-50% users affected)

**Response Time:** 1 hour
**Escalation:** CTO, Security Lead, DevOps Lead
**Customer Communication:** Within 24 hours (if customer-impacting)

#### P2: MEDIUM - Timely Response Required

**Definition:** Security issue with limited impact or contained risk.

**Examples:**
- Successful brute force attack on single account
- Rate limiting bypass attempt
- Suspicious API activity patterns
- Minor vulnerability in non-critical system
- Failed payment processing (isolated instances)
- Elevated error rates (5-10% above baseline)

**Response Time:** 4 hours
**Escalation:** Security Lead, DevOps on-call
**Customer Communication:** Only if persistent issue

#### P3: LOW - Standard Response

**Definition:** Security issue with minimal risk or informational findings.

**Examples:**
- Security tool alerts (false positives)
- Outdated dependencies with no known exploits
- Security scan findings (non-exploitable)
- Minor configuration issues
- Informational log anomalies

**Response Time:** 24 hours
**Escalation:** Security team during business hours
**Customer Communication:** Not required

---

## 3. Response Team Structure

### 3.1 Incident Commander

**Role:** Overall incident coordination and decision-making authority.

**Responsibilities:**
- Declare incident severity level
- Coordinate response team activities
- Make critical technical decisions
- Authorize emergency changes
- Communicate with executive team
- Approve customer communications

**Primary:** CTO
**Backup:** Security Lead

### 3.2 Security Lead

**Role:** Technical security investigation and response.

**Responsibilities:**
- Conduct technical investigation
- Perform forensic analysis
- Implement security controls
- Coordinate with external security vendors
- Document technical findings
- Recommend remediation actions

**Primary:** Senior Security Engineer
**Backup:** Lead Backend Engineer

### 3.3 DevOps Lead

**Role:** Infrastructure and deployment management.

**Responsibilities:**
- Infrastructure isolation/quarantine
- Emergency deployments and rollbacks
- System restoration and recovery
- Log collection and preservation
- Monitoring and alerting configuration
- Performance impact assessment

**Primary:** DevOps Engineer
**Backup:** Backend Engineer

### 3.4 Communications Lead

**Role:** Internal and external communications.

**Responsibilities:**
- Customer notifications
- Status page updates
- Social media monitoring/response
- Press inquiries (coordinate with PR)
- Internal stakeholder updates
- Regulatory reporting (if required)

**Primary:** Customer Success Manager
**Backup:** Product Manager

### 3.5 Legal/Compliance

**Role:** Regulatory and legal guidance.

**Responsibilities:**
- Regulatory notification requirements
- Legal implications assessment
- Evidence preservation guidance
- Third-party notification requirements
- Insurance claim coordination
- Law enforcement coordination (if needed)

**Contact:** External Legal Counsel
**Email:** legal@kamiyo.ai

---

## 4. Communication Protocols

### 4.1 Internal Communication Channels

#### P0/P1 Incidents

**Primary:** Dedicated Slack Channel `#incident-response`
- Auto-created for each P0/P1 incident
- All response team members added automatically
- Archived after incident closure

**Backup:** Conference Call Bridge
- Zoom: [incident-bridge-link]
- Phone: [backup-phone-number]
- PIN: [secure-pin]

**Status Updates:**
- P0: Every 30 minutes
- P1: Every 2 hours
- P2: Every 4 hours

#### P2/P3 Incidents

**Primary:** Slack `#security-alerts`
**Updates:** As significant developments occur

### 4.2 External Communication

#### Customer Notifications

**Channels:**
- Email to all affected users
- Status page (status.kamiyo.ai)
- In-app banner notification
- Twitter/X @KamiyoAI

**Templates:** See Appendix B

**Approval Process:**
- P0: Incident Commander + CEO
- P1: Incident Commander + Communications Lead
- P2/P3: Communications Lead

#### Regulatory Notifications

**Required Notifications:**

**Payment Card Industry (PCI DSS):**
- **Trigger:** Suspected or confirmed PAN compromise
- **Timeline:** Within 24 hours of discovery
- **Recipients:**
  - Stripe (payment processor): security@stripe.com
  - Acquiring bank
  - Card brands (if confirmed breach)

**Data Breach Notification Laws:**
- **GDPR (EU):** 72 hours to supervisory authority
- **CCPA (California):** Without unreasonable delay
- **Other US States:** Varies by state (30-90 days typically)

**Template Location:** `/docs/templates/regulatory_notifications/`

### 4.3 Escalation Matrix

| Severity | Notify Within | Escalation Path |
|----------|--------------|-----------------|
| **P0** | 15 minutes | On-call → Security Lead → CTO → CEO → Board |
| **P1** | 1 hour | On-call → Security Lead → CTO |
| **P2** | 4 hours | On-call → Security Lead |
| **P3** | 24 hours | Security Team (business hours) |

---

## 5. Incident Response Procedures

### 5.1 Detection & Identification

#### Automated Detection Sources

**Monitoring Systems:**
- ✅ Sentry error tracking (real-time)
- ✅ Prometheus metrics + Grafana dashboards
- ✅ PCI logging filter redaction statistics
- ✅ Rate limiting violation tracking
- ✅ JWT revocation anomalies
- ✅ Stripe API version monitoring
- ✅ Database connection monitoring

**Alert Channels:**
- Discord: `#kamiyo-alerts`
- Slack: `#security-alerts`
- Email: security@kamiyo.ai
- PagerDuty: [configure on-call rotation]

#### Manual Detection Sources

**User Reports:**
- Email: security@kamiyo.ai
- Support tickets tagged "security"
- Twitter/X DMs or mentions
- Bug bounty program submissions

**Third-Party Reports:**
- Stripe security notifications
- AWS security bulletins
- GitHub Dependabot alerts
- Security researcher disclosures

### 5.2 Incident Declaration

**Who Can Declare:**
- Any engineer (for P2/P3)
- Security Lead or above (for P1)
- CTO or CEO (for P0)

**Declaration Process:**

1. **Create Incident Channel:**
   ```
   /incident create severity=[P0|P1|P2|P3] title="Brief description"
   ```

2. **Initial Assessment (5 minutes):**
   - Confirm incident is real (not false positive)
   - Determine preliminary severity
   - Identify systems affected
   - Assess customer impact

3. **Activate Response Team:**
   - Notify Incident Commander
   - Page on-call engineers
   - Add specialists as needed
   - Brief team on situation

4. **Document Initial State:**
   ```
   - Time of detection: [timestamp]
   - Detection source: [monitoring/user/third-party]
   - Affected systems: [list]
   - Customer impact: [yes/no/unknown]
   - Preliminary severity: [P0/P1/P2/P3]
   ```

### 5.3 Containment

**Goals:**
- Stop incident from spreading
- Preserve evidence for investigation
- Minimize customer impact

#### Immediate Actions (First 15 Minutes)

**For Authentication Compromise:**
```bash
# 1. Revoke compromised tokens
python3 scripts/revoke_user_tokens.py --user-id [USER_ID] --reason "security_incident"

# 2. Force password reset
python3 scripts/force_password_reset.py --user-email [EMAIL]

# 3. Enable enhanced monitoring
python3 scripts/enable_user_monitoring.py --user-id [USER_ID]
```

**For Payment Data Compromise:**
```bash
# 1. Alert Stripe immediately
curl -X POST https://api.stripe.com/v1/security/incidents \
  -u sk_live_[KEY]: \
  -d "description=Suspected PAN exposure" \
  -d "incident_type=data_breach"

# 2. Trigger PCI incident response
python3 scripts/pci_incident_response.py --severity critical

# 3. Enable enhanced PCI logging
python3 scripts/enable_pci_audit_mode.py
```

**For Infrastructure Compromise:**
```bash
# 1. Isolate affected instances
aws ec2 modify-instance-attribute \
  --instance-id [ID] \
  --no-source-dest-check \
  --security-groups [ISOLATION_SG]

# 2. Capture forensic snapshot
aws ec2 create-snapshot \
  --volume-id [VOL_ID] \
  --description "Forensic snapshot - Incident [ID]"

# 3. Rotate credentials
python3 scripts/rotate_all_credentials.py --emergency
```

**For DDoS Attack:**
```bash
# 1. Enable aggressive rate limiting
python3 scripts/emergency_rate_limit.py --mode strict

# 2. Activate Cloudflare "Under Attack" mode
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/[ZONE]/settings/security_level" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{"value":"under_attack"}'

# 3. Block attacking IPs
python3 scripts/block_ips.py --from-file attacks.txt
```

#### Containment Checklist

- [ ] Incident spread stopped
- [ ] Affected systems isolated
- [ ] Credentials rotated (if compromised)
- [ ] Evidence preserved (logs, snapshots)
- [ ] Customer impact assessed
- [ ] Status page updated (if P0/P1)
- [ ] Incident Commander briefed

### 5.4 Investigation & Eradication

**Investigation Goals:**
- Determine root cause
- Identify all affected systems
- Assess extent of compromise
- Collect evidence for forensics

#### Investigation Checklist

**Log Analysis:**
- [ ] API access logs (`/var/log/kamiyo/api-*.log`)
- [ ] Authentication logs (JWT manager, auth_helpers)
- [ ] PCI filter logs (redaction statistics)
- [ ] Rate limiting violations
- [ ] Database query logs (if LOG_QUERIES=true)
- [ ] Stripe webhook logs
- [ ] Redis command logs
- [ ] AWS CloudTrail logs

**Forensic Data Collection:**
```bash
# Collect all relevant logs
python3 scripts/collect_incident_logs.py \
  --incident-id [ID] \
  --start-time "2025-10-14T10:00:00Z" \
  --end-time "2025-10-14T12:00:00Z" \
  --output /secure/incidents/[ID]/logs/

# Capture memory dumps (if needed)
sudo python3 scripts/capture_memory_dump.py \
  --process-name "uvicorn" \
  --output /secure/incidents/[ID]/memory/

# Export database audit trail
psql -U varden -d varden_exploits -c \
  "COPY (SELECT * FROM audit_log WHERE timestamp > '2025-10-14') TO '/secure/incidents/[ID]/db_audit.csv' CSV HEADER"
```

**Timeline Reconstruction:**
- Document all actions in chronological order
- Identify first compromised timestamp
- Map attacker lateral movement (if applicable)
- Correlate logs across systems

#### Eradication Actions

**Remove Threat:**
- [ ] Malware/backdoor removal (if found)
- [ ] Revoke all compromised credentials
- [ ] Patch exploited vulnerabilities
- [ ] Remove unauthorized access
- [ ] Close attack vectors

**Verification:**
- [ ] Re-scan systems for indicators of compromise (IOC)
- [ ] Verify no persistent threats remain
- [ ] Confirm all backdoors removed
- [ ] Test security controls functioning

### 5.5 Recovery

**Recovery Goals:**
- Restore normal operations
- Verify system security
- Monitor for reinfection

#### Recovery Checklist

**System Restoration:**
- [ ] Restore from clean backups (if needed)
- [ ] Redeploy applications with security patches
- [ ] Rotate all credentials (JWT secrets, API keys, DB passwords)
- [ ] Reset user passwords (if user data compromised)
- [ ] Update security rules (WAF, rate limits, firewall)

**Testing & Verification:**
```bash
# Run security tests
python3 -m pytest tests/security/ -v

# Verify PCI filter functioning
python3 api/payments/pci_logging_filter.py

# Test authentication flows
python3 tests/test_p1_integration.py

# Load test under controlled conditions
python3 scripts/load_test.py --concurrent 100
```

**Gradual Restoration:**
1. **Phase 1:** Internal testing only (30 minutes)
   - Verify core functionality
   - Test security controls
   - Monitor error rates

2. **Phase 2:** Limited rollout (10% traffic, 1 hour)
   - Monitor key metrics
   - Watch for anomalies
   - Ready to rollback

3. **Phase 3:** Full restoration (100% traffic)
   - Continuous monitoring for 24 hours
   - On-call engineer standing by
   - Incident channel remains active

**Monitoring Enhancement:**
- [ ] Enhanced logging enabled (24-48 hours)
- [ ] Alert thresholds lowered temporarily
- [ ] Daily security reviews (first week)
- [ ] Incident Commander check-ins

### 5.6 Lessons Learned

**Required for P0/P1 Incidents (within 7 days)**
**Optional for P2/P3 Incidents**

See Section 7: Post-Incident Review

---

## 6. Specific Incident Playbooks

### 6.1 Payment Card Data (PAN) Exposure

**Trigger:** PCI filter redaction spike, user report, or confirmed PAN in logs.

**Severity:** P0 (CRITICAL)

**Immediate Actions (0-15 minutes):**

1. **Contain the Exposure:**
   ```bash
   # Stop all payment processing immediately
   python3 scripts/emergency_payment_shutdown.py

   # Rotate Stripe API keys
   python3 scripts/rotate_stripe_keys.py --emergency

   # Enable maximum PCI logging
   python3 scripts/enable_pci_audit_mode.py --level maximum
   ```

2. **Preserve Evidence:**
   ```bash
   # Capture all logs with PAN exposure
   python3 scripts/collect_pan_exposure_logs.py \
     --output /secure/pci-incident-$(date +%Y%m%d)/

   # DO NOT DELETE compromised logs (needed for forensics)
   # Mark them as evidence instead
   ```

3. **Notify Parties:**
   - **Stripe:** security@stripe.com (immediate phone call + email)
   - **Acquiring Bank:** [contact info]
   - **Incident Commander:** Page immediately
   - **Legal Counsel:** Notify within 1 hour

**Investigation (15 minutes - 4 hours):**

4. **Determine Scope:**
   ```bash
   # Analyze PCI filter statistics
   python3 scripts/analyze_pci_redactions.py \
     --start-time [INCIDENT_START] \
     --end-time [INCIDENT_END]

   # Search for PAN patterns in all logs
   python3 scripts/search_pan_exposure.py \
     --deep-scan \
     --quarantine-matches
   ```

5. **Identify Root Cause:**
   - Was PCI filter bypassed? (Code review)
   - Was filter not initialized? (Check startup logs)
   - Was data logged before filter applied? (Check log flow)
   - Third-party logging service? (Check integrations)

**Remediation (4-24 hours):**

6. **Fix the Vulnerability:**
   ```bash
   # Patch code if filter bypass found
   git commit -m "SECURITY: Fix PCI filter bypass"
   git push

   # Emergency deploy
   python3 scripts/emergency_deploy.py --hotfix

   # Verify fix working
   python3 tests/payments/test_pci_compliance.py
   ```

7. **Clean Up Exposed Data:**
   ```bash
   # Redact PAN from all logs retroactively
   python3 scripts/retroactive_pan_redaction.py \
     --start-date [DATE] \
     --dry-run  # Test first

   # Actual redaction (creates audit trail)
   python3 scripts/retroactive_pan_redaction.py \
     --start-date [DATE] \
     --confirm
   ```

**Regulatory Reporting:**

8. **File Required Reports:**
   - **Stripe:** Incident report form (submit via dashboard)
   - **Acquiring Bank:** Within 24 hours (phone + written)
   - **Card Brands:** If confirmed breach (Visa, Mastercard, etc.)
   - **State AGs:** If cardholder residents of breach notification states
   - **Credit Monitoring:** Offer to affected users (if >500 cardholders)

**Post-Incident:**

9. **Enhanced Monitoring (30 days):**
   - Daily PCI filter statistics review
   - Weekly log audits for PAN patterns
   - Increased alert sensitivity
   - External PCI compliance audit

10. **Documentation:**
    - Complete PCI incident report
    - Submit to QSA (Qualified Security Assessor)
    - Update PCI compliance documentation
    - Board notification (if material breach)

---

### 6.2 Compromised User Accounts

**Trigger:** Multiple failed login attempts, unauthorized API activity, user report.

**Severity:**
- P1 if >10 accounts or privileged accounts
- P2 if 1-10 accounts
- P3 if single account with no data access

**Immediate Actions (0-30 minutes):**

1. **Suspend Compromised Accounts:**
   ```bash
   # Revoke all active sessions
   python3 scripts/revoke_user_tokens.py \
     --user-id [USER_ID] \
     --reason "security_incident"

   # Force password reset
   python3 scripts/force_password_reset.py \
     --user-email [EMAIL] \
     --send-notification

   # Enable account monitoring
   python3 scripts/enable_user_monitoring.py \
     --user-id [USER_ID] \
     --duration 72h
   ```

2. **Assess Impact:**
   ```bash
   # Check what data was accessed
   python3 scripts/audit_user_activity.py \
     --user-id [USER_ID] \
     --start-time [COMPROMISE_START] \
     --output incident-[ID]-activity.json

   # Check for API key usage
   python3 scripts/check_api_key_usage.py \
     --user-id [USER_ID] \
     --suspicious-only
   ```

3. **Block Attacker Infrastructure:**
   ```bash
   # Extract attacker IPs from logs
   python3 scripts/extract_attacker_ips.py \
     --user-id [USER_ID] \
     --output attacker-ips.txt

   # Block IPs at multiple layers
   python3 scripts/block_ips.py \
     --from-file attacker-ips.txt \
     --duration 7d

   # Update Cloudflare WAF rules
   python3 scripts/update_cloudflare_waf.py \
     --block-list attacker-ips.txt
   ```

**Investigation (30 minutes - 4 hours):**

4. **Determine Attack Vector:**
   - Credential stuffing? (check for password reuse)
   - Phishing? (ask user about suspicious emails)
   - Brute force? (check failed login attempts)
   - Session hijacking? (check for XSS or MITM)
   - API key leak? (check GitHub, Pastebin)

5. **Check for Lateral Movement:**
   ```bash
   # Did attacker access other accounts?
   python3 scripts/check_lateral_movement.py \
     --attacker-ips [IPS] \
     --start-time [TIME]

   # Check for privilege escalation attempts
   python3 scripts/audit_authorization_changes.py \
     --user-id [USER_ID] \
     --include-failed-attempts
   ```

**Remediation & Recovery:**

6. **Enhanced Security for Affected Users:**
   ```bash
   # Enable 2FA requirement
   python3 scripts/force_2fa_enrollment.py \
     --user-ids [AFFECTED_USER_IDS]

   # Issue new API keys
   python3 scripts/rotate_user_api_keys.py \
     --user-ids [AFFECTED_USER_IDS] \
     --notify
   ```

7. **User Communication:**
   - Send security notification email (see templates)
   - Explain what happened
   - What data was accessed (if any)
   - Steps taken to secure account
   - Recommendations for user (unique passwords, 2FA)

---

### 6.3 DDoS / Rate Limiting Bypass

**Trigger:** Rate limit violations spike, API response times degraded, 429 errors high.

**Severity:**
- P0 if platform completely unavailable
- P1 if significant degradation (>50% users affected)
- P2 if limited impact (<50% users affected)

**Immediate Actions (0-15 minutes):**

1. **Activate Emergency Rate Limiting:**
   ```bash
   # Enable strictest rate limits
   python3 scripts/emergency_rate_limit.py \
     --mode maximum \
     --duration 1h

   # This reduces all tier limits by 90%
   # Allows legitimate traffic while blocking attack
   ```

2. **Identify Attack Pattern:**
   ```bash
   # Extract top offending IPs
   python3 scripts/analyze_rate_limit_violations.py \
     --last 15m \
     --top 100 \
     --output attack-analysis.json

   # Check for distributed attack
   python3 scripts/detect_ddos_pattern.py \
     --output ddos-indicators.json
   ```

3. **Activate Cloudflare Protection:**
   ```bash
   # Enable "Under Attack Mode"
   curl -X PATCH \
     "https://api.cloudflare.com/client/v4/zones/[ZONE]/settings/security_level" \
     -H "Authorization: Bearer [CF_TOKEN]" \
     -d '{"value":"under_attack"}'

   # Enable Bot Fight Mode
   curl -X PATCH \
     "https://api.cloudflare.com/client/v4/zones/[ZONE]/bot_management" \
     -H "Authorization: Bearer [CF_TOKEN]" \
     -d '{"fight_mode":true}'
   ```

**Mitigation (15 minutes - 2 hours):**

4. **Block Attack Sources:**
   ```bash
   # Block attacker IPs/ASNs
   python3 scripts/block_attack_sources.py \
     --from-analysis attack-analysis.json \
     --provider cloudflare

   # Update rate limiter with attack patterns
   python3 scripts/update_rate_limit_rules.py \
     --block-user-agents "BadBot,AttackBot" \
     --block-countries [IF_APPLICABLE]
   ```

5. **Scale Infrastructure:**
   ```bash
   # Auto-scale API instances
   python3 scripts/emergency_scale_up.py \
     --target-instances 20 \
     --wait-for-healthy

   # Increase Redis capacity (if needed)
   python3 scripts/scale_redis.py \
     --size "cache.m5.large"
   ```

**Recovery & Analysis:**

6. **Gradual Relaxation:**
   ```bash
   # After attack subsides, gradually restore normal limits
   python3 scripts/restore_rate_limits.py \
     --mode gradual \
     --duration 2h

   # Monitor for attack resumption
   python3 scripts/monitor_rate_limits.py \
     --alert-on-spike
   ```

7. **Post-Attack Analysis:**
   - Document attack timeline
   - Analyze attack pattern (volumetric, application-layer, etc.)
   - Calculate cost impact (bandwidth, compute)
   - Review effectiveness of defenses
   - Update playbook with lessons learned

---

### 6.4 JWT Secret Exposure

**Trigger:** JWT_SECRET found in logs, GitHub, or reported by security researcher.

**Severity:** P1 (HIGH)

**Immediate Actions (0-30 minutes):**

1. **Generate New Secret:**
   ```bash
   # Generate cryptographically secure secret
   python3 -c "import secrets; print(secrets.token_urlsafe(64))"
   > NEW_JWT_SECRET

   # Store in secure secrets manager
   python3 scripts/update_secret.py \
     --key JWT_SECRET \
     --value-from-file NEW_JWT_SECRET \
     --provider aws-secrets-manager
   ```

2. **Initiate Secret Rotation:**
   ```bash
   # Start zero-downtime rotation
   python3 scripts/rotate_jwt_secret.py \
     --new-secret $(cat NEW_JWT_SECRET) \
     --grace-period 300  # 5 minutes

   # This makes API validate with BOTH old and new secrets
   # Allows in-flight requests to complete
   ```

3. **Revoke High-Value Tokens:**
   ```bash
   # Revoke all admin tokens
   python3 scripts/revoke_tokens_by_tier.py \
     --tiers enterprise,team \
     --reason "secret_rotation"

   # Revoke long-lived tokens (>24h old)
   python3 scripts/revoke_old_tokens.py \
     --older-than 24h \
     --reason "secret_rotation"
   ```

**Investigation (30 minutes - 2 hours):**

4. **Determine Exposure Scope:**
   - Where was secret exposed? (GitHub, logs, Slack, etc.)
   - How long was it exposed?
   - Who had access to exposed location?
   - Were any tokens generated with compromised secret?

5. **Check for Exploitation:**
   ```bash
   # Search for forged tokens
   python3 scripts/detect_forged_tokens.py \
     --suspect-secret [OLD_SECRET] \
     --start-time [EXPOSURE_TIME]

   # Analyze authentication patterns
   python3 scripts/analyze_auth_anomalies.py \
     --during-exposure
   ```

**Complete Rotation (2-4 hours):**

6. **Full Secret Rotation:**
   ```bash
   # After grace period, remove old secret
   python3 scripts/complete_rotation.py \
     --verify-no-old-tokens

   # Force all users to refresh tokens
   # (Access tokens expire in 60 minutes anyway)

   # Optionally: force immediate re-auth for critical users
   python3 scripts/force_reauth.py \
     --tiers enterprise,team
   ```

7. **Remove Exposed Secret:**
   - Delete from GitHub history (BFG Repo-Cleaner)
   - Purge from logs
   - Remove from Slack history
   - Notify GitHub Security (if in public repo)

**Post-Incident:**

8. **Prevent Future Exposure:**
   - Add JWT_SECRET to `.gitignore` check
   - Enable git-secrets pre-commit hook
   - Review secret management procedures
   - Audit all developers' local .env files

---

### 6.5 Database Compromise

**Trigger:** Unauthorized database access, suspicious queries, data exfiltration detected.

**Severity:** P0 (CRITICAL)

**Immediate Actions (0-15 minutes):**

1. **Isolate Database:**
   ```bash
   # Restrict DB access to known-good IPs only
   python3 scripts/emergency_db_lockdown.py \
     --allow-ips [API_SERVER_IPS]

   # Terminate suspicious connections
   psql -U varden -c \
     "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE application_name != 'kamiyo-api';"

   # Enable query logging (if not already enabled)
   psql -U varden -c \
     "ALTER SYSTEM SET log_statement = 'all';"
   ```

2. **Capture Forensic Snapshot:**
   ```bash
   # AWS RDS snapshot
   aws rds create-db-snapshot \
     --db-instance-identifier varden-production \
     --db-snapshot-identifier forensic-$(date +%Y%m%d-%H%M%S)

   # DO NOT modify database until snapshot complete
   ```

3. **Rotate Database Credentials:**
   ```bash
   # Generate new password
   NEW_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

   # Update database user password
   psql -U postgres -c \
     "ALTER USER varden WITH PASSWORD '$NEW_PASSWORD';"

   # Update application config
   python3 scripts/update_db_password.py \
     --new-password "$NEW_PASSWORD" \
     --restart-api
   ```

**Investigation (15 minutes - 8 hours):**

4. **Analyze Attack:**
   ```bash
   # Review query logs
   python3 scripts/analyze_db_queries.py \
     --suspicious-only \
     --output db-investigation.json

   # Check for SQL injection
   python3 scripts/detect_sql_injection.py \
     --analyze-logs

   # Identify data accessed/exfiltrated
   python3 scripts/audit_data_access.py \
     --attacker-connection [CONN_ID]
   ```

5. **Determine Entry Point:**
   - SQL injection in application code?
   - Compromised database credentials?
   - Exposed database port (should be firewalled)?
   - Compromised API server?

**Remediation & Recovery:**

6. **Fix Vulnerability:**
   - Patch SQL injection (if found)
   - Enable parameterized queries
   - Review all database queries
   - Add prepared statement enforcement

7. **Restore Security:**
   ```bash
   # Verify firewall rules
   python3 scripts/audit_db_security.py \
     --check-firewall \
     --check-encryption \
     --check-access-controls

   # Enable enhanced monitoring
   python3 scripts/enable_db_monitoring.py \
     --alerts-enabled \
     --duration 30d
   ```

**Regulatory Notification:**

8. **Assess Data Breach:**
   - What data was accessed? (PII, PAN, credentials?)
   - How many users affected?
   - Regulatory notification required?
   - Customer notification required?

---

## 7. Post-Incident Review

### 7.1 Required for P0/P1 Incidents

**Timeline:** Within 7 days of incident closure

**Participants:**
- Incident Commander
- All response team members
- Engineering leadership
- Product/Business stakeholders (if customer-impacting)

### 7.2 Review Agenda

**1. Incident Timeline Review (15 minutes)**
   - Detection timestamp
   - Key events chronologically
   - Resolution timestamp
   - Total incident duration

**2. What Went Well (10 minutes)**
   - Effective detection methods
   - Successful containment actions
   - Good communication examples
   - Helpful tools/procedures

**3. What Could Be Improved (20 minutes)**
   - Detection delays
   - Slow response actions
   - Communication gaps
   - Missing tools/procedures
   - Unclear responsibilities

**4. Root Cause Analysis (15 minutes)**
   - Immediate cause
   - Contributing factors
   - Underlying systemic issues
   - Why wasn't this prevented?

**5. Action Items (15 minutes)**
   - Preventive measures
   - Detection improvements
   - Response process updates
   - Tool/automation needs
   - Training requirements

### 7.3 Post-Incident Report Template

```markdown
# Post-Incident Review: [Incident ID]

**Date:** [YYYY-MM-DD]
**Incident Commander:** [Name]
**Severity:** [P0/P1/P2/P3]
**Duration:** [X hours]
**Customer Impact:** [Yes/No - Description]

## Executive Summary
[2-3 paragraphs explaining what happened, impact, and resolution]

## Timeline
| Time | Event | Actor |
|------|-------|-------|
| 10:15 | Incident detected via monitoring alert | Automated |
| 10:20 | Incident declared P1, team paged | On-call engineer |
| 10:25 | Initial containment actions executed | DevOps |
| ... | ... | ... |

## Impact Assessment
- **Users Affected:** [Number/Percentage]
- **Data Accessed:** [Yes/No - Description]
- **Financial Impact:** [$Amount or N/A]
- **Reputation Impact:** [High/Medium/Low]
- **Regulatory Impact:** [Notifications required? Yes/No]

## Root Cause
[Detailed explanation of the root cause]

**Contributing Factors:**
1. [Factor 1]
2. [Factor 2]

## What Went Well
- [Success 1]
- [Success 2]

## What Could Be Improved
- [Improvement 1]
- [Improvement 2]

## Action Items
| Action | Owner | Priority | Due Date | Status |
|--------|-------|----------|----------|--------|
| [Action 1] | [Name] | P1 | [Date] | Open |
| [Action 2] | [Name] | P2 | [Date] | Open |

## Lessons Learned
[Key takeaways for the organization]

## Appendix
[Links to logs, forensic data, related tickets]
```

### 7.4 Action Item Tracking

**All action items from post-incident reviews must be:**
- Assigned to specific owner
- Given priority (P0/P1/P2/P3)
- Tracked in project management system
- Reviewed in weekly security meetings
- Closed with verification

**No incident considered "fully closed" until all P0/P1 action items completed.**

---

## 8. Contact Information

### 8.1 Internal Contacts

**Incident Response Team:**

| Role | Primary | Backup | Contact |
|------|---------|--------|---------|
| **Incident Commander** | CTO | Security Lead | +1-XXX-XXX-XXXX |
| **Security Lead** | [Name] | [Name] | security@kamiyo.ai |
| **DevOps Lead** | [Name] | [Name] | devops@kamiyo.ai |
| **Communications Lead** | [Name] | [Name] | support@kamiyo.ai |

**Executive Team:**

| Role | Name | Contact |
|------|------|---------|
| **CEO** | [Name] | ceo@kamiyo.ai |
| **CTO** | [Name] | cto@kamiyo.ai |
| **Legal Counsel** | [External] | legal@kamiyo.ai |

### 8.2 External Contacts

**Payment Processing:**

| Service | Contact | Phone | Email |
|---------|---------|-------|-------|
| **Stripe Security** | Security Team | +1-888-926-2289 | security@stripe.com |
| **Acquiring Bank** | [Bank Name] | [Phone] | [Email] |

**Infrastructure:**

| Service | Contact | Support |
|---------|---------|---------|
| **AWS Support** | Enterprise Support | Console + Phone |
| **Cloudflare** | Enterprise Support | Dashboard |
| **Sentry** | Support Team | support@sentry.io |

**Regulatory:**

| Authority | Jurisdiction | Contact |
|-----------|-------------|---------|
| **PCI SSC** | Payment Card Industry | feedback@pcisecuritystandards.org |
| **State AG** | [Your State] | [State AG website] |
| **EU DPA** | GDPR (if applicable) | [Your supervisory authority] |

**Security Services:**

| Service | Purpose | Contact |
|---------|---------|---------|
| **Security Consulting** | Forensics, IR Support | [Vendor] |
| **Legal Counsel** | Regulatory Guidance | [Law Firm] |
| **Cyber Insurance** | Claims | [Insurance Company] |

### 8.3 Emergency Escalation

**Escalation Priority Order:**

1. **On-Call Engineer** (PagerDuty)
2. **Security Lead** (+1-XXX-XXX-XXXX)
3. **CTO** (+1-XXX-XXX-XXXX)
4. **CEO** (+1-XXX-XXX-XXXX) - P0 only

**After-Hours Contact:**
- Use PagerDuty for immediate response
- CEO on call for P0 incidents 24/7
- Legal counsel emergency line: [Phone]

---

## 9. Appendix

### A. Incident Response Tools

**Installed & Configured:**
- ✅ Sentry (error tracking)
- ✅ Prometheus + Grafana (metrics)
- ✅ PCI logging filter
- ✅ JWT manager with revocation
- ✅ Rate limiting middleware
- ✅ Alert system (Discord, Slack, Email)

**Scripts Location:**
- `/scripts/incident_response/` - All IR automation scripts
- `/scripts/security/` - Security-specific tools
- `/scripts/monitoring/` - Monitoring and alerting

**Documentation:**
- `/docs/security/` - Security procedures
- `/docs/runbooks/` - System runbooks
- `/docs/architecture/` - System architecture diagrams

### B. Communication Templates

**Status Page Template:**
```
[INVESTIGATING] We are currently investigating reports of [issue description].
We will provide updates every [X] minutes.

Last Update: [Timestamp]
```

**Customer Email Template (Incident):**
```
Subject: [Action Required] Security Notification - Kamiyo Platform

Dear Kamiyo User,

We are writing to inform you of a security incident that may have affected
your account. [Brief description of incident].

WHAT HAPPENED:
[Clear, non-technical explanation]

WHAT DATA WAS AFFECTED:
[Specific data types, if known]

WHAT WE'VE DONE:
[Steps taken to resolve]

WHAT YOU SHOULD DO:
1. [Action 1]
2. [Action 2]

We take security seriously and apologize for any concern this may cause.
If you have questions, please contact security@kamiyo.ai.

Sincerely,
Kamiyo Security Team
```

**Regulatory Notification Template:**
See `/docs/templates/regulatory_notifications/` for jurisdiction-specific templates.

### C. Useful Commands Cheat Sheet

**Emergency Response:**
```bash
# Declare incident
/incident create severity=P0 title="Brief description"

# Revoke user tokens
python3 scripts/revoke_user_tokens.py --user-id [ID]

# Emergency rate limit
python3 scripts/emergency_rate_limit.py --mode strict

# Rotate JWT secret
python3 scripts/rotate_jwt_secret.py --new-secret [SECRET]

# Block IPs
python3 scripts/block_ips.py --from-file [FILE]

# Collect logs
python3 scripts/collect_incident_logs.py --incident-id [ID]
```

**Investigation:**
```bash
# Analyze PCI filter
python3 scripts/analyze_pci_redactions.py --last 24h

# Check user activity
python3 scripts/audit_user_activity.py --user-id [ID]

# Detect attack patterns
python3 scripts/detect_ddos_pattern.py --output [FILE]

# Search for SQL injection
python3 scripts/detect_sql_injection.py --analyze-logs
```

**Recovery:**
```bash
# Restore normal rate limits
python3 scripts/restore_rate_limits.py --mode gradual

# Verify security controls
python3 -m pytest tests/security/ -v

# Scale down infrastructure
python3 scripts/scale_down.py --to-normal-capacity

# Close incident
/incident close [ID] --post-mortem-required
```

### D. Training & Testing

**Required Training:**
- All engineers: Incident response basics (annually)
- On-call engineers: Full IR training (quarterly)
- Security team: Advanced IR training (quarterly)
- Leadership: Executive IR briefing (annually)

**Testing Schedule:**
- **Tabletop Exercises:** Quarterly
- **Simulated Incidents:** Bi-annually
- **Full DR Test:** Annually

**Next Training:** [Schedule quarterly sessions]

### E. Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-14 | Agent ALPHA-SECURITY | Initial creation |
| | | | |

**Review Schedule:** Quarterly (January, April, July, October)

**Next Review Due:** January 14, 2026

---

**END OF INCIDENT RESPONSE PLAN**

*This document is confidential and intended for Kamiyo staff only.*
*Do not distribute outside the organization.*
