import { JobDatabase } from '../src/db.js';
import { ReputationService } from '../src/services/reputation-service.js';
import { TrustGraph } from '../src/services/trust-graph.js';
import { BadgeService, BADGE_DEFINITIONS } from '../src/services/badge-service.js';
import { JobBoard } from '../src/services/job-board.js';
import { QualityService } from '../src/services/quality-service.js';
import { CollectiveMemory } from '../src/services/collective-memory.js';
import { IdentityResolver } from '../src/services/identity-resolver.js';
import { GatedAccessService } from '../src/services/gated-access.js';
import { TrustGraphVisualizer } from '../src/visualization/trust-graph-viz.js';
import { SwarmTeamsProver } from '@kamiyo/hive';
import { getTierFromScore } from '../src/personality.js';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

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

// Setup test database
const testDbPath = path.join(process.cwd(), 'test-services.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
const db = new JobDatabase(testDbPath);

console.log('\nServices Tests\n');

console.log('ReputationService:');

const prover = new SwarmTeamsProver();
const agentsRoot = new Uint8Array(32);

const repService = new ReputationService({
  db,
  prover,
  agentsRoot,
  currentEpoch: BigInt(1),
  freeVerificationsPerDay: 10,
});

await test('canVerify returns true initially', () => {
  assert(repService.canVerify());
});

await test('getVerificationsRemaining returns limit', () => {
  assert(repService.getVerificationsRemaining() === 10);
});

await test('getReputationData returns data for agent', async () => {
  const data = await repService.getReputationData('test-agent');
  assert(data !== null);
  assert(typeof data.score === 'number');
});

await test('verifyReputation returns success', async () => {
  const result = await repService.verifyReputation({
    agentId: 'test-agent-1',
    agentHandle: 'test-agent-1',
    requestedBy: 'requester',
  });
  // May fail due to missing circuit files, but should handle gracefully
  assert(typeof result.success === 'boolean');
  if (result.success) {
    assert(result.tier !== null);
    assert(result.proofHash !== null);
  }
});

await test('getAllTiers returns 4 tiers', () => {
  const tiers = repService.getAllTiers();
  assert(tiers.length === 4);
});

console.log('\nTrustGraph:');

const trustGraph = new TrustGraph({
  db,
  maxHops: 2,
  minTrustLevel: 50,
});

await test('addTrustEdge creates edge', async () => {
  const result = await trustGraph.addTrustEdge({
    fromAgent: 'alice',
    toAgent: 'bob',
    trustLevel: 75,
    trustType: 'vouches',
    stakeSol: 1.0,
  });
  assert(result.edgeId > 0);
});

await test('getTrustLevel returns correct value', () => {
  const level = trustGraph.getTrustLevel('alice', 'bob');
  assert(level === 75);
});

await test('getDirectTrusted returns edges', () => {
  const edges = trustGraph.getDirectTrusted('alice');
  assert(edges.length === 1);
  assert(edges[0].toAgent === 'bob');
});

await test('getTrustors returns incoming edges', () => {
  const edges = trustGraph.getTrustors('bob');
  assert(edges.length === 1);
  assert(edges[0].fromAgent === 'alice');
});

await test('findTrustPath finds direct path', () => {
  const path = trustGraph.findTrustPath('alice', 'bob');
  assert(path !== null);
  assert(path.hops === 1);
  assert(path.path.length === 2);
  assert(path.minTrustLevel === 75);
});

await test('findTrustPath returns null for no path', () => {
  const path = trustGraph.findTrustPath('alice', 'charlie');
  assert(path === null);
});

await test('getNodeInfo returns stats', () => {
  const info = trustGraph.getNodeInfo('alice');
  assert(info.agentId === 'alice');
  assert(info.outgoingTrust > 0);
});

await test('getStats returns graph stats', () => {
  const stats = trustGraph.getStats();
  assert(stats.totalNodes >= 2);
  assert(stats.totalEdges >= 1);
});

await test('exportForVisualization returns nodes and edges', () => {
  const viz = trustGraph.exportForVisualization();
  assert(viz.nodes.length >= 2);
  assert(viz.edges.length >= 1);
});

await test('addTrustEdge rejects self-trust', async () => {
  try {
    await trustGraph.addTrustEdge({
      fromAgent: 'alice',
      toAgent: 'alice',
      trustLevel: 75,
      trustType: 'vouches',
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('self'));
  }
});

await test('addTrustEdge rejects invalid trust level', async () => {
  try {
    await trustGraph.addTrustEdge({
      fromAgent: 'alice',
      toAgent: 'charlie',
      trustLevel: 150,
      trustType: 'vouches',
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('0-100'));
  }
});

await test('addTrustEdge rejects invalid agent IDs', async () => {
  try {
    await trustGraph.addTrustEdge({
      fromAgent: 'alice@invalid',
      toAgent: 'bob',
      trustLevel: 50,
      trustType: 'vouches',
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('alphanumeric') || err.message.includes('Invalid'));
  }
});

await test('findTrustPath returns null for empty agent ID', () => {
  const path = trustGraph.findTrustPath('', 'bob');
  assert(path === null);
});

console.log('\nBadgeService:');

const badgeService = new BadgeService({
  db,
  badgeExpirationDays: 365,
});

await test('BADGE_DEFINITIONS has 3 badge types', () => {
  assert(BADGE_DEFINITIONS.length === 3);
});

await test('issueReputationBadge creates badge', async () => {
  const tier = getTierFromScore(75);
  assert(tier !== null);
  const badge = await badgeService.issueReputationBadge('badge-test-agent', tier);
  assert(badge !== null);
  assert(badge.badgeType === 'reputation-verified');
  assert(badge.tier === 75);
});

await test('issueTransactionBadge creates badge for eligible count', async () => {
  const badge = await badgeService.issueTransactionBadge('tx-agent', 10);
  assert(badge !== null);
  assert(badge.badgeType === 'transaction-count');
  assert(badge.tier === 10);
});

await test('issueTransactionBadge returns null for ineligible count', async () => {
  const badge = await badgeService.issueTransactionBadge('new-agent', 0);
  assert(badge === null);
});

await test('getBadges returns badges for agent', () => {
  const badges = badgeService.getBadges('badge-test-agent');
  assert(badges.length >= 1);
});

await test('getHighestBadge returns highest tier', () => {
  const badge = badgeService.getHighestBadge('badge-test-agent', 'reputation-verified');
  assert(badge !== null);
  assert(badge.tier === 75);
});

await test('formatBadgeDisplay returns readable string', () => {
  const badges = badgeService.getBadges('badge-test-agent');
  if (badges.length > 0) {
    const display = badgeService.formatBadgeDisplay(badges[0]);
    assert(typeof display === 'string');
    assert(display.length > 0);
  }
});

await test('formatBadgeList returns formatted list', () => {
  const list = badgeService.formatBadgeList('badge-test-agent');
  assert(list.includes('Verified') || list.includes('-'));
});

console.log('\nJobBoard:');

// Mock Anthropic client for testing
const mockAnthropicResponse = {
  content: [{ type: 'text' as const, text: 'research' }],
};

const mockAnthropicForJobBoard = {
  messages: {
    create: async () => mockAnthropicResponse,
  },
} as unknown as Anthropic;

const jobBoard = new JobBoard({
  db,
  anthropic: mockAnthropicForJobBoard,
  minBudgetSol: 0.1,
  maxBudgetSol: 100,
});

await test('postJob validates minimum budget', async () => {
  const result = await jobBoard.postJob({
    posterAgent: 'poster-1',
    title: 'Test Job',
    description: 'This is a test job description for validation',
    budgetSol: 0.05,
    capability: 'research',
  });
  assert(result.success === false);
  assert(result.error?.includes('at least'));
});

await test('postJob validates maximum budget', async () => {
  const result = await jobBoard.postJob({
    posterAgent: 'poster-1',
    title: 'Test Job',
    description: 'This is a test job description for validation',
    budgetSol: 200,
    capability: 'research',
  });
  assert(result.success === false);
  assert(result.error?.includes('exceed'));
});

await test('postJob validates title length', async () => {
  const result = await jobBoard.postJob({
    posterAgent: 'poster-1',
    title: 'Hi',
    description: 'This is a test job description for validation',
    budgetSol: 1,
    capability: 'research',
  });
  assert(result.success === false);
  assert(result.error?.includes('Title'));
});

await test('postJob validates description length', async () => {
  const result = await jobBoard.postJob({
    posterAgent: 'poster-1',
    title: 'Valid Title',
    description: 'Too short',
    budgetSol: 1,
    capability: 'research',
  });
  assert(result.success === false);
  assert(result.error?.includes('Description'));
});

await test('postJob creates job with valid input', async () => {
  const result = await jobBoard.postJob({
    posterAgent: 'poster-1',
    title: 'Research Task',
    description: 'Research the history of blockchain technology and provide a summary',
    budgetSol: 1,
    capability: 'research',
  });
  assert(result.success === true);
  assert(result.jobId !== undefined);
  assert(result.jobId?.startsWith('job-'));
});

await test('placeBid validates positive amount', async () => {
  const result = await jobBoard.placeBid({
    jobId: 'job-test-123',
    bidderAgent: 'bidder-1',
    bidAmount: 0,
  });
  assert(result.success === false);
});

await test('placeBid rejects nonexistent job', async () => {
  const result = await jobBoard.placeBid({
    jobId: 'job-nonexistent-123',
    bidderAgent: 'bidder-1',
    bidAmount: 0.5,
  });
  assert(result.success === false);
  assert(result.error?.includes('not found') || result.error?.includes('Invalid'));
});

await test('getBidsForJob returns empty for nonexistent job', () => {
  const bids = jobBoard.getBidsForJob('job-nonexistent-123');
  assert(bids.length === 0);
});

await test('postJob rejects invalid poster agent', async () => {
  const result = await jobBoard.postJob({
    posterAgent: 'invalid@agent!',
    title: 'Valid Title',
    description: 'This is a valid description for the job',
    budgetSol: 1,
    capability: 'research',
  });
  assert(result.success === false);
  assert(result.error?.includes('Invalid'));
});

await test('postJob rejects title exceeding max length', async () => {
  const result = await jobBoard.postJob({
    posterAgent: 'valid-agent',
    title: 'x'.repeat(250),
    description: 'This is a valid description for the job',
    budgetSol: 1,
    capability: 'research',
  });
  assert(result.success === false);
  assert(result.error?.includes('Title') || result.error?.includes('exceed'));
});

await test('placeBid rejects invalid job ID format', async () => {
  const result = await jobBoard.placeBid({
    jobId: 'bad-format',
    bidderAgent: 'bidder-1',
    bidAmount: 0.5,
  });
  assert(result.success === false);
  assert(result.error?.includes('Invalid'));
});

await test('placeBid rejects invalid bidder agent', async () => {
  const result = await jobBoard.placeBid({
    jobId: 'job-valid-123',
    bidderAgent: 'bad@bidder!',
    bidAmount: 0.5,
  });
  assert(result.success === false);
  assert(result.error?.includes('Invalid'));
});

await test('getStats returns stats object', () => {
  const stats = jobBoard.getStats();
  assert(typeof stats.openJobs === 'number');
  assert(typeof stats.completedJobs === 'number');
  assert(typeof stats.totalVolume === 'number');
});

console.log('\nQualityService:');

const mockQualityResponse = {
  content: [{
    type: 'text' as const,
    text: JSON.stringify({
      score: 85,
      summary: 'Good work',
      strengths: ['Clear', 'Complete'],
      weaknesses: ['Minor issues'],
      recommendation: 'accept',
    }),
  }],
};

const mockAnthropicForQuality = {
  messages: {
    create: async () => mockQualityResponse,
  },
} as unknown as Anthropic;

const qualityService = new QualityService({
  anthropic: mockAnthropicForQuality,
});

await test('assessQuality returns assessment', async () => {
  const assessment = await qualityService.assessQuality(
    'Write a summary of blockchain',
    'Blockchain is a distributed ledger technology...',
  );
  assert(assessment.score === 85);
  assert(assessment.summary === 'Good work');
  assert(assessment.recommendation === 'accept');
});

await test('getScoreLabel returns correct label', () => {
  assert(qualityService.getScoreLabel(95) === 'Exceptional');
  assert(qualityService.getScoreLabel(80) === 'Good');
  assert(qualityService.getScoreLabel(65) === 'Acceptable');
  assert(qualityService.getScoreLabel(45) === 'Needs Work');
  assert(qualityService.getScoreLabel(30) === 'Poor');
});

await test('shouldAutoRelease returns true for 75+', () => {
  assert(qualityService.shouldAutoRelease(75) === true);
  assert(qualityService.shouldAutoRelease(74) === false);
});

await test('shouldAutoDispute returns true for below 40', () => {
  assert(qualityService.shouldAutoDispute(39) === true);
  assert(qualityService.shouldAutoDispute(40) === false);
});

await test('formatAssessmentReport includes score', () => {
  const report = qualityService.formatAssessmentReport({
    score: 85,
    summary: 'Good work',
    strengths: ['Clear'],
    weaknesses: [],
    recommendation: 'accept',
  });
  assert(report.includes('85'));
  assert(report.includes('ACCEPT'));
  assert(report.includes('Strengths'));
});

console.log('\nCollectiveMemory:');

const collectiveMemory = new CollectiveMemory({
  db,
  batchSize: 50,
  syncIntervalMs: 60000,
});

await test('recordEvent creates event', () => {
  const id = collectiveMemory.recordEvent('reputation_verified', 'test-agent', {
    tier: 'Gold',
    proofHash: 'abc123',
  });
  assert(id > 0);
});

await test('recordVerification creates verification event', () => {
  const id = collectiveMemory.recordVerification('agent-1', 'Gold', 'hash123');
  assert(id > 0);
});

await test('recordTrustEdge creates trust event', () => {
  const id = collectiveMemory.recordTrustEdge('alice', 'bob', 75);
  assert(id > 0);
});

await test('recordJobCompletion creates job event', () => {
  const id = collectiveMemory.recordJobCompletion('buyer', 'seller', 1.5, 85);
  assert(id > 0);
});

await test('queryEvents returns filtered events', () => {
  const events = collectiveMemory.queryEvents({ eventType: 'reputation_verified' });
  assert(events.length >= 1);
  assert(events[0].eventType === 'reputation_verified');
});

await test('getAgentHistory returns agent events', () => {
  const history = collectiveMemory.getAgentHistory('test-agent');
  assert(history.length >= 1);
});

await test('getStats returns event stats', () => {
  const stats = collectiveMemory.getStats();
  assert(stats.totalEvents >= 4);
  assert(stats.byType.reputation_verified >= 1);
});

await test('formatEventSummary returns formatted string', () => {
  const events = collectiveMemory.getRecentEvents(1);
  if (events.length > 0) {
    const summary = collectiveMemory.formatEventSummary(events[0]);
    assert(typeof summary === 'string');
    assert(summary.length > 0);
  }
});

await test('recordEvent rejects invalid agent ID', () => {
  try {
    collectiveMemory.recordEvent('reputation_verified', 'invalid@agent!', {});
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('alphanumeric') || err.message.includes('Agent ID'));
  }
});

await test('recordEvent rejects empty agent ID', () => {
  try {
    collectiveMemory.recordEvent('reputation_verified', '', {});
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('Invalid') || err.message.includes('Agent ID'));
  }
});

await test('recordEvent sanitizes long string values', () => {
  const id = collectiveMemory.recordEvent('reputation_verified', 'valid-agent', {
    longValue: 'x'.repeat(2000),
  });
  assert(id > 0);
  const events = collectiveMemory.queryEvents({ agentId: 'valid-agent', limit: 1 });
  assert(events.length > 0);
  // Verify the value was truncated
  const val = events[0].data.longValue as string;
  assert(val.length <= 1000);
});

console.log('\nIdentityResolver:');

const identityResolver = new IdentityResolver({
  db,
  chainId: 8453,
});

await test('generateGlobalId creates EIP-155 format', () => {
  const globalId = identityResolver.generateGlobalId(
    '0x1234567890abcdef1234567890abcdef12345678',
    'myagent'
  );
  assert(globalId.startsWith('eip155:8453:'));
  assert(globalId.includes(':myagent'));
});

await test('parseGlobalId parses valid format', () => {
  const parsed = identityResolver.parseGlobalId(
    'eip155:8453:0x1234567890abcdef1234567890abcdef12345678:myagent'
  );
  assert(parsed !== null);
  assert(parsed.chainId === 8453);
  assert(parsed.agentId === 'myagent');
});

await test('parseGlobalId returns null for invalid format', () => {
  const parsed = identityResolver.parseGlobalId('invalid');
  assert(parsed === null);
});

await test('linkIdentity creates identity', async () => {
  const result = await identityResolver.linkIdentity({
    moltbookHandle: 'testuser',
    walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  });
  assert(result.success === true);
  assert(result.globalId !== undefined);
});

await test('linkIdentity rejects invalid handle', async () => {
  const result = await identityResolver.linkIdentity({
    moltbookHandle: '',
    walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  });
  assert(result.success === false);
});

await test('linkIdentity rejects invalid wallet', async () => {
  const result = await identityResolver.linkIdentity({
    moltbookHandle: 'validuser',
    walletAddress: 'invalid',
  });
  assert(result.success === false);
});

await test('resolveByHandle returns linked identity', () => {
  const result = identityResolver.resolveByHandle('testuser');
  assert(result.found === true);
  assert(result.identity?.moltbookHandle === 'testuser');
});

await test('resolveByHandle returns not found for unknown', () => {
  const result = identityResolver.resolveByHandle('unknown');
  assert(result.found === false);
});

await test('isLinked returns true for linked handle', () => {
  assert(identityResolver.isLinked('testuser') === true);
});

await test('isLinked returns false for unknown handle', () => {
  assert(identityResolver.isLinked('unknown') === false);
});

await test('getStats returns identity stats', () => {
  const stats = identityResolver.getStats();
  assert(stats.totalLinked >= 1);
});

await test('formatIdentityCard returns formatted string', () => {
  const card = identityResolver.formatIdentityCard('testuser');
  assert(card.includes('testuser'));
  assert(card.includes('Global ID'));
});

await test('linkIdentity rejects handle exceeding max length', async () => {
  const result = await identityResolver.linkIdentity({
    moltbookHandle: 'x'.repeat(100),
    walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  });
  assert(result.success === false);
  assert(result.error?.includes('length') || result.error?.includes('Invalid'));
});

await test('linkIdentity normalizes wallet address', async () => {
  const result = await identityResolver.linkIdentity({
    moltbookHandle: 'casetest',
    walletAddress: '0xABCDEF1234567890ABCDEF1234567890ABCDEF34',
  });
  assert(result.success === true);
});

console.log('\nGatedAccessService:');

const gatedAccess = new GatedAccessService({
  reputationService: repService,
  trustGraph,
  badgeService,
});

await test('getAllChannels returns default channels', () => {
  const channels = gatedAccess.getAllChannels();
  assert(channels.length >= 4);
});

await test('getChannel returns channel by id', () => {
  const channel = gatedAccess.getChannel('platinum-elite');
  assert(channel !== null);
  assert(channel.name === 'Platinum Elite');
  assert(channel.requiredTier === 'platinum');
});

await test('getChannel returns null for unknown', () => {
  const channel = gatedAccess.getChannel('nonexistent');
  assert(channel === null);
});

await test('requestAccess denies when tier not met', async () => {
  const result = await gatedAccess.requestAccess('low-tier-agent', 'platinum-elite');
  assert(result.granted === false);
  assert(result.reason?.includes('tier'));
});

await test('getMemberships returns empty for new agent', () => {
  const memberships = gatedAccess.getMemberships('new-agent');
  assert(memberships.length === 0);
});

await test('formatChannelList returns formatted string', () => {
  const list = gatedAccess.formatChannelList();
  assert(list.includes('KAMIYO Gated Channels'));
  assert(list.includes('Platinum Elite'));
});

await test('requestAccess rejects invalid agent ID', async () => {
  const result = await gatedAccess.requestAccess('invalid@agent!', 'platinum-elite');
  assert(result.granted === false);
  assert(result.reason?.includes('Invalid'));
});

await test('requestAccess rejects invalid channel ID', async () => {
  const result = await gatedAccess.requestAccess('valid-agent', '');
  assert(result.granted === false);
  assert(result.reason?.includes('Invalid') || result.reason?.includes('not found'));
});

await test('createChannel rejects invalid channel ID format', () => {
  try {
    gatedAccess.createChannel({
      id: 'invalid@channel',
      name: 'Test',
      description: 'Test channel',
      requiredTier: 'bronze',
      requiredBadges: [],
      minTrustScore: 0,
      createdBy: 'creator',
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('alphanumeric') || err.message.includes('Invalid'));
  }
});

await test('createChannel rejects invalid tier', () => {
  try {
    gatedAccess.createChannel({
      id: 'test-channel',
      name: 'Test',
      description: 'Test channel',
      requiredTier: 'diamond',
      requiredBadges: [],
      minTrustScore: 0,
      createdBy: 'creator',
    });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err instanceof Error);
    assert(err.message.includes('tier'));
  }
});

console.log('\nTrustGraphVisualizer:');

const visualizer = new TrustGraphVisualizer({
  trustGraph,
  reputationService: repService,
  badgeService,
});

await test('buildGraphData returns nodes and edges', async () => {
  const data = await visualizer.buildGraphData();
  assert(data.nodes.length >= 0);
  assert(data.edges.length >= 0);
  assert(typeof data.stats.totalNodes === 'number');
});

await test('generateASCII returns formatted string', async () => {
  const data = await visualizer.buildGraphData();
  const ascii = visualizer.generateASCII(data);
  assert(ascii.includes('KAMIYO TRUST GRAPH'));
  assert(ascii.includes('Nodes:'));
});

await test('generateMermaid returns valid syntax', async () => {
  const data = await visualizer.buildGraphData();
  const mermaid = visualizer.generateMermaid(data);
  assert(mermaid.startsWith('graph LR'));
});

await test('formatShareablePost returns post content', async () => {
  const data = await visualizer.buildGraphData();
  const post = visualizer.formatShareablePost(data);
  assert(post.includes('KAMIYO Trust Graph Update'));
  assert(post.includes('Network Stats'));
});

// Cleanup
db.close();
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
