import { EscrowClient, createEscrowClient } from '../src/escrow.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  })();
}

function assert(condition: boolean, message?: string) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\nEscrow Client Tests\n');

// Generate test keypair
const testKeypair = Keypair.generate();
const testPrivateKey = bs58.encode(testKeypair.secretKey);
const validPubkey = testKeypair.publicKey.toBase58();

console.log('createEscrowClient validation:');

await test('rejects missing RPC URL', async () => {
  try {
    await createEscrowClient({
      rpcUrl: '',
      privateKey: testPrivateKey,
      programId: validPubkey,
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('RPC URL'));
  }
});

await test('rejects missing private key', async () => {
  try {
    await createEscrowClient({
      rpcUrl: 'https://api.devnet.solana.com',
      privateKey: '',
      programId: validPubkey,
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('Private key'));
  }
});

await test('rejects invalid program ID', async () => {
  try {
    await createEscrowClient({
      rpcUrl: 'https://api.devnet.solana.com',
      privateKey: testPrivateKey,
      programId: 'invalid',
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('program ID'));
  }
});

await test('rejects invalid treasury address', async () => {
  try {
    await createEscrowClient({
      rpcUrl: 'https://api.devnet.solana.com',
      privateKey: testPrivateKey,
      programId: validPubkey,
      treasuryAddress: 'not-valid',
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('treasury'));
  }
});

await test('rejects invalid private key format', async () => {
  try {
    await createEscrowClient({
      rpcUrl: 'https://api.devnet.solana.com',
      privateKey: 'not-base58!!!',
      programId: validPubkey,
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('Invalid private key'));
  }
});

await test('rejects private key with wrong length', async () => {
  try {
    await createEscrowClient({
      rpcUrl: 'https://api.devnet.solana.com',
      privateKey: bs58.encode(new Uint8Array(32)), // Too short
      programId: validPubkey,
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('length'));
  }
});

await test('creates client with valid config', async () => {
  const client = await createEscrowClient({
    rpcUrl: 'https://api.devnet.solana.com',
    privateKey: testPrivateKey,
    programId: validPubkey,
  });
  assert(client !== null);
  assert(client.publicKey.toBase58() === validPubkey);
});

console.log('\nEscrowClient.createEscrow validation:');

const client = await createEscrowClient({
  rpcUrl: 'https://api.devnet.solana.com',
  privateKey: testPrivateKey,
  programId: validPubkey,
});

await test('rejects missing treasury address', async () => {
  const result = await client.createEscrow({
    requester: validPubkey,
    amount: 0.5,
    jobId: 'job-123',
  });
  assert(result.success === false);
  assert(result.error?.includes('Treasury'));
});

const clientWithTreasury = await createEscrowClient({
  rpcUrl: 'https://api.devnet.solana.com',
  privateKey: testPrivateKey,
  programId: validPubkey,
  treasuryAddress: validPubkey,
});

await test('rejects invalid requester address', async () => {
  const result = await clientWithTreasury.createEscrow({
    requester: 'invalid',
    amount: 0.5,
    jobId: 'job-123',
  });
  assert(result.success === false);
  assert(result.error?.includes('requester'));
});

await test('rejects amount below minimum', async () => {
  const result = await clientWithTreasury.createEscrow({
    requester: validPubkey,
    amount: 0.0001,
    jobId: 'job-123',
  });
  assert(result.success === false);
  assert(result.error?.includes('at least'));
});

await test('rejects amount above maximum', async () => {
  const result = await clientWithTreasury.createEscrow({
    requester: validPubkey,
    amount: 2000,
    jobId: 'job-123',
  });
  assert(result.success === false);
  assert(result.error?.includes('exceed'));
});

await test('rejects invalid amount (NaN)', async () => {
  const result = await clientWithTreasury.createEscrow({
    requester: validPubkey,
    amount: NaN,
    jobId: 'job-123',
  });
  assert(result.success === false);
  assert(result.error?.includes('at least'));
});

await test('rejects empty job ID', async () => {
  const result = await clientWithTreasury.createEscrow({
    requester: validPubkey,
    amount: 0.5,
    jobId: '',
  });
  assert(result.success === false);
  assert(result.error?.includes('job ID'));
});

await test('rejects job ID exceeding max length', async () => {
  const result = await clientWithTreasury.createEscrow({
    requester: validPubkey,
    amount: 0.5,
    jobId: 'x'.repeat(200),
  });
  assert(result.success === false);
  assert(result.error?.includes('job ID'));
});

console.log('\nEscrowClient.releaseEscrow validation:');

await test('rejects invalid escrow address', async () => {
  const result = await clientWithTreasury.releaseEscrow({
    escrowAddress: 'invalid',
    rating: 4,
  });
  assert(result.success === false);
  assert(result.error?.includes('escrow address'));
});

await test('rejects rating below minimum', async () => {
  const result = await clientWithTreasury.releaseEscrow({
    escrowAddress: validPubkey,
    rating: 0,
  });
  assert(result.success === false);
  assert(result.error?.includes('Rating'));
});

await test('rejects rating above maximum', async () => {
  const result = await clientWithTreasury.releaseEscrow({
    escrowAddress: validPubkey,
    rating: 6,
  });
  assert(result.success === false);
  assert(result.error?.includes('Rating'));
});

await test('rejects non-integer rating', async () => {
  const result = await clientWithTreasury.releaseEscrow({
    escrowAddress: validPubkey,
    rating: 3.5,
  });
  assert(result.success === false);
  assert(result.error?.includes('Rating'));
});

console.log('\nEscrowClient.checkStatus validation:');

await test('returns null for invalid address', async () => {
  const result = await clientWithTreasury.checkStatus('invalid');
  assert(result === null);
});

await test('returns null for empty address', async () => {
  const result = await clientWithTreasury.checkStatus('');
  assert(result === null);
});

console.log('\nEscrowClient PDA derivation:');

await test('getEscrowPDA returns valid pubkey', () => {
  const sessionId = new Uint8Array(32).fill(1);
  const [pda, bump] = clientWithTreasury.getEscrowPDA(sessionId);
  assert(pda instanceof PublicKey);
  assert(bump >= 0 && bump <= 255);
});

await test('getTokenTreasuryPDA returns valid pubkey', () => {
  const [pda, bump] = clientWithTreasury.getTokenTreasuryPDA();
  assert(pda instanceof PublicKey);
  assert(bump >= 0 && bump <= 255);
});

await test('same session ID produces same PDA', () => {
  const sessionId = new Uint8Array(32).fill(42);
  const [pda1] = clientWithTreasury.getEscrowPDA(sessionId);
  const [pda2] = clientWithTreasury.getEscrowPDA(sessionId);
  assert(pda1.equals(pda2));
});

await test('different session IDs produce different PDAs', () => {
  const sessionId1 = new Uint8Array(32).fill(1);
  const sessionId2 = new Uint8Array(32).fill(2);
  const [pda1] = clientWithTreasury.getEscrowPDA(sessionId1);
  const [pda2] = clientWithTreasury.getEscrowPDA(sessionId2);
  assert(!pda1.equals(pda2));
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
