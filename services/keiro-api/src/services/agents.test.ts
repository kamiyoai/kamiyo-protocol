import { describe, it, expect, beforeEach } from 'vitest';
import { agentService } from './agents.js';

describe('agentService', () => {
  const testWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

  beforeEach(() => {
    // Clean up any existing test agents
    const existing = agentService.getByWallet(testWallet);
    if (existing) agentService.delete(existing.id);
  });

  describe('create', () => {
    it('creates an agent with valid data', () => {
      const agent = agentService.create({
        walletAddress: testWallet,
        name: 'Test Agent',
        personality: 'professional',
        skills: ['research', 'writing'],
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Test Agent');
      expect(agent.personality).toBe('professional');
      expect(agent.skills).toEqual(['research', 'writing']);
      expect(agent.tier).toBe('unverified');
      expect(agent.creditScore).toBe(0);
      expect(agent.isActive).toBe(true);
    });

    it('throws when wallet already has an agent', () => {
      agentService.create({
        walletAddress: testWallet,
        name: 'First Agent',
        personality: 'creative',
        skills: ['general'],
      });

      expect(() =>
        agentService.create({
          walletAddress: testWallet,
          name: 'Second Agent',
          personality: 'efficient',
          skills: ['code_review'],
        })
      ).toThrow('already exists');
    });
  });

  describe('getById', () => {
    it('returns agent when found', () => {
      const created = agentService.create({
        walletAddress: testWallet,
        name: 'Test',
        personality: 'balanced',
        skills: ['research'],
      });

      const found = agentService.getById(created.id);
      expect(found?.id).toBe(created.id);
    });

    it('returns undefined for unknown id', () => {
      expect(agentService.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates allowed fields', () => {
      const agent = agentService.create({
        walletAddress: testWallet,
        name: 'Original',
        personality: 'professional',
        skills: ['research'],
      });

      const updated = agentService.update(agent.id, {
        name: 'Updated',
        isActive: false,
      });

      expect(updated?.name).toBe('Updated');
      expect(updated?.isActive).toBe(false);
    });

    it('normalizes skill tags on update', () => {
      const agent = agentService.create({
        walletAddress: testWallet,
        name: 'Skills',
        personality: 'professional',
        skills: ['research'],
      });

      const updated = agentService.update(agent.id, {
        skills: [' Smart Contract Audit ', 'smart-contract-audit', ''],
      });

      expect(updated?.skills).toEqual(['smart_contract_audit']);
    });

    it('preserves id and wallet on update', () => {
      const agent = agentService.create({
        walletAddress: testWallet,
        name: 'Test',
        personality: 'creative',
        skills: ['writing'],
      });

      const updated = agentService.update(agent.id, {
        id: 'hacked_id',
        walletAddress: 'hacked_wallet',
      });

      expect(updated?.id).toBe(agent.id);
      expect(updated?.walletAddress).toBe(testWallet);
    });
  });

  describe('recordTaskCompletion', () => {
    it('increases tasks completed and updates score', () => {
      const agent = agentService.create({
        walletAddress: testWallet,
        name: 'Worker',
        personality: 'efficient',
        skills: ['code_review'],
      });

      const updated = agentService.recordTaskCompletion(agent.id, 80, false);

      expect(updated?.tasksCompleted).toBe(1);
      expect(updated?.avgQuality).toBe(80);
      expect(updated?.creditScore).toBeGreaterThan(0);
    });

    it('tracks disputes correctly', () => {
      const agent = agentService.create({
        walletAddress: testWallet,
        name: 'Worker',
        personality: 'efficient',
        skills: ['code_review'],
      });

      agentService.recordTaskCompletion(agent.id, 70, true);
      const current = agentService.getById(agent.id);

      expect(current?.disputeCount).toBe(1);
    });
  });

  describe('getLeaderboard', () => {
    it('returns active agents sorted by score', () => {
      const leaderboard = agentService.getLeaderboard(5);

      expect(Array.isArray(leaderboard)).toBe(true);
      expect(leaderboard.length).toBeLessThanOrEqual(5);

      for (const agent of leaderboard) {
        expect(agent.isActive).toBe(true);
      }

      for (let i = 1; i < leaderboard.length; i++) {
        expect(leaderboard[i - 1].creditScore).toBeGreaterThanOrEqual(leaderboard[i].creditScore);
      }
    });
  });
});
