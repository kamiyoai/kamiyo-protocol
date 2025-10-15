/**
 * Kamiyo Production Load Test Suite
 *
 * Tests sustained load on the Kamiyo API to validate:
 * - Performance under load (100-200 concurrent users)
 * - Response time SLAs (p95 < 800ms)
 * - Rate limiting enforcement
 * - Tier-based access controls
 *
 * Usage:
 *   k6 run k6/production-load-test.js
 *
 * Requirements:
 *   - k6 installed (https://k6.io/docs/get-started/installation/)
 *   - API running on localhost:8000
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:8000';
const TEST_DURATION = __ENV.TEST_DURATION || '10m';

// Custom metrics
const exploitsFetchRate = new Rate('exploits_fetch_success');
const statsResponseTime = new Trend('stats_response_time');
const rateLimitHits = new Counter('rate_limit_hits');
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 100 },  // Ramp up to 100 users
    { duration: '3m', target: 200 },  // Ramp up to 200 users (peak load)
    { duration: '2m', target: 0 },    // Ramp down to 0
  ],

  thresholds: {
    // Performance thresholds
    'http_req_duration': ['p(95)<800'],  // 95% of requests under 800ms
    'http_req_duration{endpoint:/exploits}': ['p(95)<500'], // Exploits endpoint faster
    'http_req_duration{endpoint:/stats}': ['p(95)<300'],    // Stats endpoint cached

    // Success rate thresholds
    'http_req_failed': ['rate<0.05'],     // Less than 5% errors
    'exploits_fetch_success': ['rate>0.95'], // 95% success rate

    // Rate limiting (should work properly)
    'rate_limit_hits': ['count>0'],       // Should hit rate limits
  },

  // Configure for production-like load
  noConnectionReuse: false,
  userAgent: 'k6-load-test/1.0',
};

/**
 * Setup function - runs once at start
 */
