/**
 * Integration Tests for Hyperliquid SDK
 *
 * Tests against testnet contracts. Requires:
 * - PRIVATE_KEY env var with funded testnet wallet
 * - Deployed contracts (run Deploy.s.sol first)
 *
 * Run: PRIVATE_KEY=0x... npx vitest test/integration.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers, Wallet } from 'ethers';
import {
  HyperliquidClient,
  HyperliquidExchange,
  ReputationProver,
  NETWORKS,
} from '../src';

// Skip if no private key
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RUN_INTEGRATION = !!PRIVATE_KEY;

describe.skipIf(!RUN_INTEGRATION)('Integration Tests', () => {
  let client: HyperliquidClient;
  let exchange: HyperliquidExchange;
  let wallet: Wallet;
  let provider: ethers.JsonRpcProvider;

  beforeAll(async () => {
    if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY required');

    provider = new ethers.JsonRpcProvider(NETWORKS.testnet.rpc);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    client = new HyperliquidClient({
      network: 'testnet',
      signer: wallet,
    });

    exchange = new HyperliquidExchange({
      wallet: wallet as any,
      network: 'testnet',
    });

    await exchange.init();
  });

  describe('Network Connection', () => {
    it('should connect to testnet RPC', async () => {
      const network = await provider.getNetwork();
      expect(network.chainId).toBe(998n);
    });

    it('should have correct network config', () => {
      const config = client.getNetworkConfig();
      expect(config.chainId).toBe(998);
      expect(config.rpc).toContain('hyperliquid-testnet');
    });
  });

  describe('Exchange API', () => {
    it('should fetch market meta', async () => {
      const meta = await exchange.getMeta();
      expect(meta.universe).toBeDefined();
      expect(meta.universe.length).toBeGreaterThan(0);
    });

    it('should fetch mid prices', async () => {
      const mids = await exchange.getAllMids();
      expect(mids).toBeDefined();
      expect(mids['BTC']).toBeDefined();
    });

    it('should fetch account state', async () => {
      const state = await exchange.getAccountState();
      expect(state.marginSummary).toBeDefined();
      expect(state.marginSummary.accountValue).toBeDefined();
    });
  });

  describe('Agent Registry', () => {
    it('should read min stake', async () => {
      const minStake = await client.getMinStake();
      expect(minStake).toBeGreaterThan(0n);
    });

    it('should read total agents', async () => {
      const total = await client.totalAgents();
      expect(total).toBeGreaterThanOrEqual(0);
    });

    it('should check if address is registered', async () => {
      const address = await wallet.getAddress();
      const isRegistered = await client.isRegistered(address);
      expect(typeof isRegistered).toBe('boolean');
    });
  });

  describe('Vault', () => {
    it('should read vault stats', async () => {
      const stats = await client.getVaultStats();
      expect(stats.positionCount).toBeGreaterThanOrEqual(0);
      expect(stats.disputeCount).toBeGreaterThanOrEqual(0);
    });

    it('should read dispute fee', async () => {
      const fee = await client.getDisputeFee();
      expect(fee).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('Reputation Limits', () => {
    it('should check if reputation limits is configured', () => {
      const hasLimits = client.hasReputationLimits();
      expect(typeof hasLimits).toBe('boolean');
    });

    it.skipIf(!client?.hasReputationLimits())('should read tier count', async () => {
      const count = await client.getTierCount();
      expect(count).toBe(5);
    });

    it.skipIf(!client?.hasReputationLimits())('should read tier info', async () => {
      const tier = await client.getTier(0);
      expect(tier.name).toBe('Default');
      expect(tier.threshold).toBe(0);
    });
  });
});

describe('ZK Prover', () => {
  it('should calculate qualifying tier', async () => {
    const { getQualifyingTier } = await import('../src/prover');

    expect(getQualifyingTier(0)).toBe(0);
    expect(getQualifyingTier(25)).toBe(1);
    expect(getQualifyingTier(50)).toBe(2);
    expect(getQualifyingTier(75)).toBe(3);
    expect(getQualifyingTier(90)).toBe(4);
  });

  it('should get tier threshold', async () => {
    const { getTierThreshold } = await import('../src/prover');

    expect(getTierThreshold(0)).toBe(0);
    expect(getTierThreshold(1)).toBe(25);
    expect(getTierThreshold(2)).toBe(50);
    expect(getTierThreshold(3)).toBe(75);
    expect(getTierThreshold(4)).toBe(90);
  });
});

describe('Type Exports', () => {
  it('should export all required types', async () => {
    const exports = await import('../src');

    // Client
    expect(exports.HyperliquidClient).toBeDefined();

    // Exchange
    expect(exports.HyperliquidExchange).toBeDefined();

    // Prover
    expect(exports.ReputationProver).toBeDefined();
    expect(exports.getTierThreshold).toBeDefined();
    expect(exports.getQualifyingTier).toBeDefined();

    // Oracle
    expect(exports.DisputeOracle).toBeDefined();
    expect(exports.createOracle).toBeDefined();

    // Types
    expect(exports.NETWORKS).toBeDefined();
    expect(exports.TIER_NAMES).toBeDefined();
    expect(exports.CONSTANTS).toBeDefined();
    expect(exports.KamiyoError).toBeDefined();
    expect(exports.KamiyoErrorCode).toBeDefined();
  });
});
