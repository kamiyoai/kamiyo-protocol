/**
 * Email Alert System for x402 Infrastructure
 *
 * Sends critical alerts via email using Resend API
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'dev@kamiyo.ai';
const FROM_EMAIL = process.env.FROM_EMAIL || 'alerts@kamiyo.ai';

/**
 * Send email alert
 */
async function sendAlert(subject, message, severity = 'warning') {
  if (!RESEND_API_KEY) {
    console.warn('[EMAIL ALERT]', subject, message);
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ALERT_EMAIL,
        subject: `[${severity.toUpperCase()}] ${subject}`,
        html: formatEmailHTML(subject, message, severity)
      })
    });

    if (!response.ok) {
      throw new Error(`Email send failed: ${response.statusText}`);
    }

    console.log('[EMAIL SENT]', subject);
  } catch (error) {
    console.error('[EMAIL FAILED]', error);
  }
}

/**
 * Format email HTML
 */
function formatEmailHTML(subject, message, severity) {
  const colors = {
    critical: '#dc2626',
    warning: '#f59e0b',
    info: '#3b82f6'
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { background: ${colors[severity] || colors.warning}; color: white; padding: 20px; }
    .content { padding: 20px; }
    .footer { background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
    .timestamp { font-size: 12px; color: rgba(255,255,255,0.8); }
    pre { background: #f3f4f6; padding: 15px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">${subject}</h2>
      <div class="timestamp">${new Date().toISOString()}</div>
    </div>
    <div class="content">
      <pre>${message}</pre>
    </div>
    <div class="footer">
      x402 Infrastructure Monitoring | KAMIYO.AI
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Alert: Service down
 */
export async function alertServiceDown(serviceName, error) {
  await sendAlert(
    `Service Down: ${serviceName}`,
    `Service: ${serviceName}
Status: DOWN
Error: ${error.message}

Stack Trace:
${error.stack}

Action Required:
1. Check service logs in Render dashboard
2. Verify environment variables
3. Check external dependencies (database, RPC endpoints)
4. Restart service if needed`,
    'critical'
  );
}

/**
 * Alert: High error rate
 */
export async function alertHighErrorRate(errorRate, threshold) {
  await sendAlert(
    `High Error Rate Detected`,
    `Current Error Rate: ${errorRate.toFixed(2)}%
Threshold: ${threshold}%
Period: Last 5 minutes

Recent Errors:
${errorRate > 50 ? 'CRITICAL - Over 50% errors' : 'WARNING - Error rate elevated'}

Action Required:
1. Check Sentry for error details
2. Review recent deployments
3. Check for API rate limits or quota exceeded
4. Monitor database performance`,
    errorRate > 50 ? 'critical' : 'warning'
  );
}

/**
 * Alert: Quota warning
 */
export async function alertQuotaWarning(tenant, usagePercent) {
  await sendAlert(
    `Quota Warning: ${tenant.email}`,
    `Tenant: ${tenant.email}
Tier: ${tenant.tier}
Usage: ${usagePercent.toFixed(1)}%
Verifications Used: ${tenant.monthlyVerificationsUsed.toLocaleString()}
Limit: ${tenant.monthlyVerificationLimit.toLocaleString()}
Remaining: ${(tenant.monthlyVerificationLimit - tenant.monthlyVerificationsUsed).toLocaleString()}

${usagePercent >= 90 ? 'CRITICAL - Approaching limit' : 'WARNING - High usage'}

Actions:
1. ${usagePercent >= 90 ? 'Contact customer immediately' : 'Send usage notification email'}
2. ${usagePercent >= 100 ? 'Verifications will be rejected' : 'Monitor usage closely'}
3. Suggest upgrade to higher tier`,
    usagePercent >= 90 ? 'critical' : 'warning'
  );
}

/**
 * Alert: Failed payment
 */
export async function alertPaymentFailed(tenant, invoice) {
  await sendAlert(
    `Payment Failed: ${tenant.email}`,
    `Tenant: ${tenant.email}
Tier: ${tenant.tier}
Amount: $${(invoice.amount_due / 100).toFixed(2)}
Invoice: ${invoice.id}

Stripe Dashboard:
https://dashboard.stripe.com/invoices/${invoice.id}

Action Required:
1. Customer notified by Stripe automatically
2. Subscription enters past_due state
3. Stripe will retry payment 3 times
4. Monitor for payment recovery or cancellation
5. Consider reaching out to customer`,
    'warning'
  );
}

/**
 * Alert: Database slow query
 */
export async function alertSlowQuery(query, duration) {
  await sendAlert(
    `Slow Database Query Detected`,
    `Query Duration: ${duration}ms
Threshold: 1000ms

Query:
${query}

Action Required:
1. Check database performance metrics
2. Review query execution plan
3. Consider adding indexes
4. Check for table locks
5. Monitor database CPU/memory usage`,
    duration > 5000 ? 'critical' : 'warning'
  );
}

/**
 * Alert: Python verifier down
 */
export async function alertVerifierDown(endpoint, error) {
  await sendAlert(
    `Python Verifier Service Down`,
    `Endpoint: ${endpoint}
Status: UNREACHABLE
Error: ${error.message}

Impact:
- All payment verifications will fail
- Customer API requests returning errors
- Revenue generation stopped

Action Required (URGENT):
1. Check Render dashboard for verifier service status
2. Review service logs for errors
3. Verify RPC endpoints are accessible
4. Check environment variables
5. Restart service if needed
6. Notify customers if extended outage`,
    'critical'
  );
}

/**
 * Alert: Suspicious activity
 */
export async function alertSuspiciousActivity(tenant, activity) {
  await sendAlert(
    `Suspicious Activity: ${tenant.email}`,
    `Tenant: ${tenant.email}
Activity: ${activity.type}
Details: ${JSON.stringify(activity.details, null, 2)}
Timestamp: ${new Date().toISOString()}

Possible Issues:
- Unusual API usage pattern
- Multiple failed verification attempts
- API key abuse
- Potential security breach

Action Required:
1. Review tenant activity logs
2. Check for API key leaks
3. Contact tenant if needed
4. Consider rate limiting
5. Monitor for continued suspicious behavior`,
    'warning'
  );
}

export default {
  sendAlert,
  alertServiceDown,
  alertHighErrorRate,
  alertQuotaWarning,
  alertPaymentFailed,
  alertSlowQuery,
  alertVerifierDown,
  alertSuspiciousActivity,
};
