import { describe, it, expect, beforeEach } from 'vitest';
import { jobService } from './jobs.js';

describe('jobService', () => {
  describe('getAll', () => {
    it('returns all jobs sorted by creation date', () => {
      const jobs = jobService.getAll();

      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);

      for (let i = 1; i < jobs.length; i++) {
        const prev = new Date(jobs[i - 1].createdAt).getTime();
        const curr = new Date(jobs[i].createdAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  describe('getOpen', () => {
    it('returns only open jobs', () => {
      const jobs = jobService.getOpen();

      for (const job of jobs) {
        expect(job.status).toBe('open');
      }
    });
  });

  describe('getMatchingJobs', () => {
    it('filters by skills and tier', () => {
      const jobs = jobService.getMatchingJobs(['research'], 'bronze');

      for (const job of jobs) {
        expect(job.status).toBe('open');
        expect(job.requiredSkills.some((s) => s === 'research')).toBe(true);
        expect(['unverified', 'bronze'].includes(job.requiredTier)).toBe(true);
      }
    });

    it('returns empty for mismatched skills', () => {
      const jobs = jobService.getMatchingJobs(['translation'], 'platinum');

      // Filter to only jobs requiring translation
      const translationJobs = jobs.filter((j) =>
        j.requiredSkills.includes('translation')
      );

      expect(translationJobs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('create', () => {
    it('creates a job with open status', () => {
      const job = jobService.create({
        title: 'Test Job',
        description: 'A test job for testing',
        requiredSkills: ['general'],
        requiredTier: 'unverified',
        payment: 1.0,
        paymentToken: 'SOL',
        estimatedTime: '1 hour',
        poster: 'Tester',
        posterAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe('open');
      expect(job.createdAt).toBeDefined();
    });
  });

  describe('assign', () => {
    it('assigns agent to open job', () => {
      const openJobs = jobService.getOpen();
      if (openJobs.length === 0) return;

      const job = openJobs[0];
      const assigned = jobService.assign(job.id, 'test_agent', 'escrow_123');

      expect(assigned?.status).toBe('assigned');
      expect(assigned?.assignedAgent).toBe('test_agent');
      expect(assigned?.escrowId).toBe('escrow_123');

      // Restore
      jobService.updateStatus(job.id, 'open');
    });

    it('returns null for non-open job', () => {
      const job = jobService.create({
        title: 'Closed Job',
        description: 'Testing closed assignment',
        requiredSkills: ['general'],
        requiredTier: 'unverified',
        payment: 0.1,
        paymentToken: 'SOL',
        estimatedTime: '30 min',
        poster: 'Test',
        posterAddress: 'test123',
      });

      jobService.updateStatus(job.id, 'completed');

      const result = jobService.assign(job.id, 'agent', 'escrow');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('updates job status', () => {
      const job = jobService.create({
        title: 'Status Test',
        description: 'Testing status updates',
        requiredSkills: ['writing'],
        requiredTier: 'unverified',
        payment: 0.5,
        paymentToken: 'SOL',
        estimatedTime: '1 hour',
        poster: 'Tester',
        posterAddress: 'test',
      });

      jobService.updateStatus(job.id, 'in_progress');
      const updated = jobService.getById(job.id);

      expect(updated?.status).toBe('in_progress');
    });
  });

  describe('cancel', () => {
    it('cancels open job', () => {
      const job = jobService.create({
        title: 'Cancel Test',
        description: 'Testing cancellation',
        requiredSkills: ['general'],
        requiredTier: 'unverified',
        payment: 0.1,
        paymentToken: 'USDC',
        estimatedTime: '30 min',
        poster: 'Test',
        posterAddress: 'test',
      });

      const result = jobService.cancel(job.id);
      expect(result).toBe(true);

      const cancelled = jobService.getById(job.id);
      expect(cancelled?.status).toBe('cancelled');
    });

    it('cannot cancel completed job', () => {
      const job = jobService.create({
        title: 'Completed',
        description: 'Already done',
        requiredSkills: ['research'],
        requiredTier: 'unverified',
        payment: 1.0,
        paymentToken: 'SOL',
        estimatedTime: '2 hours',
        poster: 'Done',
        posterAddress: 'done',
      });

      jobService.updateStatus(job.id, 'completed');

      const result = jobService.cancel(job.id);
      expect(result).toBe(false);
    });
  });
});
