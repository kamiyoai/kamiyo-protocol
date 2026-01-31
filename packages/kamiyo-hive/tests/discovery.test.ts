import { AgentDiscovery } from '../src/discovery.js';

const discovery = new AgentDiscovery({ apiEndpoint: 'http://localhost:3000' });

async function runTests() {
  console.log('\nAgentDiscovery Tests\n');

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

  console.log('discover:');
  await test('returns agents array', async () => {
    const result = await discovery.discover({});
    if (!Array.isArray(result.agents)) throw new Error('Expected agents array');
  });

  await test('filters by capability', async () => {
    const result = await discovery.discover({ capability: 'code-generation' });
    const allMatch = result.agents.every(a => a.capabilities.includes('code-generation'));
    if (!allMatch) throw new Error('Not all agents have capability');
  });

  await test('filters by min reputation', async () => {
    const result = await discovery.discover({ minReputation: 700 });
    const allMatch = result.agents.every(a => a.reputation >= 700);
    if (!allMatch) throw new Error('Not all agents meet min reputation');
  });

  await test('filters by max price', async () => {
    const result = await discovery.discover({ maxPrice: 0.05 });
    const allMatch = result.agents.every(a => {
      const price = a.pricing.perTask ?? a.pricing.perToken ?? 0;
      return price <= 0.05;
    });
    if (!allMatch) throw new Error('Not all agents meet max price');
  });

  await test('respects limit', async () => {
    const result = await discovery.discover({ limit: 2 });
    if (result.agents.length > 2) throw new Error('Exceeded limit');
  });

  console.log('\nfindBestMatch:');
  await test('returns single agent', async () => {
    const agent = await discovery.findBestMatch('code-review');
    if (agent && !agent.id) throw new Error('Agent missing id');
  });

  await test('returns null when no match', async () => {
    const agent = await discovery.findBestMatch('nonexistent-capability');
    if (agent !== null) throw new Error('Expected null for no match');
  });

  await test('respects min reputation', async () => {
    const agent = await discovery.findBestMatch('code-generation', { minReputation: 999 });
    if (agent && agent.reputation < 999) throw new Error('Agent below min reputation');
  });

  console.log('\nfindByCapabilities:');
  await test('returns agents with any capability', async () => {
    const result = await discovery.findByCapabilities(['code-generation', 'image-generation']);
    if (!Array.isArray(result.agents)) throw new Error('Expected agents array');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
