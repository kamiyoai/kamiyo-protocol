import { JobDatabase } from '../src/db.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let db: JobDatabase;
let dbPath: string;

function setup(): void {
  dbPath = path.join(os.tmpdir(), `moltbook-test-${Date.now()}.db`);
  db = new JobDatabase(dbPath);
}

function cleanup(): void {
  db.close();
  try {
    fs.unlinkSync(dbPath);
    fs.unlinkSync(dbPath + '-wal');
    fs.unlinkSync(dbPath + '-shm');
  } catch {
    // Ignore cleanup errors
  }
}

async function test(name: string, fn: () => Promise<void> | void): Promise<boolean> {
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
  console.log('\nJobDatabase Tests\n');
  let passed = 0;
  let failed = 0;

  setup();

  console.log('Seen posts:');

  if (await test('marks post as seen', () => {
    db.markSeen('post-1');
    assert(db.hasSeenPost('post-1'), 'should be seen');
  })) passed++; else failed++;

  if (await test('unseen post returns false', () => {
    assert(!db.hasSeenPost('never-seen'), 'should not be seen');
  })) passed++; else failed++;

  if (await test('ignores empty post ID', () => {
    db.markSeen('');
    assert(!db.hasSeenPost(''), 'empty should not be seen');
  })) passed++; else failed++;

  if (await test('ignores long post ID', () => {
    const longId = 'x'.repeat(101);
    db.markSeen(longId);
    assert(!db.hasSeenPost(longId), 'long ID should be ignored');
  })) passed++; else failed++;

  console.log('\nOffers:');

  if (await test('saves and retrieves offer', () => {
    db.saveOffer('offer-post-1', 0.5);
    const offer = db.getOffer('offer-post-1');
    assert(offer !== null, 'should find offer');
    assert(offer?.priceSol === 0.5, 'should have correct price');
    assert(offer?.status === 'pending', 'should be pending');
  })) passed++; else failed++;

  if (await test('gets pending offers', () => {
    db.saveOffer('pending-1', 0.1);
    db.saveOffer('pending-2', 0.2);
    const pending = db.getPendingOffers();
    assert(pending.length >= 2, 'should have pending offers');
  })) passed++; else failed++;

  if (await test('updates offer status', () => {
    db.saveOffer('status-test', 0.3);
    db.updateOfferStatus('status-test', 'accepted');
    const offer = db.getOffer('status-test');
    assert(offer?.status === 'accepted', 'should be accepted');
  })) passed++; else failed++;

  console.log('\nJobs:');

  if (await test('creates job and returns ID', () => {
    const id = db.createJob({
      postId: 'job-post-1',
      requesterWallet: 'wallet123',
      amountSol: 1.0,
      description: 'Test job',
    });
    assert(id > 0, 'should return positive ID');
  })) passed++; else failed++;

  if (await test('retrieves job by ID', () => {
    const id = db.createJob({
      postId: 'job-post-2',
      requesterWallet: 'wallet456',
      amountSol: 0.5,
      description: 'Another job',
    });
    const job = db.getJob(id);
    assert(job !== null, 'should find job');
    assert(job?.requesterWallet === 'wallet456', 'should have correct wallet');
    assert(job?.status === 'created', 'should be created status');
  })) passed++; else failed++;

  if (await test('retrieves job by post ID', () => {
    db.createJob({
      postId: 'unique-post',
      requesterWallet: 'wallet789',
      amountSol: 0.25,
      description: 'Unique job',
    });
    const job = db.getJobByPostId('unique-post');
    assert(job !== null, 'should find by post ID');
    assert(job?.amountSol === 0.25, 'should have correct amount');
  })) passed++; else failed++;

  if (await test('gets active jobs', () => {
    const id = db.createJob({
      postId: 'active-job',
      requesterWallet: 'active-wallet',
      amountSol: 0.1,
      description: 'Active job',
    });
    const active = db.getActiveJobs();
    assert(active.some(j => j.id === id), 'should include new job');
  })) passed++; else failed++;

  if (await test('updates job status', () => {
    const id = db.createJob({
      postId: 'status-job',
      requesterWallet: 'status-wallet',
      amountSol: 0.1,
      description: 'Status job',
    });
    db.updateJobStatus(id, 'in_progress');
    const job = db.getJob(id);
    assert(job?.status === 'in_progress', 'should be in_progress');
  })) passed++; else failed++;

  if (await test('sets job escrow', () => {
    const id = db.createJob({
      postId: 'escrow-job',
      requesterWallet: 'escrow-wallet',
      amountSol: 0.1,
      description: 'Escrow job',
    });
    db.setJobEscrow(id, 'escrow-address-123', 'tx-sig-456');
    const job = db.getJob(id);
    assert(job?.escrowAddress === 'escrow-address-123', 'should have escrow address');
    assert(job?.escrowTx === 'tx-sig-456', 'should have escrow tx');
    assert(job?.status === 'in_progress', 'should update status');
  })) passed++; else failed++;

  if (await test('sets job deliverable', () => {
    const id = db.createJob({
      postId: 'deliverable-job',
      requesterWallet: 'deliver-wallet',
      amountSol: 0.1,
      description: 'Deliverable job',
    });
    db.setJobDeliverable(id, 'Here is the completed work');
    const job = db.getJob(id);
    assert(job?.deliverable === 'Here is the completed work', 'should have deliverable');
    assert(job?.status === 'delivered', 'should be delivered');
  })) passed++; else failed++;

  cleanup();

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
