// Integration tests for KAMIYO Agent Paranet
// These tests require a running DKG node and should be run in a test environment

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Skip integration tests unless DKG_ENDPOINT is set
const DKG_ENDPOINT = process.env.DKG_ENDPOINT;
const SKIP_INTEGRATION = !DKG_ENDPOINT;

// Test configuration for DKG testnet
const TEST_CONFIG = {
  dkgEndpoint: DKG_ENDPOINT || 'http://localhost:8900',
  dkgPort: 8900,
  blockchain: 'otp:2043' as const, // OriginTrail Parachain testnet
  epochs: 2,
  // No private key means read-only mode
};

// Test agent global IDs (use testnet addresses)
const TEST_PROVIDER_ID = 'eip155:2043:0x0000000000000000000000000000000000000001:1';
const TEST_CLIENT_ID = 'eip155:2043:0x0000000000000000000000000000000000000002:1';

describe.skipIf(SKIP_INTEGRATION)('Integration Tests', () => {
  describe('DKG Connectivity', () => {
    it('should connect to DKG node', async () => {
      const { createDKGClient } = await import('../publishing/index.js');
      const dkg = await createDKGClient(TEST_CONFIG);

      expect(dkg).toBeDefined();
      expect(dkg.graph).toBeDefined();
      expect(dkg.asset).toBeDefined();
    });

    it('should execute a simple SPARQL query', async () => {
      const { createDKGClient } = await import('../publishing/index.js');
      const dkg = await createDKGClient(TEST_CONFIG);

      const query = `
        PREFIX schema: <https://schema.org/>
        SELECT ?s WHERE { ?s a ?type } LIMIT 1
      `;

      const result = await dkg.graph.query(query, 'SELECT');
      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
    });
  });

  describe('Health Checks', () => {
    it('should report healthy status', async () => {
      const { createDKGClient } = await import('../publishing/index.js');
      const { checkHealth } = await import('../health.js');

      const dkg = await createDKGClient(TEST_CONFIG);
      const health = await checkHealth(dkg, TEST_CONFIG);

      expect(health.status).toBe('healthy');
      expect(health.checks.length).toBeGreaterThan(0);
    });

    it('should pass liveness check', async () => {
      const { createDKGClient } = await import('../publishing/index.js');
      const { checkLiveness } = await import('../health.js');

      const dkg = await createDKGClient(TEST_CONFIG);
      const isLive = await checkLiveness(dkg);

      expect(isLive).toBe(true);
    });

    it('should pass readiness check', async () => {
      const { createDKGClient } = await import('../publishing/index.js');
      const { checkReadiness } = await import('../health.js');

      const dkg = await createDKGClient(TEST_CONFIG);
      const isReady = await checkReadiness(dkg, TEST_CONFIG);

      expect(isReady).toBe(true);
    });
  });

  describe('Provider Discovery', () => {
    it('should search for providers without errors', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(TEST_CONFIG);
      const result = await client.findProviders({
        minQuality: 0,
        minTasks: 0,
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
    });

    it('should search by task type', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(TEST_CONFIG);
      const result = await client.findProviders({
        taskType: 'code_review',
        minQuality: 0,
        minTasks: 0,
        limit: 5,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Credit Score Calculation', () => {
    it('should calculate score without errors', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(TEST_CONFIG);
      const result = await client.calculateCreditScore(TEST_PROVIDER_ID);

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.globalId).toBe(TEST_PROVIDER_ID);
        expect(result.data.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.data.overallScore).toBeLessThanOrEqual(100);
      }
    });

    it('should check requirements', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(TEST_CONFIG);
      const result = await client.meetsRequirements(TEST_PROVIDER_ID, {
        minScore: 0,
        minTier: 0,
      });

      expect(result).toBeDefined();
      expect(typeof result.meets).toBe('boolean');
    });
  });

  describe('Trust Queries', () => {
    it('should check trust relationship', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(TEST_CONFIG);
      const result = await client.checkTrust(TEST_CLIENT_ID, TEST_PROVIDER_ID);

      expect(result).toBeDefined();
      expect(typeof result.trusted).toBe('boolean');
    });

    it('should get agent capabilities', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(TEST_CONFIG);
      const capabilities = await client.getAgentCapabilities(TEST_PROVIDER_ID);

      expect(capabilities).toBeInstanceOf(Array);
    });
  });
});

// Separate describe block for write operations (requires private key)
const HAS_PRIVATE_KEY = !!process.env.DKG_PRIVATE_KEY;

describe.skipIf(SKIP_INTEGRATION || !HAS_PRIVATE_KEY)('Write Integration Tests', () => {
  const WRITE_CONFIG = {
    ...TEST_CONFIG,
    privateKey: process.env.DKG_PRIVATE_KEY,
  };

  describe('Publishing', () => {
    it('should publish task completion', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(WRITE_CONFIG);
      const result = await client.publishTaskCompletion({
        providerGlobalId: TEST_PROVIDER_ID,
        clientGlobalId: TEST_CLIENT_ID,
        taskType: 'code_review',
        taskDescription: 'Integration test task',
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date().toISOString(),
        qualityScore: 85,
        responseTimeMs: 3600000,
        payment: {
          amount: 10,
          currency: 'USDC',
        },
        disputeOutcome: 'none',
      });

      expect(result.success).toBe(true);
      expect(result.ual).toBeDefined();
    });

    it('should publish capability attestation', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(WRITE_CONFIG);
      const result = await client.publishCapabilityAttestation({
        agentGlobalId: TEST_PROVIDER_ID,
        capability: 'code_review',
        attestorGlobalId: TEST_CLIENT_ID,
        attestationType: 'peer',
        confidence: 80,
        context: 'Integration test attestation',
      });

      expect(result.success).toBe(true);
      expect(result.ual).toBeDefined();
    });

    it('should publish trust relationship', async () => {
      const { AgentParanetClient } = await import('../index.js');

      const client = await AgentParanetClient.create(WRITE_CONFIG);
      const result = await client.publishTrustRelationship({
        trustorGlobalId: TEST_CLIENT_ID,
        trusteeGlobalId: TEST_PROVIDER_ID,
        trustLevel: 75,
        trustType: 'general',
        since: new Date().toISOString(),
        reason: 'Integration test trust',
      });

      expect(result.success).toBe(true);
      expect(result.ual).toBeDefined();
    });
  });
});

// Instructions for running integration tests
describe('Integration Test Setup', () => {
  it('shows integration test instructions', () => {
    if (SKIP_INTEGRATION) {
      console.log(`
Integration tests are skipped because DKG_ENDPOINT is not set.

To run integration tests:
1. Set up a DKG node or use the OriginTrail testnet
2. Export the endpoint: export DKG_ENDPOINT=http://your-dkg-node:8900
3. For write tests, also set: export DKG_PRIVATE_KEY=your-private-key
4. Run: npm test

Example for local DKG node:
  export DKG_ENDPOINT=http://localhost:8900
  npm test

Example for testnet:
  export DKG_ENDPOINT=https://testnet.origintrail.io
  npm test
      `);
    }
    expect(true).toBe(true);
  });
});
