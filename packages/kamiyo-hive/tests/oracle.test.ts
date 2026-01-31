import { QualityOracle } from '../src/oracle.js';

const oracle = new QualityOracle({});

async function runTests() {
  console.log('\nQualityOracle Tests\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.then(() => {
          console.log(`  ✓ ${name}`);
          passed++;
        }).catch((err) => {
          console.log(`  ✗ ${name}: ${err.message}`);
          failed++;
        });
      }
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log('assess (fallback mode):');

  await test('returns QualityAssessment object', async () => {
    const result = await oracle.assess('Write a function', 'function foo() {}');
    if (typeof result.score !== 'number') throw new Error('Missing score');
    if (typeof result.rationale !== 'string') throw new Error('Missing rationale');
    if (typeof result.passed !== 'boolean') throw new Error('Missing passed');
  });

  await test('scores empty deliverable as 0', async () => {
    const result = await oracle.assess('Write something', '');
    if (result.score !== 0) throw new Error(`Expected 0, got ${result.score}`);
    if (result.passed !== false) throw new Error('Expected passed=false');
  });

  await test('scores whitespace-only deliverable as 0', async () => {
    const result = await oracle.assess('Write code', '   \n\t   ');
    if (result.score !== 0) throw new Error(`Expected 0, got ${result.score}`);
  });

  await test('scores matching deliverable higher', async () => {
    const spec = 'Create a React component for user authentication with login form';
    const good = 'Here is a React component for user authentication with a login form including email and password fields';
    const bad = 'Hello world';

    const goodResult = await oracle.assess(spec, good);
    const badResult = await oracle.assess(spec, bad);

    if (goodResult.score <= badResult.score) {
      throw new Error(`Good score (${goodResult.score}) should be higher than bad (${badResult.score})`);
    }
  });

  await test('respects custom threshold', async () => {
    const result = await oracle.assess('spec', 'deliverable', { threshold: 95 });
    if (result.passed && result.score < 95) {
      throw new Error('Should not pass below threshold');
    }
  });

  await test('score is clamped to 0-100', async () => {
    const result = await oracle.assess('a', 'b'.repeat(10000));
    if (result.score < 0 || result.score > 100) {
      throw new Error(`Score ${result.score} out of range`);
    }
  });

  await test('handles circular reference in deliverable', async () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    const result = await oracle.assess('spec', circular);
    if (result.score !== 0) throw new Error('Should fail gracefully');
  });

  await test('threshold is clamped to valid range', async () => {
    const result = await oracle.assess('spec', 'deliverable', { threshold: 150 });
    if (result.passed === undefined) throw new Error('Should return valid result');
  });

  console.log('\nrequestConsensus:');

  await test('returns OracleResponse', async () => {
    const result = await oracle.requestConsensus({
      spec: 'Build a REST API',
      deliverable: 'app.get("/users", handler)',
      escrowAddress: 'test123',
    });
    if (!result.signature) throw new Error('Missing signature');
    if (!result.timestamp) throw new Error('Missing timestamp');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
