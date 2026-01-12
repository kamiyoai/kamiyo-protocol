/**
 * Tests for Daydreams Contexts
 */

import {
  kamiyoPaymentContext,
  kamiyoServiceContext,
  kamiyoDisputeContext,
  kamiyoReputationContext,
  composeKamiyoContexts,
} from './context';

describe('kamiyoPaymentContext', () => {
  test('has correct type', () => {
    expect(kamiyoPaymentContext.type).toBe('kamiyo-payment');
  });

  test('generates key from agentId', () => {
    expect(kamiyoPaymentContext.key!({ agentId: 'test-agent', network: 'devnet' })).toBe('test-agent');
  });

  test('creates initial memory with zero values', () => {
    const memory = kamiyoPaymentContext.create({ agentId: 'test', network: 'devnet' });

    expect(memory.payments).toEqual([]);
    expect(memory.disputes).toEqual([]);
    expect(memory.balance).toBe(0);
    expect(memory.totalSpent).toBe(0);
    expect(memory.totalRefunded).toBe(0);
    expect(memory.qualityStats.totalCalls).toBe(0);
    expect(memory.qualityStats.avgQuality).toBe(0);
  });

  test('validates input requires agentId', () => {
    expect(() => kamiyoPaymentContext.schema!.parse({})).toThrow('agentId is required');
  });

  test('validates input accepts valid data', () => {
    const result = kamiyoPaymentContext.schema!.parse({ agentId: 'test', network: 'devnet' });
    expect(result.agentId).toBe('test');
    expect(result.network).toBe('devnet');
  });

  test('defaults network to devnet', () => {
    const result = kamiyoPaymentContext.schema!.parse({ agentId: 'test' });
    expect(result.network).toBe('devnet');
  });

  test('render produces formatted string', () => {
    const memory = kamiyoPaymentContext.create({ agentId: 'test', network: 'devnet' });
    const rendered = kamiyoPaymentContext.render!({ memory, input: { agentId: 'test', network: 'devnet' } });

    expect(rendered).toContain('[kamiyo:test]');
    expect(rendered).toContain('network=devnet');
    expect(rendered).toContain('balance=');
  });
});

describe('kamiyoServiceContext', () => {
  test('has correct type', () => {
    expect(kamiyoServiceContext.type).toBe('kamiyo-service');
  });

  test('generates key from endpoint', () => {
    const endpoint = 'https://api.example.com/v1';
    expect(kamiyoServiceContext.key!({ endpoint })).toBe(endpoint);
  });

  test('creates initial memory', () => {
    const memory = kamiyoServiceContext.create({ endpoint: 'https://api.example.com' });

    expect(memory.endpoint).toBe('https://api.example.com');
    expect(memory.totalEarned).toBe(0);
    expect(memory.totalDisputes).toBe(0);
    expect(memory.avgQuality).toBe(0);
    expect(memory.activeEscrows).toEqual([]);
  });

  test('validates endpoint is required', () => {
    expect(() => kamiyoServiceContext.schema!.parse({})).toThrow('endpoint is required');
  });

  test('render produces formatted string', () => {
    const input = { endpoint: 'https://api.example.com' };
    const memory = kamiyoServiceContext.create(input);
    const rendered = kamiyoServiceContext.render!({ memory, input });

    expect(rendered).toContain('[service:https://api.example.com]');
    expect(rendered).toContain('earned=');
    expect(rendered).toContain('disputes=');
  });
});

describe('kamiyoDisputeContext', () => {
  test('has correct type', () => {
    expect(kamiyoDisputeContext.type).toBe('kamiyo-dispute');
  });

  test('generates key from agentId', () => {
    expect(kamiyoDisputeContext.key!({ agentId: 'test' })).toBe('dispute_test');
  });

  test('creates initial memory', () => {
    const memory = kamiyoDisputeContext.create({ agentId: 'test' });

    expect(memory.activeDisputes).toEqual([]);
    expect(memory.resolvedDisputes).toEqual([]);
    expect(memory.totalRefundsIssued).toBe(0);
    expect(memory.avgResolutionTime).toBe(0);
  });

  test('render produces formatted string', () => {
    const input = { agentId: 'test' };
    const memory = kamiyoDisputeContext.create(input);
    const rendered = kamiyoDisputeContext.render!({ memory, input });

    expect(rendered).toContain('[disputes]');
    expect(rendered).toContain('active=0');
    expect(rendered).toContain('resolved=0');
  });
});

describe('kamiyoReputationContext', () => {
  test('has correct type', () => {
    expect(kamiyoReputationContext.type).toBe('kamiyo-reputation');
  });

  test('generates key from agentId', () => {
    expect(kamiyoReputationContext.key!({ agentId: 'test' })).toBe('rep_test');
  });

  test('creates initial memory', () => {
    const memory = kamiyoReputationContext.create({ agentId: 'test' });

    expect(memory.commitment).toBeNull();
    expect(memory.score).toBeNull();
    expect(memory.tier).toBe(0);
    expect(memory.proofHistory).toEqual([]);
    expect(memory.verifiedPeers).toEqual({});
    expect(memory.initialized).toBe(false);
  });

  test('creates memory with initial score', () => {
    const memory = kamiyoReputationContext.create({ agentId: 'test', score: 85 });

    expect(memory.score).toBe(85);
  });

  test('render produces formatted string', () => {
    const memory = kamiyoReputationContext.create({ agentId: 'test' });
    const rendered = kamiyoReputationContext.render!({
      memory,
      input: { agentId: 'test' },
    });

    expect(rendered).toContain('[reputation:test]');
    expect(rendered).toContain('status=uninitialized');
    expect(rendered).toContain('tier=Default');
  });

  test('render shows initialized status', () => {
    const memory = kamiyoReputationContext.create({ agentId: 'test' });
    memory.initialized = true;
    memory.tier = 3;

    const rendered = kamiyoReputationContext.render!({
      memory,
      input: { agentId: 'test' },
    });

    expect(rendered).toContain('status=ready');
    expect(rendered).toContain('tier=Gold');
  });
});

describe('composeKamiyoContexts', () => {
  test('returns array of context configs', () => {
    const contexts = composeKamiyoContexts('agent-1');

    expect(contexts.length).toBe(3);
  });

  test('includes payment context', () => {
    const contexts = composeKamiyoContexts('agent-1', 'mainnet');

    const paymentCtx = contexts.find((c) => c.context.type === 'kamiyo-payment');
    expect(paymentCtx).toBeDefined();
    expect(paymentCtx!.input.agentId).toBe('agent-1');
    expect(paymentCtx!.input.network).toBe('mainnet');
  });

  test('includes dispute context', () => {
    const contexts = composeKamiyoContexts('agent-1');

    const disputeCtx = contexts.find((c) => c.context.type === 'kamiyo-dispute');
    expect(disputeCtx).toBeDefined();
    expect(disputeCtx!.input.agentId).toBe('agent-1');
  });

  test('includes reputation context', () => {
    const contexts = composeKamiyoContexts('agent-1');

    const repCtx = contexts.find((c) => c.context.type === 'kamiyo-reputation');
    expect(repCtx).toBeDefined();
    expect(repCtx!.input.agentId).toBe('agent-1');
  });

  test('defaults to devnet', () => {
    const contexts = composeKamiyoContexts('agent-1');

    const paymentCtx = contexts.find((c) => c.context.type === 'kamiyo-payment');
    expect(paymentCtx!.input.network).toBe('devnet');
  });
});
