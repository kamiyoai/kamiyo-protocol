import { describe, it, expect, beforeAll } from 'vitest';
import { DarkForestProver } from '../src';

/**
 * ZK Proof Performance Benchmarks
 *
 * Measures proof generation and verification times across different
 * tier thresholds to establish performance baselines.
 */
describe('ZK Proof Benchmarks', () => {
  let prover: DarkForestProver;
  const results: {
    operation: string;
    tier: string;
    durationMs: number;
  }[] = [];

  beforeAll(() => {
    if (!DarkForestProver.isAvailable()) {
      console.warn('Skipping benchmarks - artifacts not available');
      return;
    }
    prover = new DarkForestProver();
  });

  async function measureTime<T>(fn: () => Promise<T>): Promise<[T, number]> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return [result, duration];
  }

  describe('Commitment Generation', () => {
    it('benchmark: commitment generation', async () => {
      if (!DarkForestProver.isAvailable()) return;

      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const [, duration] = await measureTime(() => prover.generateCommitment(75));
        durations.push(duration);
      }

      const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
      const minMs = Math.min(...durations);
      const maxMs = Math.max(...durations);

      results.push({
        operation: 'generateCommitment',
        tier: 'N/A',
        durationMs: avgMs,
      });

      console.log(`\nCommitment Generation (${iterations} iterations):`);
      console.log(`  Average: ${avgMs.toFixed(2)}ms`);
      console.log(`  Min: ${minMs.toFixed(2)}ms`);
      console.log(`  Max: ${maxMs.toFixed(2)}ms`);

      expect(avgMs).toBeLessThan(500);
    }, 30000);
  });

  describe('Proof Generation', () => {
    const tiers = [
      { name: 'Bronze', threshold: 25, score: 30 },
      { name: 'Silver', threshold: 50, score: 60 },
      { name: 'Gold', threshold: 75, score: 85 },
      { name: 'Platinum', threshold: 90, score: 95 },
    ];

    for (const tier of tiers) {
      it(`benchmark: ${tier.name} tier proof generation`, async () => {
        if (!DarkForestProver.isAvailable()) return;

        const commitment = await prover.generateCommitment(tier.score);

        const [, duration] = await measureTime(() =>
          prover.generateProof({
            score: tier.score,
            secret: commitment.secret,
            threshold: tier.threshold,
          })
        );

        results.push({
          operation: 'generateProof',
          tier: tier.name,
          durationMs: duration,
        });

        console.log(`\n${tier.name} Tier Proof Generation:`);
        console.log(`  Duration: ${duration.toFixed(2)}ms`);
        console.log(`  Score: ${tier.score}, Threshold: ${tier.threshold}`);

        // Proof generation should complete within 10 seconds
        expect(duration).toBeLessThan(10000);
      }, 60000);
    }

    it('benchmark: proof generation cold vs warm', async () => {
      if (!DarkForestProver.isAvailable()) return;

      const score = 80;
      const commitment = await prover.generateCommitment(score);

      // Cold run (first proof after init)
      const coldProver = new DarkForestProver();
      const [, coldDuration] = await measureTime(() =>
        coldProver.generateProof({
          score,
          secret: commitment.secret,
          threshold: 75,
        })
      );

      // Warm run (second proof on same prover)
      const [, warmDuration] = await measureTime(() =>
        coldProver.generateProof({
          score,
          secret: commitment.secret,
          threshold: 75,
        })
      );

      console.log(`\nCold vs Warm Proof Generation:`);
      console.log(`  Cold: ${coldDuration.toFixed(2)}ms`);
      console.log(`  Warm: ${warmDuration.toFixed(2)}ms`);
      console.log(`  Speedup: ${(coldDuration / warmDuration).toFixed(2)}x`);

      results.push({
        operation: 'generateProof (cold)',
        tier: 'Gold',
        durationMs: coldDuration,
      });
      results.push({
        operation: 'generateProof (warm)',
        tier: 'Gold',
        durationMs: warmDuration,
      });
    }, 120000);
  });

  describe('Proof Verification', () => {
    it('benchmark: proof verification', async () => {
      if (!DarkForestProver.isAvailable()) return;

      const score = 80;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 75,
      });

      const iterations = 5;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const [, duration] = await measureTime(() => prover.verifyProof(proof));
        durations.push(duration);
      }

      const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;

      results.push({
        operation: 'verifyProof',
        tier: 'N/A',
        durationMs: avgMs,
      });

      console.log(`\nProof Verification (${iterations} iterations):`);
      console.log(`  Average: ${avgMs.toFixed(2)}ms`);

      // Verification should be fast (< 1 second)
      expect(avgMs).toBeLessThan(1000);
    }, 60000);
  });

  describe('End-to-End Flow', () => {
    it('benchmark: full commitment -> proof -> verify cycle', async () => {
      if (!DarkForestProver.isAvailable()) return;

      const score = 85;
      const threshold = 75;

      const [commitment, commitTime] = await measureTime(() =>
        prover.generateCommitment(score)
      );

      const [proof, proofTime] = await measureTime(() =>
        prover.generateProof({
          score,
          secret: commitment.secret,
          threshold,
        })
      );

      const [result, verifyTime] = await measureTime(() =>
        prover.verifyProof(proof)
      );

      const totalTime = commitTime + proofTime + verifyTime;

      console.log(`\nEnd-to-End Flow:`);
      console.log(`  Commitment: ${commitTime.toFixed(2)}ms`);
      console.log(`  Proof Gen:  ${proofTime.toFixed(2)}ms`);
      console.log(`  Verify:     ${verifyTime.toFixed(2)}ms`);
      console.log(`  Total:      ${totalTime.toFixed(2)}ms`);

      results.push({
        operation: 'e2e_total',
        tier: 'Gold',
        durationMs: totalTime,
      });

      expect(result.valid).toBe(true);
      // Total should complete within 15 seconds
      expect(totalTime).toBeLessThan(15000);
    }, 60000);
  });

  describe('Summary', () => {
    it('prints benchmark summary', () => {
      if (results.length === 0) {
        console.log('\nNo benchmark results (artifacts not available)');
        return;
      }

      console.log('\n========================================');
      console.log('ZK PROOF BENCHMARK SUMMARY');
      console.log('========================================');
      console.log('Operation                     | Tier     | Duration');
      console.log('------------------------------|----------|----------');
      for (const r of results) {
        const op = r.operation.padEnd(29);
        const tier = r.tier.padEnd(8);
        console.log(`${op} | ${tier} | ${r.durationMs.toFixed(2)}ms`);
      }
      console.log('========================================');

      // Performance targets
      console.log('\nPerformance Targets:');
      console.log('  - Commitment: < 500ms');
      console.log('  - Proof Gen:  < 10s (varies by hardware)');
      console.log('  - Verify:     < 1s');
      console.log('  - E2E Total:  < 15s');
    });
  });
});
