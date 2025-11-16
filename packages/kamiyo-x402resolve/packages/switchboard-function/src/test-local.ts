/**
 * Local testing for quality scorer function
 * Run with: npm run build && node dist/test-local.js
 */

import qualityScorer from './quality-scorer';
import { QualityScoringParams } from './types';

// Test cases
const testCases: { name: string; params: QualityScoringParams; expected: { minScore: number; maxScore: number } }[] = [
  {
    name: 'Perfect Match - Uniswap Exploits',
    params: {
      originalQuery: 'Uniswap V3 exploits on Ethereum',
      dataReceived: {
        exploits: [
          {
            protocol: 'Uniswap V3',
            chain: 'Ethereum',
            amount_usd: 8000000,
            date: new Date().toISOString(),
            tx_hash: '0x123...',
          },
          {
            protocol: 'Uniswap V3',
            chain: 'Ethereum',
            amount_usd: 5000000,
            date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            tx_hash: '0x456...',
          },
        ],
      },
      expectedCriteria: ['Uniswap', 'exploit', 'ethereum'],
      expectedRecordCount: 2,
    },
    expected: { minScore: 80, maxScore: 100 },
  },
  {
    name: 'Poor Match - Wrong Protocol',
    params: {
      originalQuery: 'Uniswap V3 exploits',
      dataReceived: {
        exploits: [
          {
            protocol: 'Curve Finance',
            amount_usd: 62000000,
            date: new Date().toISOString(),
          },
          {
            protocol: 'Euler Finance',
            amount_usd: 197000000,
            date: new Date().toISOString(),
          },
        ],
      },
      expectedCriteria: ['Uniswap', 'V3'],
      expectedRecordCount: 3,
    },
    expected: { minScore: 30, maxScore: 60 },
  },
  {
    name: 'Partial Match - Incomplete Data',
    params: {
      originalQuery: 'Recent Solana exploits with transaction details',
      dataReceived: {
        exploits: [
          {
            protocol: 'Wormhole',
            chain: 'Solana',
            amount_usd: 320000000,
            // Missing date and tx_hash
          },
          {
            protocol: 'Mango Markets',
            chain: 'Solana',
            // Missing amount and other fields
          },
        ],
      },
      expectedCriteria: ['Solana', 'exploit', 'transaction', 'amount'],
      expectedRecordCount: 3,
    },
    expected: { minScore: 40, maxScore: 70 },
  },
  {
    name: 'Old Data - Freshness Issue',
    params: {
      originalQuery: 'Recent DeFi exploits',
      dataReceived: {
        exploits: [
          {
            protocol: 'Badger DAO',
            amount_usd: 120000000,
            date: new Date('2021-12-02').toISOString(), // Very old
          },
          {
            protocol: 'Poly Network',
            amount_usd: 610000000,
            date: new Date('2021-08-10').toISOString(), // Very old
          },
        ],
      },
      expectedCriteria: ['DeFi', 'exploit'],
      expectedRecordCount: 2,
    },
    expected: { minScore: 40, maxScore: 70 },
  },
  {
    name: 'Empty Response',
    params: {
      originalQuery: 'Terra Luna exploits',
      dataReceived: {
        exploits: [],
      },
      expectedCriteria: ['Terra', 'Luna'],
      expectedRecordCount: 1,
    },
    expected: { minScore: 0, maxScore: 30 },
  },
];

async function runTests() {
  console.log('='.repeat(80));
  console.log('x402Resolve Quality Scoring Function - Local Tests');
  console.log('='.repeat(80));
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    console.log('-'.repeat(80));

    try {
      const result = await qualityScorer(testCase.params);

      console.log(`Query: "${testCase.params.originalQuery}"`);
      console.log(`\nResult:`);
      console.log(`  Quality Score: ${result.quality_score}/100`);
      console.log(`  Refund: ${result.refund_percentage}%`);
      console.log(`  Breakdown:`);
      console.log(`    - Semantic: ${result.breakdown.semantic}%`);
      console.log(`    - Completeness: ${result.breakdown.completeness}%`);
      console.log(`    - Freshness: ${result.breakdown.freshness}%`);
      console.log(`  Reasoning: ${result.reasoning}`);

      // Check if result is in expected range
      const inRange =
        result.quality_score >= testCase.expected.minScore &&
        result.quality_score <= testCase.expected.maxScore;

      if (inRange) {
        console.log(`  [PASS] (Score in expected range: ${testCase.expected.minScore}-${testCase.expected.maxScore})`);
        passed++;
      } else {
        console.log(`  [FAIL] (Score ${result.quality_score} not in expected range: ${testCase.expected.minScore}-${testCase.expected.maxScore})`);
        failed++;
      }
    } catch (error) {
      console.log(`  [ERROR] ${error}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
  console.log('='.repeat(80));

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