export function setup() {
  console.log('=== Kamiyo Production Load Test ===');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Duration: ${TEST_DURATION}`);

  // Verify API is accessible
  const healthCheck = http.get(`${BASE_URL}/health`);

  if (healthCheck.status !== 200) {
    throw new Error(`API health check failed: ${healthCheck.status}`);
  }

  const healthData = JSON.parse(healthCheck.body);
  console.log(`API Status: ${healthData.status}`);
  console.log(`Database Exploits: ${healthData.database_exploits}`);
  console.log(`Active Sources: ${healthData.active_sources}/${healthData.total_sources}`);

  return {
    baseUrl: BASE_URL,
    startTime: new Date().toISOString()
  };
}

/**
 * Main test scenario - runs for each virtual user
 */
export default function(data) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: {
      test_type: 'production_load'
    }
  };

  // Test 1: Fetch exploits list (most common endpoint)
  group('Exploits List Endpoint', () => {
    const response = http.get(`${BASE_URL}/exploits?page=1&page_size=100`, {
      ...params,
      tags: { endpoint: '/exploits', name: 'exploits_list' }
    });

    const success = check(response, {
      'exploits: status is 200': (r) => r.status === 200,
      'exploits: has data array': (r) => {
        if (r.status !== 200) return false;
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      },
      'exploits: response time < 500ms': (r) => r.timings.duration < 500,
      'exploits: has pagination': (r) => {
        if (r.status !== 200) return false;
        const body = JSON.parse(r.body);
        return body.hasOwnProperty('total') && body.hasOwnProperty('page');
      }
    });

    exploitsFetchRate.add(success);
    errorRate.add(!success);

    // Check for 24-hour delay (free tier)
    if (response.status === 200) {
      const body = JSON.parse(response.body);
      if (body.data && body.data.length > 0) {
        const latestExploit = body.data[0];
        const timestamp = latestExploit.timestamp || latestExploit.date;
        if (timestamp) {
          const exploitDate = new Date(timestamp);
          const now = new Date();
          const hoursOld = (now - exploitDate) / (1000 * 60 * 60);

          check(hoursOld, {
            'exploits: data delayed by 24h (free tier)': (hours) => hours >= 24
          });
        }
      }
    }
  });

  sleep(1); // Think time between requests

  // Test 2: Fetch statistics
  group('Statistics Endpoint', () => {
    const response = http.get(`${BASE_URL}/stats?days=7`, {
      ...params,
      tags: { endpoint: '/stats', name: 'stats' }
    });

    const success = check(response, {
      'stats: status is 200': (r) => r.status === 200,
      'stats: has total_loss_usd': (r) => {
        if (r.status !== 200) return false;
        const body = JSON.parse(r.body);
        return body.hasOwnProperty('total_loss_usd');
      },
      'stats: response time < 300ms': (r) => r.timings.duration < 300,
      'stats: has cache headers': (r) => {
        return r.headers['X-Cache'] !== undefined ||
               r.headers['Cache-Control'] !== undefined;
      }
    });

    statsResponseTime.add(response.timings.duration);
    errorRate.add(!success);
  });

  sleep(0.5);

  // Test 3: Fetch chains list
  group('Chains Endpoint', () => {
    const response = http.get(`${BASE_URL}/chains`, {
      ...params,
      tags: { endpoint: '/chains', name: 'chains' }
    });

    check(response, {
      'chains: status is 200': (r) => r.status === 200,
      'chains: has chains array': (r) => {
        if (r.status !== 200) return false;
        const body = JSON.parse(r.body);
        return Array.isArray(body.chains);
      },
      'chains: response time < 200ms': (r) => r.timings.duration < 200
    });
  });

  sleep(1);

  // Test 4: Filtered queries (more intensive)
  group('Filtered Queries', () => {
    const filters = [
      { chain: 'Ethereum', min_amount: 1000000 },
      { chain: 'BSC', min_amount: 500000 },
      { protocol: 'Uniswap' }
    ];

    const filter = filters[Math.floor(Math.random() * filters.length)];
    const queryParams = new URLSearchParams(filter).toString();

    const response = http.get(`${BASE_URL}/exploits?${queryParams}`, {
      ...params,
      tags: { endpoint: '/exploits', name: 'exploits_filtered' }
    });

    check(response, {
      'filtered: status is 200': (r) => r.status === 200,
      'filtered: results match filter': (r) => {
        if (r.status !== 200) return false;
        const body = JSON.parse(r.body);

        // Verify chain filter
        if (filter.chain && body.data) {
          return body.data.every(e => e.chain === filter.chain);
        }

        // Verify amount filter
        if (filter.min_amount && body.data) {
          return body.data.every(e => (e.amount_usd || 0) >= filter.min_amount);
        }

        return true;
      }
    });
  });

  sleep(2);
}

/**
 * Test rate limiting with burst requests
 * Runs separately to test rate limit enforcement
 */
export function testRateLimiting() {
  console.log('Testing rate limiting...');

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { test_type: 'rate_limit' }
  };

  // Simulate IP-based rate limit (10 req/min for unauthenticated)
  // Try to make 15 requests rapidly
  for (let i = 0; i < 15; i++) {
    const response = http.get(`${BASE_URL}/exploits`, params);

    if (response.status === 429) {
      rateLimitHits.add(1);

      check(response, {
        'rate_limit: has 429 status': (r) => r.status === 429,
        'rate_limit: has Retry-After header': (r) => r.headers['Retry-After'] !== undefined,
        'rate_limit: has error message': (r) => {
          const body = JSON.parse(r.body);
          return body.error === 'rate_limit_exceeded';
        },
        'rate_limit: has upgrade_url': (r) => {
          const body = JSON.parse(r.body);
          return body.upgrade_url !== undefined;
        }
      });

      console.log(`Rate limit hit after ${i + 1} requests`);
      break;
    }

    sleep(0.1); // 100ms between requests = 600 req/min
  }
}

/**
 * Teardown function - runs once at end
 */
export function teardown(data) {
  console.log('=== Load Test Complete ===');
  console.log(`Start Time: ${data.startTime}`);
  console.log(`End Time: ${new Date().toISOString()}`);
  console.log('');
  console.log('Check the summary above for detailed metrics.');
  console.log('Expected results:');
  console.log('  - p95 response time < 800ms');
  console.log('  - Error rate < 5%');
  console.log('  - Rate limiting enforced (429 responses)');
  console.log('  - Free tier data delayed by 24 hours');
}
