/**
 * Manual integration test for the Daydreams extension.
 * Run with: npx ts-node scripts/manual-test.ts
 */

import {
  // Extension
  createKamiyoExtension,
  kamiyoExtension,

  // Observability
  createObservabilityContext,
  ConsoleLogger,
  InMemoryTracer,
  InMemoryMetricsRegistry,
  createKamiyoMetrics,

  // Retry
  retry,
  retryWithResult,
  Bulkhead,
  withTimeout,
  DeadlineContext,
  retryConditions,

  // Events
  KamiyoEventEmitter,
  KamiyoEventBus,
  createEventEmitter,
  loggingMiddleware,

  // Rate Limiting
  TokenBucket,
  SlidingWindowCounter,
  KeyedRateLimiter,
  CompositeRateLimiter,
  RATE_LIMIT_PRESETS,

  // Cache
  LRUCache,
  ResponseCache,
  memoize,
  memoizeAsync,

  // Health
  HealthChecker,
  healthChecks,
  createHealthHandlers,

  // Batch
  parallelMap,
  batchExecute,
  batchWithProgress,
  RequestBatcher,
  chunk,
  pipeline,

  // Validation
  validators,
  validate,
  validateOrThrow,
  NetworkSchema,
  ConsumeAPIInputSchema,

  // Transaction
  TransactionContext,
  transaction,
  Outbox,
  IdempotencyManager,
  TwoPhaseCoordinator,
  createInMemoryTransactionStorage,

  // Storage
  MemoryStorage,
  FileStorage,

  // Context
  kamiyoPaymentContext,
  kamiyoReputationContext,

  // Reputation
  ReputationManager,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
  TIER_NAMES,
} from '../src/daydreams';

const log = (section: string, msg: string) => console.log(`[${section}] ${msg}`);
const pass = (test: string) => console.log(`  ✓ ${test}`);
const fail = (test: string, err: unknown) => console.error(`  ✗ ${test}: ${err}`);

async function testExtension() {
  log('EXTENSION', 'Testing extension creation');

  try {
    const ext = createKamiyoExtension({ network: 'devnet' });
    pass('createKamiyoExtension()');

    const daydreamsExt = ext.toExtension();
    if (daydreamsExt.name !== 'kamiyo') throw new Error('Wrong name');
    if (daydreamsExt.version !== '2.0.0') throw new Error('Wrong version');
    pass('toExtension() returns valid extension');

    const actions = ext.getActions();
    if (actions.length < 10) throw new Error(`Expected 10+ actions, got ${actions.length}`);
    pass(`getActions() returns ${actions.length} actions`);

    // Test action schemas
    const consumeAPI = actions.find(a => a.name === 'kamiyo.consumeAPI');
    if (!consumeAPI?.schema) throw new Error('Missing consumeAPI schema');
    pass('Action schemas present');

  } catch (err) {
    fail('Extension creation', err);
    return false;
  }

  return true;
}

async function testObservability() {
  log('OBSERVABILITY', 'Testing logging, metrics, tracing');

  try {
    const ctx = createObservabilityContext({ logLevel: 'debug', serviceName: 'test' });
    pass('createObservabilityContext()');

    ctx.logger.debug('Debug message');
    ctx.logger.info('Info message');
    ctx.logger.warn('Warning message');
    pass('Logger methods work');

    const span = ctx.tracer.startSpan('test-span', { foo: 'bar' });
    span.setAttribute('key', 'value');
    span.addEvent('test-event');
    span.end('ok');
    pass('Tracer span lifecycle');

    ctx.kamiyoMetrics.apiCalls.inc();
    ctx.kamiyoMetrics.apiLatency.observe(0.123);
    ctx.kamiyoMetrics.circuitBreakerState.set(0);
    const collected = ctx.metrics.collect();
    if (collected.length === 0) throw new Error('No metrics collected');
    pass(`Metrics collection (${collected.length} values)`);

  } catch (err) {
    fail('Observability', err);
    return false;
  }

  return true;
}

