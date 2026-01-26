import { describe, it, expect } from 'vitest';
import { SwarmTeamsProver, generateRandomSalt } from '../src';

/**
 * Tests for swarm vote+bid primitives.
 * Used in SwarmTeams integration for private task allocation.
 */
describe('Swarm Vote+Bid Primitives', () => {
  describe('Bid Commitment', () => {
    it('should hide bid amount in commitment', async () => {
      const bidSalt = generateRandomSalt();
      const actionHash = generateRandomSalt();

      const bid10 = await SwarmTeamsProver.generateBidCommitment(10n, bidSalt, actionHash);
      const bid100 = await SwarmTeamsProver.generateBidCommitment(100n, bidSalt, actionHash);

      // Cannot determine bid amount from commitment alone
      expect(bid10.length).toBe(32);
      expect(bid100.length).toBe(32);
      expect(bid10).not.toEqual(bid100);
    });

    it('should be deterministic', async () => {
      const bidSalt = new Uint8Array(32).fill(42);
      const actionHash = new Uint8Array(32).fill(7);
      const bidAmount = 500n;

      const c1 = await SwarmTeamsProver.generateBidCommitment(bidAmount, bidSalt, actionHash);
      const c2 = await SwarmTeamsProver.generateBidCommitment(bidAmount, bidSalt, actionHash);

      expect(c1).toEqual(c2);
    });

    it('should produce unique commitments with different salts', async () => {
      const actionHash = generateRandomSalt();
      const bidAmount = 1000n;

      const salt1 = generateRandomSalt();
      const salt2 = generateRandomSalt();

      const c1 = await SwarmTeamsProver.generateBidCommitment(bidAmount, salt1, actionHash);
      const c2 = await SwarmTeamsProver.generateBidCommitment(bidAmount, salt2, actionHash);

      expect(c1).not.toEqual(c2);
    });

    it('should reject tampered bid reveals', async () => {
      const actionHash = generateRandomSalt();
      const bidSalt = generateRandomSalt();

      // Original bid: 100
      const commitment = await SwarmTeamsProver.generateBidCommitment(100n, bidSalt, actionHash);

      // Attempted tampering: claim bid was 500
      const tamperedCommitment = await SwarmTeamsProver.generateBidCommitment(500n, bidSalt, actionHash);

      expect(commitment).not.toEqual(tamperedCommitment);
    });
  });

  describe('Vote+Bid Flow Simulation', () => {
    it('should support anonymous vote+bid workflow', async () => {
      // Agent identity
      const agentId = generateRandomSalt();
      const registrationSecret = generateRandomSalt();

      // Task proposal
      const actionData = new TextEncoder().encode('{"task":"research_defi","budget":50}');
      const actionHash = await SwarmTeamsProver.generateActionHash(0, actionData);

      // Agent decides to vote YES and bid 15
      const voteValue = true;
      const voteSalt = generateRandomSalt();
      const bidAmount = 15n;
      const bidSalt = generateRandomSalt();

      // Generate nullifier
      const voteNullifier = await SwarmTeamsProver.generateVoteNullifier(
        agentId,
        registrationSecret,
        actionHash
      );

      // Generate commitments
      const voteCommitment = await SwarmTeamsProver.generateVoteCommitment(voteValue, voteSalt, actionHash);
      const bidCommitment = await SwarmTeamsProver.generateBidCommitment(bidAmount, bidSalt, actionHash);

      // Verify outputs
      expect(voteNullifier.length).toBe(32);
      expect(voteCommitment.length).toBe(32);
      expect(bidCommitment.length).toBe(32);
    });

    it('should allow multiple agents to vote+bid on same action', async () => {
      const actionHash = generateRandomSalt();

      // 5 agents with different bids
      const agents = [
        { vote: true, bid: 10n },
        { vote: true, bid: 20n },
        { vote: false, bid: 5n },
        { vote: true, bid: 15n },
        { vote: true, bid: 25n },
      ];

      const results = await Promise.all(agents.map(async (a) => {
        const voteSalt = generateRandomSalt();
        const bidSalt = generateRandomSalt();
        const voteCommitment = await SwarmTeamsProver.generateVoteCommitment(a.vote, voteSalt, actionHash);
        const bidCommitment = await SwarmTeamsProver.generateBidCommitment(a.bid, bidSalt, actionHash);
        return { voteCommitment, bidCommitment, original: a };
      }));

      // All commitments should be unique
      const voteSet = new Set(results.map(r => Buffer.from(r.voteCommitment).toString('hex')));
      const bidSet = new Set(results.map(r => Buffer.from(r.bidCommitment).toString('hex')));

      expect(voteSet.size).toBe(5);
      expect(bidSet.size).toBe(5);
    });

    it('should identify highest YES bidder after reveal', async () => {
      const actionHash = generateRandomSalt();

      // Simulate revealed votes
      const revealed = [
        { vote: true, bid: 10n },
        { vote: true, bid: 20n },
        { vote: false, bid: 50n }, // NO vote - should not win even with highest bid
        { vote: true, bid: 15n },
        { vote: true, bid: 25n },
      ];

      // Filter YES voters and find highest
      const yesVoters = revealed.filter(r => r.vote);
      const winner = yesVoters.reduce((max, curr) => curr.bid > max.bid ? curr : max);

      expect(winner.bid).toBe(25n);
      expect(winner.vote).toBe(true);
    });
  });

  describe('Commitment Verification', () => {
    it('should verify vote commitment matches reveal', async () => {
      const actionHash = generateRandomSalt();
      const voteSalt = generateRandomSalt();
      const voteValue = true;

      const commitment = await SwarmTeamsProver.generateVoteCommitment(voteValue, voteSalt, actionHash);
      const revealCommitment = await SwarmTeamsProver.generateVoteCommitment(voteValue, voteSalt, actionHash);

      expect(commitment).toEqual(revealCommitment);
    });

    it('should verify bid commitment matches reveal', async () => {
      const actionHash = generateRandomSalt();
      const bidSalt = generateRandomSalt();
      const bidAmount = 42n;

      const commitment = await SwarmTeamsProver.generateBidCommitment(bidAmount, bidSalt, actionHash);
      const revealCommitment = await SwarmTeamsProver.generateBidCommitment(bidAmount, bidSalt, actionHash);

      expect(commitment).toEqual(revealCommitment);
    });

    it('should reject wrong bid salt on reveal', async () => {
      const actionHash = generateRandomSalt();
      const originalSalt = generateRandomSalt();
      const wrongSalt = generateRandomSalt();
      const bidAmount = 100n;

      const commitment = await SwarmTeamsProver.generateBidCommitment(bidAmount, originalSalt, actionHash);
      const wrongSaltCommitment = await SwarmTeamsProver.generateBidCommitment(bidAmount, wrongSalt, actionHash);

      expect(commitment).not.toEqual(wrongSaltCommitment);
    });
  });
});
