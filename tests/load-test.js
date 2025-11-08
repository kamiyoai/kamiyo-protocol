/**
 * x402 Infrastructure Load Testing Script
 *
 * Tests API performance under load
 * Target: 1000 req/s as specified in X402_SAAS_REVIEW.md
 *
 * Usage:
 *   node tests/load-test.js
 *
 * Requirements:
 *   - X402_API_KEY environment variable
 *   - X402_API_URL environment variable (defaults to http://localhost:3000)
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

const config = {
  apiKey: process.env.X402_API_KEY || 'x402_test_key',
  apiUrl: process.env.X402_API_URL || 'http://localhost:3000',
  targetRPS: 1000, // Requests per second
  duration: 60, // Test duration in seconds
  warmupDuration: 5, // Warmup duration in seconds
  endpoints: [
    { path: '/api/v1/x402/health', method: 'GET', weight: 0.1 },
    { path: '/api/v1/x402/usage', method: 'GET', weight: 0.2 },
    { path: '/api/v1/x402/supported-chains', method: 'GET', weight: 0.1 },
    { path: '/api/v1/x402/verify', method: 'POST', weight: 0.5, body: {
      tx_hash: '0x' + '0'.repeat(64),
      chain: 'base',
      recipient: '0x' + '0'.repeat(40),
      amount: 10.0
    }},
    { path: '/api/v1/x402/analytics', method: 'GET', weight: 0.1 }
  ]
};

const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [],
  statusCodes: {},
  errors: {},
  startTime: 0,
  endTime: 0
};

function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const url = new URL(endpoint.path, config.apiUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: endpoint.method,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    const startTime = Date.now();

    const req = httpModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const responseTime = Date.now() - startTime;

        stats.totalRequests++;
        stats.responseTimes.push(responseTime);

        const statusCode = res.statusCode;
        stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;

        if (statusCode >= 200 && statusCode < 300) {
          stats.successfulRequests++;
        } else {
          stats.failedRequests++;
        }

        resolve({ success: true, statusCode, responseTime });
      });
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;

      stats.totalRequests++;
      stats.failedRequests++;
      stats.responseTimes.push(responseTime);

      const errorType = error.code || 'UNKNOWN_ERROR';
      stats.errors[errorType] = (stats.errors[errorType] || 0) + 1;

      resolve({ success: false, error: errorType, responseTime });
    });

    if (endpoint.body) {
      req.write(JSON.stringify(endpoint.body));
    }

    req.end();
  });
}

function selectEndpoint() {
  const random = Math.random();
  let cumulativeWeight = 0;

  for (const endpoint of config.endpoints) {
    cumulativeWeight += endpoint.weight;
    if (random <= cumulativeWeight) {
      return endpoint;
    }
  }

  return config.endpoints[0];
}

async function runLoadTest(duration, isWarmup = false) {
  const phase = isWarmup ? 'Warmup' : 'Load Test';
  console.log(`\n${phase} starting...`);

  const requestsPerSecond = isWarmup ? config.targetRPS / 10 : config.targetRPS;
  const intervalMs = 1000 / requestsPerSecond;
  const totalRequests = requestsPerSecond * duration;

  const startTime = Date.now();
  let completedRequests = 0;

  // Progress updates
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const progress = Math.floor((completedRequests / totalRequests) * 100);
    const rps = Math.floor(completedRequests / (elapsed || 1));

    process.stdout.write(`\r${phase}: ${elapsed}s / ${duration}s | ${completedRequests}/${totalRequests} requests | ${rps} RPS | ${stats.successfulRequests} success / ${stats.failedRequests} failed`);
  }, 1000);

  // Send requests
  const promises = [];
  for (let i = 0; i < totalRequests; i++) {
    const endpoint = selectEndpoint();
    const delay = i * intervalMs;

    promises.push(
      new Promise((resolve) => {
        setTimeout(async () => {
          await makeRequest(endpoint);
          completedRequests++;
          resolve();
        }, delay);
      })
    );
  }

  await Promise.all(promises);
  clearInterval(progressInterval);

  console.log(`\n${phase} complete!\n`);
}

function calculateStats() {
  if (stats.responseTimes.length === 0) {
    return null;
  }

  stats.responseTimes.sort((a, b) => a - b);

  const total = stats.responseTimes.length;
  const sum = stats.responseTimes.reduce((a, b) => a + b, 0);

  return {
    min: stats.responseTimes[0],
    max: stats.responseTimes[total - 1],
    mean: Math.round(sum / total),
    median: stats.responseTimes[Math.floor(total / 2)],
    p95: stats.responseTimes[Math.floor(total * 0.95)],
    p99: stats.responseTimes[Math.floor(total * 0.99)]
  };
}

function printResults() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const rps = Math.floor(stats.totalRequests / duration);
  const successRate = ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2);

  console.log('\n═══════════════════════════════════════');
  console.log('          LOAD TEST RESULTS');
  console.log('═══════════════════════════════════════\n');

  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Total Requests: ${stats.totalRequests}`);
  console.log(`Successful: ${stats.successfulRequests} (${successRate}%)`);
  console.log(`Failed: ${stats.failedRequests}`);
  console.log(`Actual RPS: ${rps}`);
  console.log(`Target RPS: ${config.targetRPS}`);

  const responseStats = calculateStats();
  if (responseStats) {
    console.log('\nResponse Times (ms):');
    console.log(`  Min: ${responseStats.min}ms`);
    console.log(`  Mean: ${responseStats.mean}ms`);
    console.log(`  Median: ${responseStats.median}ms`);
    console.log(`  P95: ${responseStats.p95}ms`);
    console.log(`  P99: ${responseStats.p99}ms`);
    console.log(`  Max: ${responseStats.max}ms`);
  }

  console.log('\nStatus Codes:');
  Object.entries(stats.statusCodes)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .forEach(([code, count]) => {
      const percentage = ((count / stats.totalRequests) * 100).toFixed(2);
      console.log(`  ${code}: ${count} (${percentage}%)`);
    });

  if (Object.keys(stats.errors).length > 0) {
    console.log('\nErrors:');
    Object.entries(stats.errors)
      .sort((a, b) => b[1] - a[1])
      .forEach(([error, count]) => {
        console.log(`  ${error}: ${count}`);
      });
  }

  // Performance assessment
  console.log('\n═══════════════════════════════════════');
  console.log('         PERFORMANCE ASSESSMENT');
  console.log('═══════════════════════════════════════\n');

  const targetMet = rps >= config.targetRPS * 0.95;
  const responseTimeGood = responseStats && responseStats.p95 < 500;
  const successRateGood = parseFloat(successRate) >= 99.0;

  console.log(`Target RPS (${config.targetRPS}): ${targetMet ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Response Time P95 (<500ms): ${responseTimeGood ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Success Rate (>99%): ${successRateGood ? '✓ PASS' : '✗ FAIL'}`);

  const allPassed = targetMet && responseTimeGood && successRateGood;
  console.log(`\nOverall: ${allPassed ? '✓ PRODUCTION READY' : '✗ NEEDS OPTIMIZATION'}`);

  console.log('\n═══════════════════════════════════════\n');
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('    x402 Infrastructure Load Test');
  console.log('═══════════════════════════════════════');
  console.log(`\nTarget: ${config.targetRPS} requests/second`);
  console.log(`Duration: ${config.duration} seconds`);
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`Warmup: ${config.warmupDuration} seconds`);

  // Warmup phase
  await runLoadTest(config.warmupDuration, true);

  // Reset stats after warmup
  stats.totalRequests = 0;
  stats.successfulRequests = 0;
  stats.failedRequests = 0;
  stats.responseTimes = [];
  stats.statusCodes = {};
  stats.errors = {};

  // Main load test
  stats.startTime = Date.now();
  await runLoadTest(config.duration, false);
  stats.endTime = Date.now();

  // Print results
  printResults();

  process.exit(0);
}

main().catch(error => {
  console.error('\nLoad test failed:', error.message);
  process.exit(1);
});