async function testRetry() {
  log('RETRY', 'Testing retry logic');

  try {
    let attempts = 0;
    const result = await retry(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Not yet');
      return 'success';
    }, { maxAttempts: 5, baseDelayMs: 10, retryOn: () => true });

    if (result !== 'success') throw new Error('Wrong result');
    if (attempts !== 3) throw new Error(`Expected 3 attempts, got ${attempts}`);
    pass('retry() with failures');

    const withResult = await retryWithResult(async () => 42, { maxAttempts: 1 });
    if (!withResult.success || withResult.result !== 42) throw new Error('retryWithResult failed');
    pass('retryWithResult()');

    const bulkhead = new Bulkhead(2, 10);
    const results = await Promise.all([
      bulkhead.execute(() => Promise.resolve(1)),
      bulkhead.execute(() => Promise.resolve(2)),
    ]);
    if (results[0] !== 1 || results[1] !== 2) throw new Error('Bulkhead failed');
    pass('Bulkhead concurrency');

    const deadline = new DeadlineContext(1000);
    if (deadline.exceeded) throw new Error('Deadline should not be exceeded');
    if (deadline.remaining <= 0) throw new Error('Remaining should be positive');
    pass('DeadlineContext');

  } catch (err) {
    fail('Retry', err);
    return false;
  }

  return true;
}

async function testEvents() {
  log('EVENTS', 'Testing event emitter');

  try {
    const emitter = createEventEmitter();
    let received: any = null;

    emitter.on('agent:initialized', (payload) => {
      received = payload;
    });

    emitter.emit('agent:initialized', { agentId: 'test-agent', network: 'devnet' });
    await new Promise(r => setTimeout(r, 10)); // Let async handler run

    if (!received || received.agentId !== 'test-agent') throw new Error('Event not received');
    pass('on() and emit()');

    let wildcardEvent: string | null = null;
    emitter.onAny((event) => { wildcardEvent = event; });
    emitter.emit('api:request', { endpoint: 'test', method: 'GET', paymentId: '123' });
    await new Promise(r => setTimeout(r, 10));

    if (wildcardEvent !== 'api:request') throw new Error('Wildcard not called');
    pass('onAny() wildcard');

    const history = emitter.getHistory();
    if (history.length < 2) throw new Error('History not recording');
    pass('Event history');

    // Test middleware
    const bus = new KamiyoEventBus();
    let middlewareCalled = false;
    bus.use((event, payload, next) => {
      middlewareCalled = true;
      next();
    });
    bus.emit('circuit:closed', { endpoint: 'test' });
    if (!middlewareCalled) throw new Error('Middleware not called');
    pass('EventBus middleware');

  } catch (err) {
    fail('Events', err);
    return false;
  }

  return true;
}

async function testRateLimiting() {
  log('RATELIMIT', 'Testing rate limiters');

  try {
    const bucket = new TokenBucket({ tokensPerSecond: 10, bucketSize: 5 });
    const r1 = bucket.tryAcquire(3);
    if (!r1.allowed) throw new Error('Should allow first acquire');
    pass('TokenBucket.tryAcquire()');

    const r2 = bucket.tryAcquire(3);
    if (r2.allowed) throw new Error('Should deny when insufficient tokens');
    if (!r2.retryAfterMs) throw new Error('Should have retryAfterMs');
    pass('TokenBucket rate limiting');

    const sliding = new SlidingWindowCounter({ windowSizeMs: 1000, maxRequests: 5 });
    for (let i = 0; i < 5; i++) {
      const r = sliding.tryAcquire();
      if (!r.allowed) throw new Error(`Request ${i} should be allowed`);
    }
    const r6 = sliding.tryAcquire();
    if (r6.allowed) throw new Error('6th request should be denied');
    pass('SlidingWindowCounter');

    const keyed = new KeyedRateLimiter(RATE_LIMIT_PRESETS.standard);
    keyed.tryAcquire('user-1');
    keyed.tryAcquire('user-2');
    if (keyed.size !== 2) throw new Error('Should track 2 keys');
    pass('KeyedRateLimiter');

  } catch (err) {
    fail('Rate limiting', err);
    return false;
  }

  return true;
}

