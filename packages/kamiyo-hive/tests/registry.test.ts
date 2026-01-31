import { Connection, Keypair } from '@solana/web3.js';
import { AgentRegistry } from '../src/registry.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const keypair = Keypair.generate();

const registry = new AgentRegistry({
  connection,
  keypair,
  programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
  apiEndpoint: 'http://localhost:3000',
});

async function runTests() {
  console.log('\nAgentRegistry Tests\n');

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

  console.log('register:');

  await test('registers agent successfully', async () => {
    const result = await registry.register({
      capabilities: ['code-generation', 'code-review'],
      pricing: { perTask: 0.05, currency: 'SOL' },
      endpoint: 'https://my-agent.example.com',
    });
    if (!result.success) throw new Error(result.error || 'Failed');
    if (!result.agentId) throw new Error('Missing agentId');
  });

  await test('rejects empty capabilities', async () => {
    const result = await registry.register({
      capabilities: [],
      pricing: { perTask: 0.05, currency: 'SOL' },
      endpoint: 'https://test.com',
    });
    if (result.success) throw new Error('Should have failed');
  });

  await test('rejects invalid pricing', async () => {
    const result = await registry.register({
      capabilities: ['code-generation'],
      pricing: { perTask: -1, currency: 'SOL' },
      endpoint: 'https://test.com',
    });
    if (result.success) throw new Error('Should have failed');
  });

  await test('rejects invalid endpoint URL', async () => {
    const result = await registry.register({
      capabilities: ['code-generation'],
      pricing: { perTask: 0.05, currency: 'SOL' },
      endpoint: 'not-a-url',
    });
    if (result.success) throw new Error('Should have failed');
  });

  await test('rejects too many capabilities', async () => {
    const caps = Array.from({ length: 25 }, (_, i) => `cap-${i}` as any);
    const result = await registry.register({
      capabilities: caps,
      pricing: { perTask: 0.05, currency: 'SOL' },
      endpoint: 'https://test.com',
    });
    if (result.success) throw new Error('Should have failed');
  });

  console.log('\nget:');

  await test('retrieves agent by ID', async () => {
    const result = await registry.register({
      capabilities: ['data-analysis'],
      pricing: { perTask: 0.1, currency: 'SOL' },
      endpoint: 'https://data-agent.example.com',
    });
    const agent = await registry.get(result.agentId!);
    if (!agent) throw new Error('Agent not found');
    if (!agent.capabilities.includes('data-analysis')) throw new Error('Wrong capabilities');
  });

  await test('returns null for unknown ID', async () => {
    const agent = await registry.get('nonexistent-id');
    if (agent !== null) throw new Error('Should return null');
  });

  console.log('\ngetByAddress:');

  await test('retrieves agent by address', async () => {
    const createResult = await registry.register({
      capabilities: ['research'],
      pricing: { perTask: 0.02, currency: 'SOL' },
      endpoint: 'https://research-agent.example.com',
    });
    const agentById = await registry.get(createResult.agentId!);
    if (!agentById) throw new Error('Agent not found by ID');

    const agent = await registry.getByAddress(agentById.address);
    if (!agent) throw new Error('Agent not found by address');
  });

  console.log('\nupdate:');

  let agentId: string;
  await test('updates agent info', async () => {
    const createResult = await registry.register({
      capabilities: ['copywriting'],
      pricing: { perTask: 0.03, currency: 'SOL' },
      endpoint: 'https://copy-agent.example.com',
    });
    agentId = createResult.agentId!;

    const updateResult = await registry.update(agentId, {
      pricing: { perTask: 0.04, currency: 'SOL' },
    });
    if (!updateResult.success) throw new Error(updateResult.error || 'Failed');
  });

  console.log('\ndeactivate:');

  await test('deactivates agent', async () => {
    const result = await registry.deactivate(agentId);
    if (!result.success) throw new Error(result.error || 'Failed');
  });

  console.log('\ngetMyAgent:');

  await test('returns registered agent', async () => {
    const agent = await registry.getMyAgent();
    if (!agent) throw new Error('Should return registered agent');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
