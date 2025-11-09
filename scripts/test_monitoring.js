#!/usr/bin/env node
/**
 * Monitoring System Test Suite
 *
 * Tests all monitoring components:
 * - Sentry error tracking
 * - Health check endpoints
 * - Email alert system
 * - Database connectivity
 * - Python verifier status
 *
 * Usage:
 *   node scripts/test_monitoring.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const VERIFIER_URL = process.env.PYTHON_VERIFIER_URL || 'http://localhost:8001';

let passCount = 0;
let totalTests = 0;

/**
 * Test health check endpoint
 */
async function testHealthEndpoint() {
  console.log('\n=== Testing Health Check Endpoint ===');
  totalTests++;

  try {
    const response = await fetch(`${BASE_URL}/api/v1/x402/health`);
    const data = await response.json();

    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok && data.status) {
      console.log('✓ Health check endpoint working');

      // Check components
      if (data.checks?.database?.status === 'healthy') {
        console.log(`✓ Database healthy (${data.checks.database.latency_ms}ms)`);
      } else {
        console.log('✗ Database check failed');
      }

      if (data.checks?.verifier) {
        console.log(`✓ Verifier check included (${data.checks.verifier.status})`);
      }

      passCount++;
      return true;
    } else {
      console.error('✗ Health check failed');
      return false;
    }
  } catch (error) {
    console.error('✗ Health check error:', error.message);
    return false;
  }
}

/**
 * Test Python verifier health
 */
async function testVerifierHealth() {
  console.log('\n=== Testing Python Verifier Health ===');
  totalTests++;

  try {
    const response = await fetch(`${VERIFIER_URL}/health`);
    const data = await response.json();

    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok && data.status === 'ok') {
      console.log('✓ Verifier health check working');
      console.log(`✓ Supported chains: ${data.supported_chains?.join(', ') || 'none'}`);
      passCount++;
      return true;
    } else {
      console.error('✗ Verifier health check failed');
      return false;
    }
  } catch (error) {
    console.error('✗ Verifier connection error:', error.message);
    console.log('ℹ️  This is expected if verifier is not running locally');
    return false;
  }
}

/**
 * Test Sentry configuration
 */
async function testSentryConfig() {
  console.log('\n=== Testing Sentry Configuration ===');
  totalTests++;

  const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!sentryDsn) {
    console.log('⚠️  SENTRY_DSN not configured');
    console.log('   Set SENTRY_DSN environment variable to enable error tracking');
    return false;
  }

  console.log('✓ SENTRY_DSN configured');
  console.log(`  DSN: ${sentryDsn.substring(0, 30)}...`);

  // Check if Sentry module exists
  try {
    const sentryPath = require.resolve('../lib/monitoring/sentry.js');
    console.log('✓ Sentry integration file exists');
    passCount++;
    return true;
  } catch (error) {
    console.error('✗ Sentry integration not found');
    return false;
  }
}

/**
 * Test email alert configuration
 */
async function testEmailConfig() {
  console.log('\n=== Testing Email Alert Configuration ===');
  totalTests++;

  const resendKey = process.env.RESEND_API_KEY;
  const alertEmail = process.env.ALERT_EMAIL || 'dev@kamiyo.ai';
  const fromEmail = process.env.FROM_EMAIL || 'alerts@kamiyo.ai';

  if (!resendKey) {
    console.log('⚠️  RESEND_API_KEY not configured');
    console.log('   Set RESEND_API_KEY to enable email alerts');
    return false;
  }

  console.log('✓ RESEND_API_KEY configured');
  console.log(`✓ Alert email: ${alertEmail}`);
  console.log(`✓ From email: ${fromEmail}`);

  // Check if email alerts module exists
  try {
    const emailPath = require.resolve('../lib/monitoring/email-alerts.js');
    console.log('✓ Email alerts module exists');
    passCount++;
    return true;
  } catch (error) {
    console.error('✗ Email alerts module not found');
    return false;
  }
}

/**
 * Test response times
 */
async function testResponseTimes() {
  console.log('\n=== Testing Response Times ===');
  totalTests++;

  const tests = [
    { name: 'Health Check', url: `${BASE_URL}/api/v1/x402/health`, maxTime: 500 },
    { name: 'Verifier Health', url: `${VERIFIER_URL}/health`, maxTime: 200 },
  ];

  let allPassed = true;

  for (const test of tests) {
    try {
      const start = Date.now();
      const response = await fetch(test.url);
      const duration = Date.now() - start;

      if (response.ok && duration < test.maxTime) {
        console.log(`✓ ${test.name}: ${duration}ms (target: <${test.maxTime}ms)`);
      } else {
        console.log(`⚠️  ${test.name}: ${duration}ms (slow, target: <${test.maxTime}ms)`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`✗ ${test.name}: ${error.message}`);
      allPassed = false;
    }
  }

  if (allPassed) passCount++;
  return allPassed;
}

/**
 * Test error tracking
 */
async function testErrorTracking() {
  console.log('\n=== Testing Error Tracking ===');
  totalTests++;

  try {
    // Try to import Sentry
    const { captureException } = require('../lib/monitoring/sentry.js');

    // Create test error
    const testError = new Error('Test error from monitoring test suite');

    // Capture it
    captureException(testError, {
      test: true,
      script: 'test_monitoring.js',
      timestamp: new Date().toISOString()
    });

    console.log('✓ Error tracking function works');
    console.log('  Check Sentry dashboard for test error');
    passCount++;
    return true;
  } catch (error) {
    console.error('✗ Error tracking failed:', error.message);
    return false;
  }
}

/**
 * Display monitoring URLs
 */
function displayMonitoringURLs() {
  console.log('\n=== Monitoring Dashboards ===');
  console.log('Sentry:      https://sentry.io');
  console.log('UptimeRobot: https://uptimerobot.com/dashboard');
  console.log('Render:      https://dashboard.render.com');
  console.log('Stripe:      https://dashboard.stripe.com');
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('=================================');
  console.log('Monitoring System Test Suite');
  console.log('=================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Verifier URL: ${VERIFIER_URL}`);

  // Run tests
  await testHealthEndpoint();
  await testVerifierHealth();
  await testSentryConfig();
  await testEmailConfig();
  await testResponseTimes();
  await testErrorTracking();

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passCount}/${totalTests}`);
  console.log(`Failed: ${totalTests - passCount}/${totalTests}`);

  displayMonitoringURLs();

  // Configuration checklist
  console.log('\n=== Configuration Checklist ===');
  console.log(`[${process.env.SENTRY_DSN ? '✓' : ' '}] SENTRY_DSN configured`);
  console.log(`[${process.env.RESEND_API_KEY ? '✓' : ' '}] RESEND_API_KEY configured`);
  console.log(`[${process.env.ALERT_EMAIL ? '✓' : ' '}] ALERT_EMAIL configured`);
  console.log(`[${process.env.PYTHON_VERIFIER_URL ? '✓' : ' '}] PYTHON_VERIFIER_URL configured`);

  console.log('\n=== Next Steps ===');
  console.log('1. Configure missing environment variables');
  console.log('2. Set up UptimeRobot monitors');
  console.log('3. Test email alerts with real incident');
  console.log('4. Monitor production for 24 hours');
  console.log('5. Tune alert thresholds based on baseline');

  if (passCount === totalTests) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed - review configuration');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