async function testCache() {
  log('CACHE', 'Testing caching');

  try {
    const cache = new LRUCache<string>({ maxEntries: 100, defaultTTL: 1000 });
    cache.set('key1', 'value1');

    const v1 = cache.get('key1');
    if (v1 !== 'value1') throw new Error('Cache miss');
    pass('LRUCache set/get');

    const stats = cache.stats();
    if (stats.hits !== 1) throw new Error('Should have 1 hit');
    pass('Cache stats');

    // Test TTL
    cache.set('expire', 'soon', 50);
    await new Promise(r => setTimeout(r, 60));
    const expired = cache.get('expire');
    if (expired !== undefined) throw new Error('Should have expired');
    pass('TTL expiration');

    // Test ResponseCache
    const responseCache = new ResponseCache();
    responseCache.set({ endpoint: '/api', method: 'GET' }, { data: 'test' });
    const cached = responseCache.get({ endpoint: '/api', method: 'GET' });
    if (!cached || (cached as any).data !== 'test') throw new Error('ResponseCache failed');
    pass('ResponseCache');

    // Test memoize
    let callCount = 0;
    const expensive = memoize((x: number) => {
      callCount++;
      return x * 2;
    });
    expensive(5);
    expensive(5);
    if (callCount !== 1) throw new Error('Should only call once');
    pass('memoize()');

  } catch (err) {
    fail('Cache', err);
    return false;
  }

  return true;
}

async function testHealth() {
  log('HEALTH', 'Testing health checks');

  try {
    const checker = new HealthChecker({ version: '1.0.0' });
    pass('HealthChecker creation');

    checker.register('test', async () => ({
      name: 'test',
      status: 'healthy',
      lastCheck: Date.now(),
    }));

    const report = await checker.check();
    if (report.status !== 'healthy') throw new Error('Should be healthy');
    if (report.version !== '1.0.0') throw new Error('Wrong version');
    pass('Health check execution');

    const isLive = await checker.isLive();
    const isReady = await checker.isReady();
    if (!isLive || !isReady) throw new Error('Should be live and ready');
    pass('Liveness/Readiness probes');

    // Test built-in checks
    const memoryCheck = healthChecks.memory();
    const memResult = await memoryCheck();
    if (!['healthy', 'degraded', 'unhealthy'].includes(memResult.status)) {
      throw new Error('Invalid memory check status');
    }
    pass('Built-in memory check');

    const handlers = createHealthHandlers(checker);
    const healthResponse = await handlers.health();
    if (healthResponse.status !== 200) throw new Error('Health endpoint failed');
    pass('Health HTTP handlers');

  } catch (err) {
    fail('Health', err);
    return false;
  }

  return true;
}

async function testBatch() {
  log('BATCH', 'Testing batch operations');

  try {
    const items = [1, 2, 3, 4, 5];
    const doubled = await parallelMap(items, async (x) => x * 2, 2);
    if (doubled.join(',') !== '2,4,6,8,10') throw new Error('parallelMap failed');
    pass('parallelMap()');

    const result = await batchExecute(
      [1, 2, 3],
      async (x) => {
        if (x === 2) throw new Error('Fail on 2');
        return x * 10;
      },
      { continueOnError: true }
    );
    if (result.successful.length !== 2) throw new Error('Should have 2 successful');
    if (result.failed.length !== 1) throw new Error('Should have 1 failed');
    pass('batchExecute() with partial failure');

    const chunks = chunk([1, 2, 3, 4, 5], 2);
    if (chunks.length !== 3) throw new Error('Wrong chunk count');
    if (chunks[0].length !== 2) throw new Error('Wrong first chunk size');
    pass('chunk()');

    // Test RequestBatcher
    const batcher = new RequestBatcher<number, number>(
      async (items) => items.map(x => x * 2),
      { maxBatchSize: 10, batchDelayMs: 10 }
    );

    const p1 = batcher.add(5);
    const p2 = batcher.add(10);
    const [r1, r2] = await Promise.all([p1, p2]);
    if (r1 !== 10 || r2 !== 20) throw new Error('RequestBatcher failed');
    pass('RequestBatcher');

  } catch (err) {
    fail('Batch', err);
    return false;
  }

  return true;
}

