import {
  KAMIYO_PERSONALITY,
  TIER_CONFIG,
  getTierFromScore,
  getTierByName,
} from '../src/personality.js';
import {
  parseCommand,
  generateHelpResponse,
  generateStatusResponse,
  generateVerifyResponse,
  generateTrustResponse,
  generateBadgeResponse,
} from '../src/commands.js';
import type { MoltbookComment } from '../src/types.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(condition: boolean, message?: string) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\nPersonality Tests\n');

console.log('KAMIYO_PERSONALITY:');
test('has correct name', () => {
  assert(KAMIYO_PERSONALITY.name === 'KAMIYO');
});

test('has correct handle', () => {
  assert(KAMIYO_PERSONALITY.handle === 'kamiyo');
});

test('has topics defined', () => {
  assert(KAMIYO_PERSONALITY.topics.length > 0);
});

test('topics have weights that sum to 100', () => {
  const sum = KAMIYO_PERSONALITY.topics.reduce((a, t) => a + t.weight, 0);
  assert(sum === 100, `Expected 100, got ${sum}`);
});

test('voice avoids marketing words', () => {
  assert(KAMIYO_PERSONALITY.voice.avoidWords.includes('revolutionary'));
  assert(KAMIYO_PERSONALITY.voice.avoidWords.includes('game-changing'));
});

console.log('\nTier System:');
test('has 4 tiers', () => {
  assert(TIER_CONFIG.length === 4);
});

test('tiers are ordered by threshold', () => {
  for (let i = 1; i < TIER_CONFIG.length; i++) {
    assert(TIER_CONFIG[i].threshold > TIER_CONFIG[i - 1].threshold);
  }
});

test('getTierFromScore returns correct tier', () => {
  assert(getTierFromScore(10) === null);
  assert(getTierFromScore(25)?.name === 'bronze');
  assert(getTierFromScore(50)?.name === 'silver');
  assert(getTierFromScore(75)?.name === 'gold');
  assert(getTierFromScore(90)?.name === 'platinum');
  assert(getTierFromScore(100)?.name === 'platinum');
});

test('getTierByName returns correct config', () => {
  const gold = getTierByName('gold');
  assert(gold?.threshold === 75);
  assert(gold?.label === 'Gold');
});

console.log('\nCommand Parsing:');

function makeComment(content: string): MoltbookComment {
  return {
    id: 'test-id',
    post_id: 'test-post',
    author: 'test-author',
    content,
    created_at: new Date().toISOString(),
  };
}

test('parses help command', () => {
  const cmd = parseCommand(makeComment('@kamiyo help'));
  assert(cmd.type === 'help');
});

test('parses verify command', () => {
  const cmd = parseCommand(makeComment('@kamiyo verify my reputation'));
  assert(cmd.type === 'verify');
});

test('parses verify with agent', () => {
  const cmd = parseCommand(makeComment('@kamiyo verify @agent123'));
  assert(cmd.type === 'verify');
  assert(cmd.mentionedAgents.includes('agent123'));
});

test('parses trust command', () => {
  const cmd = parseCommand(makeComment('@kamiyo trust @another'));
  assert(cmd.type === 'trust');
  assert(cmd.mentionedAgents.includes('another'));
});

test('parses badge command', () => {
  const cmd = parseCommand(makeComment('@kamiyo my badges'));
  assert(cmd.type === 'badge');
});

test('parses status command', () => {
  const cmd = parseCommand(makeComment('@kamiyo status'));
  assert(cmd.type === 'status');
});

test('returns unknown for unrecognized', () => {
  const cmd = parseCommand(makeComment('@kamiyo do something random'));
  assert(cmd.type === 'unknown');
});

console.log('\nCommand Responses:');

test('help response includes commands', () => {
  const result = generateHelpResponse();
  assert(result.success);
  assert(result.response.includes('verify'));
  assert(result.response.includes('trust'));
  assert(result.response.includes('escrow'));
});

test('status response shows stats', () => {
  const result = generateStatusResponse({
    verifications: 42,
    trustEdges: 100,
    escrowVolume: 5.5,
  });
  assert(result.success);
  assert(result.response.includes('42'));
  assert(result.response.includes('100'));
  assert(result.response.includes('5.50'));
});

test('verify response shows tier', () => {
  const tier = getTierFromScore(80);
  const result = generateVerifyResponse('test-agent', tier, 'hash123');
  assert(result.success);
  assert(result.response.includes('Gold'));
  assert(result.response.includes('test-agent'));
});

test('verify response handles null tier', () => {
  const result = generateVerifyResponse('unknown-agent', null);
  assert(!result.success);
  assert(result.response.includes('Unable to verify'));
});

test('trust response confirms edge', () => {
  const result = generateTrustResponse('agent1', 'agent2', true);
  assert(result.success);
  assert(result.response.includes('agent1'));
  assert(result.response.includes('agent2'));
});

test('badge response lists badges', () => {
  const result = generateBadgeResponse('test-agent', [
    { type: 'reputation-verified', tier: 75, issuedAt: Date.now() },
  ]);
  assert(result.success);
  assert(result.response.includes('reputation-verified'));
});

test('badge response handles empty list', () => {
  const result = generateBadgeResponse('new-agent', []);
  assert(result.success);
  assert(result.response.includes('no badges'));
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
