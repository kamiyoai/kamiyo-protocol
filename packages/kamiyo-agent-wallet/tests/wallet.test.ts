import { Connection, Keypair } from '@solana/web3.js';
import { AgentWallet, createAgentWallet } from '../src/wallet.js';

const TEST_KEYPAIR = Keypair.generate();
const TEST_CONNECTION = new Connection('https://api.devnet.solana.com', 'confirmed');

function createTestWallet(overrides: Partial<Parameters<typeof createAgentWallet>[0]> = {}): AgentWallet {
  return createAgentWallet({
    keypair: TEST_KEYPAIR,
    connection: TEST_CONNECTION,
    ...overrides,
  });
}

async function test(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

async function runTests(): Promise<void> {
  console.log('\nAgentWallet Tests\n');
  let passed = 0;
  let failed = 0;

  // Constructor tests
  console.log('Constructor:');

  if (await test('creates wallet with valid config', async () => {
    const wallet = createTestWallet();
    assert(wallet.address.length > 30, 'should have valid address');
  })) passed++; else failed++;

  if (await test('uses default program ID', async () => {
    const wallet = createTestWallet();
    assert(wallet.publicKey !== null, 'should have public key');
  })) passed++; else failed++;

  // fetch validation tests
  console.log('\nfetch() validation:');

  if (await test('rejects invalid URL', async () => {
    const wallet = createTestWallet();
    const result = await wallet.fetch('not-a-url');
    assert(!result.success, 'should fail');
    assert(result.error === 'Invalid URL', 'should report invalid URL');
  })) passed++; else failed++;

  if (await test('rejects non-http protocol', async () => {
    const wallet = createTestWallet();
    const result = await wallet.fetch('ftp://example.com/data');
    assert(!result.success, 'should fail');
    assert(result.error === 'Invalid URL protocol', 'should report invalid protocol');
  })) passed++; else failed++;

  if (await test('rejects invalid max price', async () => {
    const wallet = createTestWallet();
    const result = await wallet.fetch('https://example.com', { maxPriceUsd: -1 });
    assert(!result.success, 'should fail');
    assert(result.error === 'Invalid max price', 'should report invalid price');
  })) passed++; else failed++;

  // createEscrow validation tests
  console.log('\ncreateEscrow() validation:');

  if (await test('rejects empty job ID', async () => {
    const wallet = createTestWallet();
    const result = await wallet.createEscrow({ jobId: '', amountSol: 0.1 });
    assert(!result.success, 'should fail');
    assert(result.error === 'Invalid job ID', 'should report invalid job ID');
  })) passed++; else failed++;

  if (await test('rejects job ID with special chars', async () => {
    const wallet = createTestWallet();
    const result = await wallet.createEscrow({ jobId: 'job/../etc', amountSol: 0.1 });
    assert(!result.success, 'should fail');
    assert(result.error === 'Job ID contains invalid characters', 'should report invalid chars');
  })) passed++; else failed++;

  if (await test('rejects negative amount', async () => {
    const wallet = createTestWallet();
    const result = await wallet.createEscrow({ jobId: 'job-123', amountSol: -1 });
    assert(!result.success, 'should fail');
    assert(result.error === 'Invalid escrow amount', 'should report invalid amount');
  })) passed++; else failed++;

  if (await test('accepts valid escrow params', async () => {
    const wallet = createTestWallet();
    const result = await wallet.createEscrow({ jobId: 'job-123', amountSol: 0.1 });
    assert(result.success, 'should succeed');
    assert(result.escrowAddress !== undefined, 'should have escrow address');
  })) passed++; else failed++;

  // fileDispute validation tests
  console.log('\nfileDispute() validation:');

  if (await test('rejects invalid escrow address', async () => {
    const wallet = createTestWallet();
    const result = await wallet.fileDispute({
      escrowAddress: 'invalid',
      qualityScore: 25,
      evidence: 'Missing data',
      requestedRefundPercent: 75,
    });
    assert(!result.success, 'should fail');
    assert(result.error === 'Invalid escrow address', 'should report invalid address');
  })) passed++; else failed++;

  if (await test('rejects quality score out of range', async () => {
    const wallet = createTestWallet();
    const result = await wallet.fileDispute({
      escrowAddress: TEST_KEYPAIR.publicKey.toBase58(),
      qualityScore: 150,
      evidence: 'Missing data',
      requestedRefundPercent: 75,
    });
    assert(!result.success, 'should fail');
    assert(result.error === 'Quality score must be 0-100', 'should report invalid score');
  })) passed++; else failed++;

  if (await test('rejects empty evidence', async () => {
    const wallet = createTestWallet();
    const result = await wallet.fileDispute({
      escrowAddress: TEST_KEYPAIR.publicKey.toBase58(),
      qualityScore: 25,
      evidence: '',
      requestedRefundPercent: 75,
    });
    assert(!result.success, 'should fail');
  })) passed++; else failed++;

  // Job tracking tests
  console.log('\nJob tracking:');

  if (await test('tracks and retrieves jobs', async () => {
    const wallet = createTestWallet();
    wallet.trackJob({
      jobId: 'test-job',
      description: 'Test',
      requester: 'test',
      amountSol: 0.1,
      status: 'pending',
    });
    const job = wallet.getJob('test-job');
    assert(job !== undefined, 'should find job');
    assert(job?.jobId === 'test-job', 'should match job ID');
  })) passed++; else failed++;

  if (await test('updates job status', async () => {
    const wallet = createTestWallet();
    wallet.trackJob({
      jobId: 'update-test',
      description: 'Test',
      requester: 'test',
      amountSol: 0.1,
      status: 'pending',
    });
    wallet.updateJob('update-test', { status: 'in_progress' });
    const job = wallet.getJob('update-test');
    assert(job?.status === 'in_progress', 'should update status');
  })) passed++; else failed++;

  if (await test('filters active jobs', async () => {
    const wallet = createTestWallet();
    wallet.trackJob({ jobId: 'active', description: '', requester: '', amountSol: 0.1, status: 'in_progress' });
    wallet.trackJob({ jobId: 'done', description: '', requester: '', amountSol: 0.1, status: 'completed' });
    const active = wallet.getActiveJobs();
    assert(active.length === 1, 'should filter completed');
    assert(active[0].jobId === 'active', 'should return active job');
  })) passed++; else failed++;

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