async function testValidation() {
  log('VALIDATION', 'Testing Zod schemas');

  try {
    const networkResult = validators.network.validate('devnet');
    if (!networkResult.success) throw new Error('Valid network rejected');
    pass('Network validation');

    const invalidNetwork = validators.network.validate('invalid');
    if (invalidNetwork.success) throw new Error('Invalid network accepted');
    pass('Invalid network rejected');

    const configResult = validators.extensionConfig.validate({
      network: 'devnet',
      qualityThreshold: 85,
      maxPrice: 0.01,
    });
    if (!configResult.success) throw new Error('Valid config rejected');
    pass('Extension config validation');

    const invalidConfig = validators.extensionConfig.validate({
      qualityThreshold: 150, // Out of range
    });
    if (invalidConfig.success) throw new Error('Invalid config accepted');
    pass('Invalid config rejected');

    // Test isValid type guard
    if (!validators.network.isValid('mainnet-beta')) {
      throw new Error('isValid type guard failed');
    }
    pass('isValid type guard');

  } catch (err) {
    fail('Validation', err);
    return false;
  }

  return true;
}

async function testTransaction() {
  log('TRANSACTION', 'Testing saga and 2PC');

  try {
    const results: string[] = [];

    const tx = transaction({ timeout: 5000 })
      .step('step1', async () => {
        results.push('exec1');
        return 'result1';
      }, async () => {
        results.push('comp1');
      })
      .step('step2', async () => {
        results.push('exec2');
        return 'result2';
      }, async () => {
        results.push('comp2');
      });

    const txResult = await tx.execute();
    if (txResult.status !== 'committed') throw new Error('Should commit');
    if (results.join(',') !== 'exec1,exec2') throw new Error('Wrong execution order');
    pass('Transaction commit');

    // Test rollback
    const rollbackResults: string[] = [];
    const failingTx = transaction()
      .step('s1', async () => {
        rollbackResults.push('e1');
        return 'r1';
      }, async () => {
        rollbackResults.push('c1');
      })
      .step('s2', async () => {
        throw new Error('Intentional failure');
      }, async () => {
        rollbackResults.push('c2');
      });

    const failResult = await failingTx.execute();
    if (failResult.status !== 'rolled_back') throw new Error('Should rollback');
    if (!rollbackResults.includes('c1')) throw new Error('Should compensate s1');
    pass('Transaction rollback');

    // Test IdempotencyManager
    const storage = createInMemoryTransactionStorage();
    const idempotency = new IdempotencyManager({ storage: storage.idempotency });

    let execCount = 0;
    const r1 = await idempotency.execute('key1', async () => {
      execCount++;
      return 'value1';
    });
    const r2 = await idempotency.execute('key1', async () => {
      execCount++;
      return 'value2';
    });

    if (r1 !== 'value1' || r2 !== 'value1') throw new Error('Idempotency failed');
    if (execCount !== 1) throw new Error('Should only execute once');
    pass('IdempotencyManager');

    // Test 2PC
    const coordinator = new TwoPhaseCoordinator();
    coordinator.addParticipant({
      id: 'p1',
      prepare: async () => true,
      commit: async () => {},
      abort: async () => {},
    });
    coordinator.addParticipant({
      id: 'p2',
      prepare: async () => true,
      commit: async () => {},
      abort: async () => {},
    });

    const twoPhaseResult = await coordinator.execute();
    if (twoPhaseResult.status !== 'committed') throw new Error('2PC should commit');
    pass('TwoPhaseCoordinator');

  } catch (err) {
    fail('Transaction', err);
    return false;
  }

  return true;
}

