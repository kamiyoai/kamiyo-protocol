# KAMIYO Testing Guide

Step-by-step walkthrough for testing the ZK reputation system and agent SDK.

**Live on Base Mainnet:** [basescan.org/address/0x87394c7a6d380b3a886704560e2a823cda03c873](https://basescan.org/address/0x87394c7a6d380b3a886704560e2a823cda03c873)

---

## Before You Start

Make sure you have:
- Node.js 20+
- Terminal open in the repo root

```bash
cd ~/path/to/kamiyo-protocol
npm install
```

---

## Step 1: Navigate to TETSUO package

```bash
cd packages/kamiyo-tetsuo
```

This is the TypeScript SDK for generating and verifying ZK proofs.

---

## Step 2: Check the circuit artifacts exist

```bash
ls -lh artifacts/
```

You should see three files:
- `reputation_threshold.wasm` (~1.7MB) - the compiled circuit
- `reputation_threshold_final.zkey` (~254KB) - proving key from trusted setup
- `verification_key.json` (~3KB) - for verifying proofs

If these are missing, the tests won't work.

---

## Step 3: Run the test suite

```bash
npm test
```

Wait for it to finish. You should see:

```
✓ test/prover.test.ts (38 tests)
Tests: 38 passed
```

This runs all unit tests + real proof generation tests.

---

## Step 4: Look at the circuit (optional but cool)

```bash
cat ../../circuits/reputation_threshold.circom
```

The important part:

```
// Verify score meets threshold
gte.in[0] <== score;
gte.in[1] <== threshold;
gte.out === 1;

// Verify commitment matches
hasher.inputs[0] <== score;
hasher.inputs[1] <== secret;
hasher.out === commitment;
```

Two constraints: score >= threshold, and commitment = poseidon(score, secret).

---

## Step 5: Live demo - generate a commitment

Run this in your terminal:

```bash
node -e "
const { TetsuoProver } = require('./dist');

(async () => {
  const prover = new TetsuoProver();

  // Pick a score (this stays private)
  const score = 85;

  // Generate commitment
  const { value, secret } = await prover.generateCommitment(score);

  console.log('Score:', score, '(private)');
  console.log('Commitment:', '0x' + value.toString(16));
  console.log('Secret:', secret.toString().slice(0,20) + '...');
})();
"
```

The commitment is what gets published on-chain. The score and secret stay private.

---

## Step 6: Generate a ZK proof

Now prove the agent meets Gold tier (threshold 75) without revealing the actual score:

```bash
node -e "
const { TetsuoProver } = require('./dist');

(async () => {
  const prover = new TetsuoProver();
  const score = 85;

  // First get commitment
  const { value, secret } = await prover.generateCommitment(score);
  console.log('Generating proof that score >= 75...');
  console.log('(actual score is 85 but verifier wont know that)');
  console.log('');

  // Generate the proof
  const start = Date.now();
  const proof = await prover.generateProof({
    score: score,
    secret: secret,
    threshold: 75
  });
  console.log('Proof generated in', Date.now() - start, 'ms');
  console.log('');
  console.log('Proof points (a, b, c):');
  console.log('  a[0]:', proof.a[0].toString().slice(0,40) + '...');
  console.log('  a[1]:', proof.a[1].toString().slice(0,40) + '...');
  console.log('');
  console.log('Public inputs:');
  console.log('  threshold:', proof.publicInputs[0].toString());
  console.log('  commitment:', proof.publicInputs[1].toString().slice(0,40) + '...');
})();
"
```

Takes ~2 seconds. The proof is what gets submitted on-chain.

---

## Step 7: Verify the proof

```bash
node -e "
const { TetsuoProver } = require('./dist');

(async () => {
  const prover = new TetsuoProver();
  const score = 85;

  const { secret } = await prover.generateCommitment(score);
  const proof = await prover.generateProof({ score, secret, threshold: 75 });

  console.log('Verifying proof...');
  const result = await prover.verifyProof(proof);
  console.log('Valid:', result.valid);
})();
"
```

Should print `Valid: true`.

---

## Step 8: Try all tiers

```bash
node -e "
const { TetsuoProver, getTierThreshold, TIER_NAMES } = require('./dist');

(async () => {
  const prover = new TetsuoProver();

  const tests = [
    { score: 30, tier: 1 },  // Bronze (25)
    { score: 55, tier: 2 },  // Silver (50)
    { score: 80, tier: 3 },  // Gold (75)
    { score: 95, tier: 4 },  // Platinum (90)
  ];

  for (const t of tests) {
    const { secret } = await prover.generateCommitment(t.score);
    const threshold = getTierThreshold(t.tier);
    const proof = await prover.generateProof({ score: t.score, secret, threshold });
    const { valid } = await prover.verifyProof(proof);

    console.log(TIER_NAMES[t.tier].padEnd(10), '| score:', t.score, '| threshold:', threshold, '| valid:', valid);
  }
})();
"
```

Output:

```
Bronze     | score: 30 | threshold: 25 | valid: true
Silver     | score: 55 | threshold: 50 | valid: true
Gold       | score: 80 | threshold: 75 | valid: true
Platinum   | score: 95 | threshold: 90 | valid: true
```

---

## Step 9: Try to cheat (should fail)

What if you try to prove a tier you don't qualify for?

```bash
node -e "
const { TetsuoProver } = require('./dist');

(async () => {
  const prover = new TetsuoProver();
  const score = 50;  // Only qualifies for Silver

  const { secret } = await prover.generateCommitment(score);

  console.log('Score is 50, trying to prove Gold tier (75)...');
  try {
    await prover.generateProof({ score, secret, threshold: 75 });
  } catch (e) {
    console.log('Error:', e.message);
  }
})();
"
```

Output:

```
Score is 50, trying to prove Gold tier (75)...
Error: Score must be >= threshold to generate valid proof
```

The circuit won't let you generate a fake proof.

---

## Recap

What we showed:
1. Commitment binds an agent to a score without revealing it
2. ZK proof proves the agent meets a threshold
3. Verifier only learns the agent meets the threshold, not actual score
4. Can't fake proofs for tiers an agent doesn't qualify for

---

## Tier Reference

| Tier | Threshold | What it means |
|------|-----------|---------------|
| Bronze | 25 | Basic verified |
| Silver | 50 | Good standing |
| Gold | 75 | High reputation |
| Platinum | 90 | Top tier |

---

---

# Agent SDK Testing

Testing the `@kamiyo/agent-core` and `@kamiyo/daydreams` packages.

---

## Step 10: Test observability

```bash
node -e "
const { createObservabilityContext } = require('@kamiyo/agent-core');

const ctx = createObservabilityContext({
  logLevel: 'debug',
  serviceName: 'test-agent'
});

ctx.logger.info('Agent started');
ctx.kamiyoMetrics.apiCalls.inc();
ctx.kamiyoMetrics.apiLatency.observe(0.150);

const span = ctx.tracer.startSpan('api-call');
span.setAttribute('endpoint', 'https://api.example.com');
span.end('ok');

console.log('Metrics:', ctx.metrics.collect());
"
```

---

## Step 11: Test rate limiting

```bash
node -e "
const { TokenBucket, SlidingWindowCounter } = require('@kamiyo/agent-core');

// Token bucket: 10 tokens/sec, bucket size 5
const bucket = new TokenBucket({ tokensPerSecond: 10, bucketSize: 5 });

console.log('Token bucket:');
console.log('  Request 1:', bucket.tryAcquire(1));  // allowed
console.log('  Request 2:', bucket.tryAcquire(3));  // allowed
console.log('  Request 3:', bucket.tryAcquire(3));  // denied, not enough tokens

// Sliding window: 5 requests per second
const window = new SlidingWindowCounter({ windowSizeMs: 1000, maxRequests: 5 });

console.log('Sliding window:');
for (let i = 1; i <= 6; i++) {
  console.log('  Request ' + i + ':', window.tryAcquire());
}
"
```

---

## Step 12: Test retry logic

```bash
node -e "
const { retry, retryWithResult } = require('@kamiyo/agent-core');

(async () => {
  let attempts = 0;

  const result = await retry(async () => {
    attempts++;
    console.log('Attempt', attempts);
    if (attempts < 3) throw new Error('Simulated failure');
    return 'success';
  }, {
    maxAttempts: 5,
    baseDelayMs: 100,
    retryOn: () => true
  });

  console.log('Result:', result);
  console.log('Total attempts:', attempts);
})();
"
```

---

## Step 13: Test caching

```bash
node -e "
const { LRUCache, memoizeAsync } = require('@kamiyo/agent-core');

(async () => {
  const cache = new LRUCache({ maxEntries: 100, defaultTTL: 5000 });

  cache.set('key1', { data: 'value1' });
  console.log('Get key1:', cache.get('key1'));
  console.log('Stats:', cache.stats());

  // Memoized async function
  let callCount = 0;
  const fetchData = memoizeAsync(async (id) => {
    callCount++;
    return { id, timestamp: Date.now() };
  });

  await fetchData('user-123');
  await fetchData('user-123');  // cached
  await fetchData('user-123');  // cached

  console.log('Function called:', callCount, 'time(s)');
})();
"
```

---

## Step 14: Test health checks

```bash
node -e "
const { HealthChecker, healthChecks } = require('@kamiyo/agent-core');

(async () => {
  const checker = new HealthChecker({ version: '1.0.0' });

  checker.register('memory', healthChecks.memory());
  checker.register('custom', async () => ({
    name: 'custom',
    status: 'healthy',
    message: 'All good',
    lastCheck: Date.now()
  }));

  const report = await checker.check();
  console.log('Health report:');
  console.log('  Status:', report.status);
  console.log('  Version:', report.version);
  console.log('  Components:');
  report.components.forEach(c => {
    console.log('    -', c.name + ':', c.status);
  });
})();
"
```

---

## Step 15: Test Daydreams extension

```bash
node -e "
const { createKamiyoExtension } = require('@kamiyo/daydreams');

const ext = createKamiyoExtension({ network: 'devnet' });

console.log('Extension name:', ext.name);
console.log('Extension version:', ext.version);
console.log('');
console.log('Actions:');
ext.getActions().forEach(a => {
  console.log('  -', a.name);
});
"
```

---

## Step 16: Test ZK reputation via agent-core

```bash
node -e "
const { ReputationManager, getTierThreshold, TIER_NAMES } = require('@kamiyo/agent-core');

(async () => {
  const manager = new ReputationManager();

  // Generate commitment for score 85
  const commitment = await manager.generateCommitment({ score: 85 });
  console.log('Commitment:', commitment.commitment.slice(0, 40) + '...');
  console.log('Tier:', TIER_NAMES[commitment.tier]);

  // Prove Gold tier (75)
  const proof = await manager.proveReputation({ threshold: 75, tier: 3 });
  console.log('Proof generated:', !!proof.proof);

  // Verify
  const verified = await manager.verifyProof({
    proof: proof.proof,
    commitment: commitment.commitment,
    threshold: 75
  });
  console.log('Valid:', verified.valid);
})();
"
```

---

## Step 17: Run Daydreams demo

```bash
cd examples/daydreams-demo
npm install
npm run demo
```

This runs a full demo showing:
- Extension initialization
- ZK commitment generation
- Proof generation and verification
- Tier qualification checks

---

## Troubleshooting

### "Cannot find module './dist'"

Build hasn't been run:

```bash
npm run build
```

### "Bundled circuit artifacts not found"

Artifacts missing. Check they exist:

```bash
ls artifacts/
```

If empty, copy from circuits build or run the circuit build script.

### "Cannot find module '@kamiyo/tetsuo'"

You're not in the right directory:

```bash
cd packages/kamiyo-tetsuo
```

### Tests hang or timeout

Node version issue. Check you're on v20+:

```bash
node --version
```

### "Worker is not a constructor"

This happens in test environments. The vitest.config.ts should handle it:

```bash
cat vitest.config.ts
```

Should show `pool: 'forks'`. If file is missing:

```bash
echo 'import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 60000,
  },
});' > vitest.config.ts
```

### Proof generation fails silently

Check snarkjs is installed:

```bash
npm ls snarkjs
```

If missing:

```bash
npm install
```

### "Error: invalid point"

Usually means the zkey file is corrupted or incomplete. Re-download or rebuild artifacts.

### "Cannot find module '@kamiyo/agent-core'"

Package not built or not linked:

```bash
cd packages/kamiyo-agent-core
npm run build
```

### "Cannot find module '@kamiyo/daydreams'"

Package not built or not linked:

```bash
cd packages/kamiyo-daydreams
npm run build
```

### Agent-core tests fail with import errors

Make sure you've installed dependencies:

```bash
pnpm install
```

### Daydreams extension returns wrong action count

Check you're using the latest build:

```bash
cd packages/kamiyo-daydreams
npm run build
```

