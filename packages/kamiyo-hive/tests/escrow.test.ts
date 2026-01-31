import { Connection, Keypair } from '@solana/web3.js';
import { A2AEscrow } from '../src/escrow.js';
import type { AgentInfo } from '../src/types.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const keypair = Keypair.generate();

const escrow = new A2AEscrow({
  connection,
  keypair,
  programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
});

const mockAgent: AgentInfo = {
  id: 'test-agent-1',
  address: Keypair.generate().publicKey.toBase58(),
  capabilities: ['code-generation'],
  reputation: 750,
  totalJobs: 10,
  successRate: 0.9,
  avgResponseTime: 5000,
  pricing: { perTask: 0.05, currency: 'SOL' },
  status: 'active',
  endpoint: 'https://agent.example.com',
  registeredAt: Date.now(),
  lastActiveAt: Date.now(),
};

async function runTests() {
  console.log('\nA2AEscrow Tests\n');

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

  console.log('createEscrow:');

  await test('creates escrow successfully', async () => {
    const result = await escrow.createEscrow(mockAgent, {
      capability: 'code-generation',
      spec: 'Write a function',
      budget: 0.05,
    });
    if (!result.success) throw new Error(result.error || 'Failed');
    if (!result.escrowAddress) throw new Error('Missing escrow address');
    if (!result.signature) throw new Error('Missing signature');
  });

  await test('rejects invalid provider', async () => {
    const badAgent = { ...mockAgent, id: '' };
    const result = await escrow.createEscrow(badAgent, {
      capability: 'code-generation',
      spec: 'test',
      budget: 0.05,
    });
    if (result.success) throw new Error('Should have failed');
  });

  await test('rejects missing spec', async () => {
    const result = await escrow.createEscrow(mockAgent, {
      capability: 'code-generation',
      spec: '',
      budget: 0.05,
    });
    if (result.success) throw new Error('Should have failed');
  });

  await test('rejects invalid budget', async () => {
    const result = await escrow.createEscrow(mockAgent, {
      capability: 'code-generation',
      spec: 'test',
      budget: 0,
    });
    if (result.success) throw new Error('Should have failed');
  });

  await test('rejects budget below minimum', async () => {
    const result = await escrow.createEscrow(mockAgent, {
      capability: 'code-generation',
      spec: 'test',
      budget: 0.00001,
    });
    if (result.success) throw new Error('Should have failed');
  });

  await test('rejects deadline below minimum', async () => {
    const result = await escrow.createEscrow(mockAgent, {
      capability: 'code-generation',
      spec: 'test',
      budget: 0.05,
      deadline: 1000,
    });
    if (result.success) throw new Error('Should have failed');
  });

  console.log('\ngetHiredAgent:');

  let escrowAddress: string;
  await test('returns hired agent', async () => {
    const result = await escrow.createEscrow(mockAgent, {
      capability: 'code-generation',
      spec: 'Build a REST API',
      budget: 0.1,
    });
    escrowAddress = result.escrowAddress!;

    const hire = escrow.getHiredAgent(escrowAddress);
    if (!hire) throw new Error('Hire not found');
    if (hire.agentId !== mockAgent.id) throw new Error('Wrong agent ID');
    if (hire.status !== 'pending') throw new Error('Wrong initial status');
  });

  await test('returns undefined for unknown escrow', () => {
    const hire = escrow.getHiredAgent('unknown');
    if (hire !== undefined) throw new Error('Should return undefined');
  });

  console.log('\nsubmitDelivery:');

  await test('updates hire status', async () => {
    const result = await escrow.submitDelivery(escrowAddress, 'Here is the code');
    if (!result.success) throw new Error(result.error || 'Failed');

    const hire = escrow.getHiredAgent(escrowAddress);
    if (hire?.status !== 'delivered') throw new Error(`Wrong status: ${hire?.status}`);
  });

  await test('rejects missing escrow address', async () => {
    const result = await escrow.submitDelivery('', 'test');
    if (result.success) throw new Error('Should have failed');
  });

  console.log('\nreleasePayment:');

  await test('marks hire as completed', async () => {
    const result = await escrow.releasePayment(escrowAddress);
    if (!result.success) throw new Error(result.error || 'Failed');

    const hire = escrow.getHiredAgent(escrowAddress);
    if (hire?.status !== 'completed') throw new Error(`Wrong status: ${hire?.status}`);
  });

  console.log('\nfileDispute:');

  let disputeEscrow: string;
  await test('marks hire as disputed', async () => {
    const createResult = await escrow.createEscrow(mockAgent, {
      capability: 'code-generation',
      spec: 'Build something',
      budget: 0.05,
    });
    disputeEscrow = createResult.escrowAddress!;

    const result = await escrow.fileDispute(disputeEscrow, 'Low quality');
    if (!result.success) throw new Error(result.error || 'Failed');

    const hire = escrow.getHiredAgent(disputeEscrow);
    if (hire?.status !== 'disputed') throw new Error(`Wrong status: ${hire?.status}`);
  });

  await test('rejects missing reason', async () => {
    const result = await escrow.fileDispute(disputeEscrow, '');
    if (result.success) throw new Error('Should have failed');
  });

  console.log('\ngetAllActiveHires:');

  test('returns array of hires', () => {
    const hires = escrow.getAllActiveHires();
    if (!Array.isArray(hires)) throw new Error('Expected array');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