async function testStorage() {
  log('STORAGE', 'Testing storage providers');

  try {
    const memory = new MemoryStorage();
    await memory.set('key1', { foo: 'bar' });
    const v1 = await memory.get<{ foo: string }>('key1');
    if (!v1 || v1.foo !== 'bar') throw new Error('MemoryStorage get failed');
    pass('MemoryStorage set/get');

    const keys = await memory.keys();
    if (!keys.includes('key1')) throw new Error('keys() failed');
    pass('MemoryStorage keys');

    await memory.delete('key1');
    const deleted = await memory.get('key1');
    if (deleted !== null) throw new Error('delete failed');
    pass('MemoryStorage delete');

  } catch (err) {
    fail('Storage', err);
    return false;
  }

  return true;
}

async function testReputation() {
  log('REPUTATION', 'Testing ZK reputation');

  try {
    const manager = new ReputationManager();

    // Generate commitment
    const commitment = await manager.generateCommitment({ score: 85 });
    if (!commitment.commitment) throw new Error('No commitment generated');
    if (!commitment.tier) throw new Error('No tier assigned');
    pass('generateCommitment()');

    // Get tier
    const tier = await manager.getTier();
    if (tier.tier < 0 || tier.tier > 4) throw new Error('Invalid tier');
    pass('getTier()');

    // Can prove tier
    const canProve = manager.canProveTier(tier.tier);
    if (!canProve) throw new Error('Should be able to prove own tier');
    pass('canProveTier()');

    // Prove reputation
    const proof = await manager.proveReputation({ threshold: 80, tier: tier.tier });
    if (!proof.proof) throw new Error('No proof generated');
    if (!proof.commitment) throw new Error('No commitment in proof');
    pass('proveReputation()');

    // Verify proof
    const verified = await manager.verifyProof({
      proof: proof.proof,
      commitment: commitment.commitment,
      threshold: 80,
    });
    if (!verified.valid) throw new Error('Proof should be valid');
    pass('verifyProof()');

    // Test tier utilities
    const threshold = getTierThreshold(3);
    if (threshold !== 75) throw new Error('Wrong tier 3 threshold');
    pass('getTierThreshold()');

    const qualTier = getQualifyingTier(85);
    if (qualTier !== 3) throw new Error('85 should qualify for tier 3');
    pass('getQualifyingTier()');

    if (!qualifiesForTier(85, 3)) throw new Error('85 should qualify for tier 3');
    if (qualifiesForTier(60, 3)) throw new Error('60 should not qualify for tier 3');
    pass('qualifiesForTier()');

  } catch (err) {
    fail('Reputation', err);
    return false;
  }

  return true;
}

async function testContexts() {
  log('CONTEXTS', 'Testing Daydreams contexts');

  try {
    // Payment context
    const paymentCtx = kamiyoPaymentContext;
    if (!paymentCtx.type) throw new Error('No context type');
    if (!paymentCtx.schema) throw new Error('No context schema');
    pass('kamiyoPaymentContext structure');

    // Reputation context
    const repCtx = kamiyoReputationContext;
    if (!repCtx.type) throw new Error('No context type');
    if (!repCtx.schema) throw new Error('No context schema');
    pass('kamiyoReputationContext structure');

  } catch (err) {
    fail('Contexts', err);
    return false;
  }

  return true;
}

async function main() {
  console.log('='.repeat(60));
  console.log('KAMIYO AGENT CLIENT - MANUAL INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log();

  const results: boolean[] = [];

  results.push(await testExtension());
  results.push(await testObservability());
  results.push(await testRetry());
  results.push(await testEvents());
  results.push(await testRateLimiting());
  results.push(await testCache());
  results.push(await testHealth());
  results.push(await testBatch());
  results.push(await testValidation());
  results.push(await testTransaction());
  results.push(await testStorage());
  results.push(await testReputation());
  results.push(await testContexts());

  console.log();
  console.log('='.repeat(60));

  const passed = results.filter(r => r).length;
  const failed = results.filter(r => !r).length;

  if (failed === 0) {
    console.log(`ALL ${passed} TEST SUITES PASSED`);
  } else {
    console.log(`${passed} PASSED, ${failed} FAILED`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
