#!/usr/bin/env node
/**
 * Test Script for x402 Python Verifier
 *
 * Tests the deployed Python verifier service with real transaction data
 *
 * Usage:
 *   node scripts/test_verifier.js
 *
 * Environment Variables:
 *   PYTHON_VERIFIER_URL - URL of the deployed verifier service
 *   PYTHON_VERIFIER_KEY - Authentication key for the verifier
 */

const VERIFIER_URL = process.env.PYTHON_VERIFIER_URL || 'http://localhost:8001';
const VERIFIER_KEY = process.env.PYTHON_VERIFIER_KEY || '';

/**
 * Test cases with real transaction hashes
 * Replace these with actual transaction hashes for your testing
 */
const TEST_CASES = [
  {
    name: 'Base USDC Transfer (Example)',
    txHash: '0x1234...', // Replace with actual Base tx hash
    chain: 'base',
    expectedAmount: null,
    shouldPass: false // Update based on your test data
  },
  {
    name: 'Ethereum USDC Transfer (Example)',
    txHash: '0x5678...', // Replace with actual Ethereum tx hash
    chain: 'ethereum',
    expectedAmount: null,
    shouldPass: false // Update based on your test data
  },
  {
    name: 'Solana USDC Transfer (Example)',
    txHash: '5KpR...', // Replace with actual Solana signature
    chain: 'solana',
    expectedAmount: null,
    shouldPass: false // Update based on your test data
  }
];

/**
 * Test health endpoint
 */
async function testHealth() {
  console.log('\n=== Testing Health Endpoint ===');
  console.log(`URL: ${VERIFIER_URL}/health`);

  try {
    const response = await fetch(`${VERIFIER_URL}/health`);
    const data = await response.json();

    console.log('✓ Health check passed');
    console.log('Response:', JSON.stringify(data, null, 2));

    return true;
  } catch (error) {
    console.error('✗ Health check failed:', error.message);
    return false;
  }
}

/**
 * Test chains endpoint
 */
async function testChains() {
  console.log('\n=== Testing Chains Endpoint ===');
  console.log(`URL: ${VERIFIER_URL}/chains`);

  try {
    const response = await fetch(`${VERIFIER_URL}/chains`);
    const data = await response.json();

    console.log('✓ Chains endpoint passed');
    console.log('Supported chains:', data.chains);

    return true;
  } catch (error) {
    console.error('✗ Chains endpoint failed:', error.message);
    return false;
  }
}

/**
 * Test payment verification
 */
async function testVerification(testCase) {
  console.log(`\n=== Testing: ${testCase.name} ===`);
  console.log(`Chain: ${testCase.chain}`);
  console.log(`TX Hash: ${testCase.txHash}`);

  try {
    const response = await fetch(`${VERIFIER_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': VERIFIER_KEY
      },
      body: JSON.stringify({
        tx_hash: testCase.txHash,
        chain: testCase.chain,
        expected_amount: testCase.expectedAmount
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✓ Verification request successful');
      console.log('Response:', JSON.stringify(data, null, 2));

      if (data.is_valid) {
        console.log(`✓ Payment verified: ${data.amount_usdc} USDC`);
        console.log(`  From: ${data.from_address}`);
        console.log(`  To: ${data.to_address}`);
        console.log(`  Confirmations: ${data.confirmations}`);
        console.log(`  Risk Score: ${data.risk_score}`);
      } else {
        console.log(`✗ Payment invalid: ${data.error_message}`);
      }

      return true;
    } else {
      console.error(`✗ Verification failed (${response.status}):`, data);
      return false;
    }
  } catch (error) {
    console.error('✗ Verification request failed:', error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('=================================');
  console.log('x402 Python Verifier Test Suite');
  console.log('=================================');
  console.log(`Verifier URL: ${VERIFIER_URL}`);
  console.log(`Auth Key Set: ${VERIFIER_KEY ? 'Yes' : 'No'}`);

  let passCount = 0;
  let totalTests = 2 + TEST_CASES.length;

  // Test health endpoint
  if (await testHealth()) passCount++;

  // Test chains endpoint
  if (await testChains()) passCount++;

  // Test verification endpoints
  for (const testCase of TEST_CASES) {
    if (await testVerification(testCase)) passCount++;
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passCount}/${totalTests}`);
  console.log(`Failed: ${totalTests - passCount}/${totalTests}`);

  if (passCount === totalTests) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
