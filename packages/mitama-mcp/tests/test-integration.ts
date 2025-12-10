#!/usr/bin/env node
/**
 * Comprehensive E2E Integration Test Suite
 * Tests all MCP tools against Solana devnet
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { SolanaClient } from './src/solana/client.js';
import { X402Program } from './src/solana/anchor.js';
import * as tools from './src/tools/index.js';

dotenv.config();

// Test configuration
const MIN_BALANCE = 0.1 * LAMPORTS_PER_SOL; // Minimum 0.1 SOL required
const TEST_ESCROW_AMOUNT = 0.01; // 0.01 SOL for testing
const TEST_API_PROVIDER = Keypair.generate().publicKey; // Mock API provider

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string, duration?: number) {
  results.push({ name, passed, error, duration });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const timing = duration ? ` (${duration}ms)` : '';
  console.log(`${status}: ${name}${timing}`);
  if (error) console.error(`  Error: ${error}`);
}

async function runTest(name: string, testFn: () => Promise<void>) {
  const start = Date.now();
  try {
    await testFn();
    logTest(name, true, undefined, Date.now() - start);
  } catch (error: any) {
    logTest(name, false, error.message, Date.now() - start);
  }
}

async function main() {
  console.log('🚀 KAMIYO Naori MCP Server - E2E Integration Tests\n');
  console.log('Network: Solana Devnet');
  console.log('Program ID: E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n\n');

  // Setup
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const programIdStr = process.env.NAORI_PROGRAM_ID;
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;

  if (!programIdStr || !agentPrivateKey) {
    console.error('❌ Missing environment variables. Please set:');
    console.error('  - NAORI_PROGRAM_ID');
    console.error('  - AGENT_PRIVATE_KEY');
    process.exit(1);
  }

  const programId = new PublicKey(programIdStr);
  const keypair = Keypair.fromSecretKey(bs58.decode(agentPrivateKey));
  const client = new SolanaClient(rpcUrl, keypair);
  const program = new X402Program(client.connection, keypair, programId);

  console.log(`Agent Wallet: ${keypair.publicKey.toBase58()}\n`);

  // Test 1: Check wallet balance
  await runTest('Check wallet balance', async () => {
    const balance = await client.getBalance();
    console.log(`  Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < MIN_BALANCE) {
      throw new Error(
        `Insufficient balance (${balance / LAMPORTS_PER_SOL} SOL). Need at least 0.1 SOL. Run: solana airdrop 1 ${keypair.publicKey.toBase58()} --url devnet`
      );
    }
  });

  // Test 2: Initialize agent reputation (if not exists)
  await runTest('Initialize agent reputation', async () => {
    const exists = await program.reputationExists(keypair.publicKey);
    if (!exists) {
      const result = await program.initReputation();
      console.log(`  Created reputation PDA: ${result.reputationPDA.toBase58()}`);
      console.log(`  Signature: ${result.signature}`);
    } else {
      console.log('  Reputation already exists');
    }
  });

  // Test 3: Get agent reputation
  await runTest('Get agent reputation', async () => {
    const result = await tools.getApiReputation(
      { apiProvider: keypair.publicKey.toBase58() },
      program
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Reputation Score: ${result.reputationScore}/1000`);
    console.log(`  Total Transactions: ${result.totalTransactions}`);
    console.log(`  Recommendation: ${result.recommendation}`);
  });

  // Test 4: Initialize API provider reputation
  await runTest('Initialize API provider reputation', async () => {
    const exists = await program.reputationExists(TEST_API_PROVIDER);
    if (!exists) {
      const result = await program.initReputation(TEST_API_PROVIDER);
      console.log(`  Created reputation PDA: ${result.reputationPDA.toBase58()}`);
    } else {
      console.log('  Reputation already exists');
    }
  });

  // Test 5: Create escrow
  let escrowResult: tools.CreateEscrowResult;
  await runTest('Create escrow', async () => {
    escrowResult = await tools.createEscrow(
      {
        api: TEST_API_PROVIDER.toBase58(),
        amount: TEST_ESCROW_AMOUNT,
        timeLock: 3600, // 1 hour
      },
      program
    );

    if (!escrowResult.success) {
      throw new Error(escrowResult.error);
    }

    console.log(`  Escrow Address: ${escrowResult.escrowAddress}`);
    console.log(`  Transaction ID: ${escrowResult.transactionId}`);
    console.log(`  Signature: ${escrowResult.signature}`);
  });

  // Wait for transaction confirmation
  console.log('\n⏳ Waiting for transaction confirmation...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test 6: Check escrow status
  await runTest('Check escrow status', async () => {
    const result = await tools.checkEscrowStatus(
      { transactionId: escrowResult.transactionId! },
      program
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Status: ${result.status}`);
    console.log(`  Agent: ${result.agent}`);
    console.log(`  API: ${result.api}`);
    console.log(`  Amount: ${result.amount} SOL`);
    console.log(`  Expires At: ${new Date(result.expiresAt! * 1000).toISOString()}`);

    if (result.status !== 'Active') {
      throw new Error(`Expected status 'Active', got '${result.status}'`);
    }
  });

  // Test 7: Verify payment
  await runTest('Verify payment', async () => {
    const result = await tools.verifyPayment(
      { transactionId: escrowResult.transactionId! },
      program
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Verified: ${result.verified}`);
    console.log(`  Amount: ${result.amount} SOL`);
    console.log(`  Status: ${result.status}`);

    if (!result.verified) {
      throw new Error('Payment verification failed');
    }
  });

  // Test 8: Assess data quality (off-chain)
  await runTest('Assess data quality - High quality', async () => {
    const mockApiResponse = {
      data: {
        name: 'Test Product',
        price: 100,
        description: 'A test product',
      },
      timestamp: Date.now(),
      status: 'success',
    };

    const result = await tools.assessDataQuality({
      apiResponse: mockApiResponse,
      expectedCriteria: ['data.name', 'data.price'],
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Quality Score: ${result.qualityScore}/100`);
    console.log(`  Refund Percentage: ${result.refundPercentage}%`);
    console.log(`  Completeness: ${result.completeness}%`);
    console.log(`  Freshness: ${result.freshness}%`);
    console.log(`  Schema Compliance: ${result.schemaCompliance}%`);

    if (result.qualityScore! < 70) {
      throw new Error(`Expected high quality score, got ${result.qualityScore}`);
    }
  });

  // Test 9: Assess data quality - Poor quality
  await runTest('Assess data quality - Poor quality', async () => {
    const mockApiResponse = {
      error: 'Internal server error',
      statusCode: 500,
    };

    const result = await tools.assessDataQuality({
      apiResponse: mockApiResponse,
      expectedCriteria: ['data.name', 'data.price'],
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Quality Score: ${result.qualityScore}/100`);
    console.log(`  Refund Percentage: ${result.refundPercentage}%`);

    if (result.qualityScore! > 30) {
      throw new Error(`Expected poor quality score, got ${result.qualityScore}`);
    }
  });

  // Test 10: Estimate refund
  await runTest('Estimate refund', async () => {
    const result = await tools.estimateRefund({
      amount: TEST_ESCROW_AMOUNT,
      qualityScore: 40, // Poor quality
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Refund Amount: ${result.refundAmount} SOL`);
    console.log(`  Refund Percentage: ${result.refundPercentage}%`);
    console.log(`  Payment Amount: ${result.paymentAmount} SOL`);

    if (result.refundPercentage! < 40) {
      throw new Error('Expected significant refund for poor quality');
    }
  });

  // Test 11: File dispute (marks escrow as disputed)
  await runTest('File dispute', async () => {
    const result = await tools.fileDispute(
      {
        transactionId: escrowResult.transactionId!,
        qualityScore: 30,
        refundPercentage: 70,
        evidence: {
          reason: 'Test dispute - poor quality data',
          timestamp: Date.now(),
        },
      },
      program
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Dispute ID: ${result.disputeId}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Signature: ${result.signature}`);
    console.log(`  Message: ${result.message}`);
  });

  // Wait for confirmation
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test 12: Check escrow status after dispute
  await runTest('Check escrow status after dispute', async () => {
    const result = await tools.checkEscrowStatus(
      { transactionId: escrowResult.transactionId! },
      program
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Status: ${result.status}`);

    if (result.status !== 'Disputed') {
      throw new Error(`Expected status 'Disputed', got '${result.status}'`);
    }
  });

  // Test 13: Check reputation after dispute
  await runTest('Check reputation after dispute', async () => {
    const result = await tools.getApiReputation(
      { apiProvider: keypair.publicKey.toBase58() },
      program
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`  Disputes Filed: ${result.disputesFiled}`);

    if (result.disputesFiled! < 1) {
      throw new Error('Dispute count should have increased');
    }
  });

  // Test 14: Test PDA derivation
  await runTest('Test PDA derivation', async () => {
    const [escrowPDA] = program.pda.deriveEscrowPDA(escrowResult.transactionId!);
    const [reputationPDA] = program.pda.deriveReputationPDA(keypair.publicKey);
    const [rateLimiterPDA] = program.pda.deriveRateLimiterPDA(keypair.publicKey);

    console.log(`  Escrow PDA: ${escrowPDA.toBase58()}`);
    console.log(`  Reputation PDA: ${reputationPDA.toBase58()}`);
    console.log(`  Rate Limiter PDA: ${rateLimiterPDA.toBase58()}`);

    if (escrowPDA.toBase58() !== escrowResult.escrowAddress) {
      throw new Error('PDA derivation mismatch');
    }
  });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  console.log('\n' + '='.repeat(60));

  if (failed === 0) {
    console.log('🎉 All tests passed! MCP server is production-ready.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review and fix issues.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
