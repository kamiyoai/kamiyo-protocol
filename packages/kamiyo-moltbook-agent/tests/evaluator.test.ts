import { hasRelevantKeywords, formatOffer } from '../src/evaluator.js';
import type { MoltbookPost } from '../src/types.js';

function createPost(title: string, body: string): MoltbookPost {
  return {
    id: 'test-post',
    title,
    body,
    author: 'test',
    createdAt: Date.now(),
    votes: 0,
  };
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
  console.log('\nEvaluator Tests\n');
  let passed = 0;
  let failed = 0;

  console.log('hasRelevantKeywords:');

  if (await test('detects escrow keyword', () => {
    const post = createPost('Need escrow help', 'Looking for escrow implementation');
    assert(hasRelevantKeywords(post), 'should detect escrow');
  })) passed++; else failed++;

  if (await test('detects reputation keyword', () => {
    const post = createPost('Reputation system', 'Building a reputation tracker');
    assert(hasRelevantKeywords(post), 'should detect reputation');
  })) passed++; else failed++;

  if (await test('detects payment keyword', () => {
    const post = createPost('Payment flow', 'Need help with payment integration');
    assert(hasRelevantKeywords(post), 'should detect payment');
  })) passed++; else failed++;

  if (await test('detects dispute keyword', () => {
    const post = createPost('Dispute resolution', 'How to handle disputes');
    assert(hasRelevantKeywords(post), 'should detect dispute');
  })) passed++; else failed++;

  if (await test('case insensitive matching', () => {
    const post = createPost('ESCROW SERVICE', 'PAYMENT DISPUTE');
    assert(hasRelevantKeywords(post), 'should match uppercase');
  })) passed++; else failed++;

  if (await test('rejects irrelevant post', () => {
    const post = createPost('Recipe for cookies', 'Mix flour and sugar');
    assert(!hasRelevantKeywords(post), 'should reject irrelevant');
  })) passed++; else failed++;

  if (await test('checks both title and body', () => {
    const post = createPost('General question', 'Something about escrow');
    assert(hasRelevantKeywords(post), 'should check body');
  })) passed++; else failed++;

  console.log('\nformatOffer:');

  if (await test('includes price in offer', () => {
    const offer = formatOffer({ relevant: true, reason: '', suggestedPrice: 0.5 });
    assert(offer.includes('0.5 SOL'), 'should include price');
  })) passed++; else failed++;

  if (await test('uses default price when undefined', () => {
    const offer = formatOffer({ relevant: true, reason: '' });
    assert(offer.includes('0.05 SOL'), 'should use default');
  })) passed++; else failed++;

  if (await test('mentions KAMIYO escrow', () => {
    const offer = formatOffer({ relevant: true, reason: '', suggestedPrice: 0.1 });
    assert(offer.includes('KAMIYO escrow'), 'should mention KAMIYO');
  })) passed++; else failed++;

  if (await test('explains escrow flow', () => {
    const offer = formatOffer({ relevant: true, reason: '', suggestedPrice: 0.1 });
    assert(offer.includes('create an escrow'), 'should explain step 1');
    assert(offer.includes('complete the work'), 'should explain step 2');
    assert(offer.includes('release payment'), 'should explain step 3');
  })) passed++; else failed++;

  if (await test('asks for wallet address', () => {
    const offer = formatOffer({ relevant: true, reason: '', suggestedPrice: 0.1 });
    assert(offer.includes('wallet address'), 'should ask for wallet');
  })) passed++; else failed++;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
