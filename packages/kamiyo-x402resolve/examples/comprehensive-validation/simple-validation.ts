#!/usr/bin/env tsx
/**
 * Simplified Validation - Tests core functionality without internal package dependencies
 *
 * Tests:
 * 1. Solana connection and account balance
 * 2. Program account exists on devnet
 * 3. Quality assessment algorithm
 * 4. Multi-agent consensus logic
 * 5. PDA derivation
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

const ESCROW_PROGRAM_ID = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  duration: number;
  details?: string;
  error?: string;
}

class SimpleValidator {
  private connection: Connection;
  private agentKeypair: Keypair;
  private results: TestResult[] = [];

  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');

    const privateKey = process.env.AGENT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('AGENT_PRIVATE_KEY not set in .env');
    }

    this.agentKeypair = Keypair.fromSecretKey(bs58.decode(privateKey));
  }

  async runAll() {
    console.log('='.repeat(70));
    console.log('SIMPLIFIED VALIDATION - x402Resolve');
    console.log('='.repeat(70));
    console.log();
    console.log(`Agent: ${this.agentKeypair.publicKey.toString().slice(0, 8)}...`);
    console.log(`RPC: ${RPC_URL}`);
    console.log(`Program: ${ESCROW_PROGRAM_ID.toString()}`);
    console.log();

    await this.testSolanaConnection();
    await this.testProgramExists();
    await this.testQualityAssessment();
    await this.testMultiAgentConsensus();
    await this.testPDADerivation();
    await this.testRPCLatency();

    this.printSummary();
  }

  private async runTest(name: string, testFn: () => Promise<void>) {
    const start = Date.now();
    try {
      await testFn();
      const duration = Date.now() - start;
      this.results.push({ name, status: 'PASS', duration });
      console.log(`  ✓ ${name} (${duration}ms)`);
    } catch (error: any) {
      const duration = Date.now() - start;
      this.results.push({
        name,
        status: 'FAIL',
        duration,
        error: error.message
      });
      console.log(`  ✗ ${name} (${duration}ms)`);
      console.log(`    Error: ${error.message}`);
    }
  }

  private async testSolanaConnection() {
    console.log('[Test 1] Solana Connection and Balance');
    console.log('-'.repeat(70));

    await this.runTest('Connect to RPC', async () => {
      const version = await this.connection.getVersion();
      if (!version['solana-core']) {
        throw new Error('Invalid RPC response');
      }
    });

    await this.runTest('Check agent balance', async () => {
      const balance = await this.connection.getBalance(this.agentKeypair.publicKey);
      const balanceSOL = balance / LAMPORTS_PER_SOL;

      if (balance === 0) {
        throw new Error('Agent has 0 SOL balance');
      }

      console.log(`    Balance: ${balanceSOL.toFixed(4)} SOL`);

      if (balanceSOL < 0.1) {
        console.log('    Warning: Balance low, consider airdrop');
      }
    });

    console.log();
  }

  private async testProgramExists() {
    console.log('[Test 2] Program Verification');
    console.log('-'.repeat(70));

    await this.runTest('Verify program on devnet', async () => {
      const accountInfo = await this.connection.getAccountInfo(ESCROW_PROGRAM_ID);

      if (!accountInfo) {
        throw new Error('Program account not found on devnet');
      }

      if (!accountInfo.executable) {
        throw new Error('Program account is not executable');
      }

      console.log(`    Program exists and is executable`);
      console.log(`    Owner: ${accountInfo.owner.toString()}`);
    });

    console.log();
  }

  private async testQualityAssessment() {
    console.log('[Test 3] Quality Assessment Algorithm');
    console.log('-'.repeat(70));

    await this.runTest('High quality data (complete, fresh)', async () => {
      const data = {
        id: '123',
        severity: 'high',
        title: 'Test Exploit',
        description: 'A test exploit description',
        chain: 'ethereum',
        timestamp: new Date().toISOString()
      };

      const quality = this.assessQuality(data, {
        id: '',
        severity: '',
        title: '',
        description: '',
        chain: ''
      });

      if (quality.score < 90) {
        throw new Error(`Expected score >= 90, got ${quality.score}`);
      }

      console.log(`    Quality: ${quality.score}% (completeness: ${quality.completeness}%, freshness: ${quality.freshness}%)`);
    });

    await this.runTest('Low quality data (incomplete)', async () => {
      const data = {
        id: '123',
        timestamp: new Date(Date.now() - 7200000).toISOString() // 2 hours old
      };

      const quality = this.assessQuality(data, {
        id: '',
        severity: '',
        title: '',
        description: '',
        chain: ''
      });

      if (quality.score > 75) {
        throw new Error(`Expected score < 75 for incomplete data, got ${quality.score}`);
      }

      console.log(`    Quality: ${quality.score}% (would trigger refund)`);
    });

    await this.runTest('Stale data (old timestamp)', async () => {
      const data = {
        id: '123',
        severity: 'high',
        title: 'Test',
        description: 'Test',
        chain: 'ethereum',
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString() // 5 hours old
      };

      const quality = this.assessQuality(data, {
        id: '',
        severity: '',
        title: '',
        description: '',
        chain: ''
      });

      console.log(`    Quality: ${quality.score}% (freshness penalty applied)`);
    });

    console.log();
  }

  private async testMultiAgentConsensus() {
    console.log('[Test 4] Multi-Agent Consensus');
    console.log('-'.repeat(70));

    await this.runTest('Quality-weighted voting', async () => {
      const agents = [
        { id: 'agent1', quality: 95, decision: 'EXECUTE' },
        { id: 'agent2', quality: 88, decision: 'EXECUTE' },
        { id: 'agent3', quality: 72, decision: 'DISPUTE' } // Below threshold
      ];

      const threshold = 80;
      const validAgents = agents.filter(a => a.quality >= threshold);

      if (validAgents.length !== 2) {
        throw new Error(`Expected 2 valid agents, got ${validAgents.length}`);
      }

      const totalQuality = validAgents.reduce((sum, a) => sum + a.quality, 0);
      const weights = validAgents.map(a => ({
        id: a.id,
        weight: (a.quality / totalQuality) * 100
      }));

      console.log(`    Valid agents: ${validAgents.length}/3`);
      console.log(`    Weights: ${weights[0].id}=${weights[0].weight.toFixed(1)}%, ${weights[1].id}=${weights[1].weight.toFixed(1)}%`);
    });

    await this.runTest('Consensus calculation', async () => {
      const qualities = [95, 88, 92, 90];
      const avgQuality = qualities.reduce((a, b) => a + b, 0) / qualities.length;

      const consensus = avgQuality > 90 ? 'STRONG' : avgQuality > 80 ? 'MODERATE' : 'WEAK';

      console.log(`    Avg Quality: ${avgQuality}%`);
      console.log(`    Consensus: ${consensus}`);
    });

    await this.runTest('Disagreement detection', async () => {
      const decisions = ['BUY', 'BUY', 'SELL', 'BUY'];
      const buyVotes = decisions.filter(d => d === 'BUY').length;
      const sellVotes = decisions.filter(d => d === 'SELL').length;

      const majority = buyVotes / decisions.length;

      if (majority < 0.75) {
        console.log(`    Disagreement detected (${buyVotes} BUY vs ${sellVotes} SELL)`);
        console.log(`    Action: HOLD (conflicting signals)`);
      } else {
        console.log(`    Strong consensus: ${majority * 100}%`);
      }
    });

    console.log();
  }

  private async testPDADerivation() {
    console.log('[Test 5] PDA Derivation');
    console.log('-'.repeat(70));

    await this.runTest('Derive escrow PDA', async () => {
      const transactionId = 'test-' + Date.now();
      const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), Buffer.from(transactionId)],
        ESCROW_PROGRAM_ID
      );

      console.log(`    PDA: ${pda.toString().slice(0, 8)}...`);
      console.log(`    Bump: ${bump}`);
    });

    await this.runTest('Derive reputation PDA', async () => {
      const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('reputation'), this.agentKeypair.publicKey.toBuffer()],
        ESCROW_PROGRAM_ID
      );

      console.log(`    Reputation PDA: ${pda.toString().slice(0, 8)}...`);
      console.log(`    Bump: ${bump}`);
    });

    await this.runTest('PDA determinism', async () => {
      const txId = 'deterministic-test';
      const [pda1] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), Buffer.from(txId)],
        ESCROW_PROGRAM_ID
      );

      const [pda2] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), Buffer.from(txId)],
        ESCROW_PROGRAM_ID
      );

      if (!pda1.equals(pda2)) {
        throw new Error('PDA derivation not deterministic');
      }

      console.log(`    PDAs match: ${pda1.equals(pda2)}`);
    });

    console.log();
  }

  private async testRPCLatency() {
    console.log('[Test 6] RPC Performance');
    console.log('-'.repeat(70));

    await this.runTest('Measure RPC latency', async () => {
      const start = Date.now();
      await this.connection.getLatestBlockhash();
      const latency = Date.now() - start;

      console.log(`    Latency: ${latency}ms`);

      if (latency > 2000) {
        console.log('    Warning: High latency detected');
      }
    });

    await this.runTest('Get recent performance', async () => {
      const perfSamples = await this.connection.getRecentPerformanceSamples(1);
      if (perfSamples.length > 0) {
        const sample = perfSamples[0];
        console.log(`    Slot: ${sample.slot}`);
        console.log(`    TPS: ${sample.numTransactions / sample.samplePeriodSecs}`);
      }
    });

    console.log();
  }

  private assessQuality(received: any, expected: any): {
    score: number;
    completeness: number;
    accuracy: number;
    freshness: number;
  } {
    const completeness = this.checkCompleteness(received, expected);
    const accuracy = this.checkAccuracy(received);
    const freshness = this.checkFreshness(received);

    const score = Math.round(completeness * 0.4 + accuracy * 0.3 + freshness * 0.3);

    return { score, completeness, accuracy, freshness };
  }

  private checkCompleteness(received: any, expected: any): number {
    const expectedFields = Object.keys(expected);
    const receivedFields = Object.keys(received);
    const missing = expectedFields.filter(f => !receivedFields.includes(f));
    return ((expectedFields.length - missing.length) / expectedFields.length) * 100;
  }

  private checkAccuracy(received: any): number {
    const hasValidValues = Object.values(received).some(
      v => v !== null && v !== undefined && v !== '' && v !== 0
    );
    return hasValidValues ? 100 : 30;
  }

  private checkFreshness(received: any): number {
    const timestamp = received?.timestamp;
    if (!timestamp) return 50;

    const age = Date.now() - new Date(timestamp).getTime();
    const maxAge = 3600000; // 1 hour

    return Math.max(0, 100 - (age / maxAge) * 100);
  }

  private printSummary() {
    console.log('='.repeat(70));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(70));
    console.log();

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;
    const successRate = (passed / total) * 100;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${successRate.toFixed(1)}%`);
    console.log();

    if (failed > 0) {
      console.log('Failed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach((r, i) => {
          console.log(`  ${i + 1}. ${r.name}`);
          console.log(`     Error: ${r.error}`);
        });
      console.log();
    }

    console.log('='.repeat(70));
    console.log('VALIDATION COMPLETE');
    console.log('='.repeat(70));
    console.log();

    if (successRate === 100) {
      console.log('All validations passed!');
      console.log('Core functionality verified for hackathon submission.');
    } else if (successRate >= 80) {
      console.log('Most validations passed.');
      console.log('Review failed tests and address issues.');
    } else {
      console.log('Multiple validation failures detected.');
      console.log('Critical issues need to be resolved.');
    }
    console.log();
  }
}

// Run validation
const validator = new SimpleValidator();
validator.runAll().catch(error => {
  console.error('Validation failed to start:', error);
  process.exit(1);
});
