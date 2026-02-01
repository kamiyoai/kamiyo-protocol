import { describe, it, expect } from 'vitest';
import * as queries from './index';

const validGlobalId = 'eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:123';

describe('SPARQL query builders', () => {
  describe('queryTasksByProvider', () => {
    it('generates valid SPARQL', () => {
      const query = queries.queryTasksByProvider(validGlobalId);
      expect(query).toContain('PREFIX schema:');
      expect(query).toContain('SELECT');
      expect(query).toContain(validGlobalId);
    });

    it('respects limit', () => {
      const query = queries.queryTasksByProvider(validGlobalId, { limit: 10 });
      expect(query).toContain('LIMIT 10');
    });

    it('clamps limit to max 100', () => {
      const query = queries.queryTasksByProvider(validGlobalId, { limit: 500 });
      expect(query).toContain('LIMIT 100');
    });

    it('supports offset for pagination', () => {
      const query = queries.queryTasksByProvider(validGlobalId, { limit: 10, offset: 20 });
      expect(query).toContain('LIMIT 10');
      expect(query).toContain('OFFSET 20');
    });
  });

  describe('queryTasksByClient', () => {
    it('generates valid SPARQL', () => {
      const query = queries.queryTasksByClient(validGlobalId);
      expect(query).toContain('schema:participant');
      expect(query).toContain(validGlobalId);
    });
  });

  describe('queryTaskSummaryByProvider', () => {
    it('generates aggregation query', () => {
      const query = queries.queryTaskSummaryByProvider(validGlobalId);
      expect(query).toContain('COUNT');
      expect(query).toContain('AVG');
      expect(query).toContain('MIN');
      expect(query).toContain('MAX');
    });
  });

  describe('queryTasksByType', () => {
    it('filters by task type', () => {
      const query = queries.queryTasksByType(validGlobalId, 'code_review');
      expect(query).toContain('code_review');
      expect(query).toContain('taskType');
    });
  });

  describe('queryCapabilitiesByAgent', () => {
    it('generates capability query', () => {
      const query = queries.queryCapabilitiesByAgent(validGlobalId);
      expect(query).toContain('CapabilityAttestation');
      expect(query).toContain('GROUP BY');
    });
  });

  describe('queryAgentsByCapability', () => {
    it('searches for agents with capability', () => {
      const query = queries.queryAgentsByCapability('solidity', { minConfidence: 80 });
      expect(query).toContain('solidity');
      expect(query).toContain('HAVING');
    });
  });

  describe('queryIncomingTrust', () => {
    it('queries trust relationships', () => {
      const query = queries.queryIncomingTrust(validGlobalId);
      expect(query).toContain('TrustRelationship');
      expect(query).toContain('schema:object');
    });
  });

  describe('queryOutgoingTrust', () => {
    it('queries outgoing trust', () => {
      const query = queries.queryOutgoingTrust(validGlobalId);
      expect(query).toContain('schema:agent');
    });
  });

  describe('queryDirectTrust', () => {
    it('checks specific trust relationship', () => {
      const query = queries.queryDirectTrust(validGlobalId, validGlobalId);
      expect(query).toContain('LIMIT 1');
    });
  });

  describe('queryProvidersByTaskType', () => {
    it('finds providers for task type', () => {
      const query = queries.queryProvidersByTaskType('security_audit', { minQuality: 80, minTasks: 5 });
      expect(query).toContain('security_audit');
      expect(query).toContain('HAVING');
    });
  });

  describe('queryTopProviders', () => {
    it('finds top providers', () => {
      const query = queries.queryTopProviders({ minQuality: 80, minTasks: 10, limit: 20 });
      expect(query).toContain('ORDER BY DESC');
      expect(query).toContain('LIMIT 20');
    });
  });

  describe('queryCreditScoreData', () => {
    it('fetches credit score components', () => {
      const query = queries.queryCreditScoreData(validGlobalId);
      expect(query).toContain('disputeCount');
      expect(query).toContain('disputesWon');
      expect(query).toContain('avgQuality');
    });
  });

  describe('queryTrustScore', () => {
    it('aggregates trust data', () => {
      const query = queries.queryTrustScore(validGlobalId);
      expect(query).toContain('AVG');
      expect(query).toContain('COUNT');
    });
  });
});

describe('SPARQL escaping', () => {
  it('escapes double quotes', () => {
    const idWithQuote = 'eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:1"test';
    const query = queries.queryTasksByProvider(idWithQuote);
    // The escape function converts " to \"
    expect(query).toContain('\\"');
  });

  it('escapes backslashes', () => {
    const idWithBackslash = 'eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:1\\test';
    const query = queries.queryTasksByProvider(idWithBackslash);
    expect(query).toContain('\\\\');
  });

  it('escapes newlines to prevent query manipulation', () => {
    const idWithNewline = 'eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:1\ntest';
    const query = queries.queryTasksByProvider(idWithNewline);
    // Newline should be escaped as \\n (literal string)
    expect(query).toContain('\\n');
  });

  it('truncates long inputs to 256 chars for safety', () => {
    const longId = validGlobalId + 'x'.repeat(1000);
    const query = queries.queryTasksByProvider(longId);
    // The escaped string should be truncated, so the ID portion should not exceed 256 chars
    // This prevents potential buffer overflows or denial of service
    expect(query).not.toContain('x'.repeat(300));
  });
});
