import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createX402Tools } from './x402-tools.js';

describe('x402-tools', () => {
  describe('createX402Tools', () => {
    it('returns 6 tools', () => {
      const tools = createX402Tools();
      assert.strictEqual(tools.length, 6);
    });

    it('has expected tool names', () => {
      const tools = createX402Tools();
      const names = tools.map((t) => t.name);
      assert.deepStrictEqual(names, [
        'x402_check_pricing',
        'x402_fetch',
        'query_agent_profile',
        'query_agent_reputation',
        'get_trading_signals',
        'x402_request_settlement',
      ]);
    });
  });

  describe('x402_check_pricing', () => {
    it('rejects invalid URLs', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'x402_check_pricing')!;

      const result = await tool.handler({ url: 'not-a-url' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Invalid URL');
    });

    it('rejects URLs that are too long', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'x402_check_pricing')!;

      const longUrl = 'https://example.com/' + 'a'.repeat(3000);
      const result = await tool.handler({ url: longUrl });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Invalid URL');
    });
  });

  describe('x402_fetch', () => {
    it('rejects invalid URLs', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'x402_fetch')!;

      const result = await tool.handler({ url: 'invalid', payment_header: 'abc' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Invalid URL');
    });

    it('rejects missing payment header', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'x402_fetch')!;

      const result = await tool.handler({ url: 'https://example.com/api' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Invalid payment header');
    });

    it('rejects oversized payment header', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'x402_fetch')!;

      const bigHeader = 'x'.repeat(10000);
      const result = await tool.handler({ url: 'https://example.com/api', payment_header: bigHeader });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Invalid payment header');
    });
  });

  describe('query_agent_profile', () => {
    it('rejects invalid agent IDs', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'query_agent_profile')!;

      const result = await tool.handler({ agent_id: '../etc/passwd', payment_header: 'abc' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Invalid agent ID');
    });

    it('rejects agent IDs with special characters', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'query_agent_profile')!;

      const result = await tool.handler({ agent_id: 'agent<script>', payment_header: 'abc' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Invalid agent ID');
    });

    it('accepts valid agent IDs', async () => {
      const tools = createX402Tools({ baseUrl: 'http://localhost:9999' });
      const tool = tools.find((t) => t.name === 'query_agent_profile')!;

      // Will fail on fetch but validates ID first
      const result = await tool.handler({ agent_id: 'agent-001_test', payment_header: 'valid-header' });
      // Network error expected, but ID was accepted
      assert.strictEqual(result.success, false);
      assert.ok(result.error !== 'Invalid agent ID');
    });
  });

  describe('x402_request_settlement', () => {
    it('rejects invalid violation types', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'x402_request_settlement')!;

      const result = await tool.handler({ payment_ref: 'ref-123', violation: 'invalid-type' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Invalid violation type');
    });

    it('rejects oversized evidence', async () => {
      const tools = createX402Tools();
      const tool = tools.find((t) => t.name === 'x402_request_settlement')!;

      const bigEvidence = 'x'.repeat(2000);
      const result = await tool.handler({ payment_ref: 'ref-123', violation: 'timeout', evidence: bigEvidence });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Evidence must be under 1000 characters');
    });

    it('accepts valid violation types', async () => {
      const tools = createX402Tools({ baseUrl: 'http://localhost:9999' });
      const tool = tools.find((t) => t.name === 'x402_request_settlement')!;

      const violations = ['timeout', 'serverError', 'latency', 'malformed', 'incomplete'];
      for (const violation of violations) {
        const result = await tool.handler({ payment_ref: 'ref-123', violation });
        // Network error expected, but violation was accepted
        assert.ok(result.error !== 'Invalid violation type', `${violation} should be valid`);
      }
    });
  });
});
