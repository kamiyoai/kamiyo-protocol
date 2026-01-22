/**
 * ShadowWire Client Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { ShadowWireWrapper } from '../src/client/shadow-wire';

// Mock @radr/shadowwire
vi.mock('@radr/shadowwire', () => ({
  ShadowWireClient: vi.fn().mockImplementation(() => ({
    getBalance: vi.fn().mockResolvedValue({
      available: 1.5,
      poolAddress: 'pool123',
    }),
    deposit: vi.fn().mockResolvedValue({ transaction: {} }),
    withdraw: vi.fn().mockResolvedValue({ transaction: {} }),
    transfer: vi.fn().mockResolvedValue({
      success: true,
      signature: 'sig123',
    }),
  })),
}));

describe('ShadowWireWrapper', () => {
  let connection: Connection;
  let wrapper: ShadowWireWrapper;

  beforeEach(() => {
    connection = new Connection('https://api.devnet.solana.com');
    wrapper = new ShadowWireWrapper(connection, { debug: false });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(wrapper.initialize()).resolves.not.toThrow();
    });

    it('should throw if not initialized when calling methods', async () => {
      await expect(wrapper.getBalance('wallet', 'SOL')).rejects.toThrow('not initialized');
    });
  });

  describe('getBalance', () => {
    it('should return shielded balance', async () => {
      await wrapper.initialize();
      const balance = await wrapper.getBalance('wallet123', 'SOL');

      expect(balance).toEqual({
        token: 'SOL',
        available: 1.5,
        poolAddress: 'pool123',
      });
    });
  });

  describe('transfer', () => {
    it('should execute private transfer', async () => {
      await wrapper.initialize();

      const result = await wrapper.transfer({
        sender: Keypair.generate().publicKey.toBase58(),
        recipient: Keypair.generate().publicKey.toBase58(),
        amount: 1.0,
        token: 'SOL',
        type: 'internal',
      });

      expect(result.success).toBe(true);
      expect(result.signature).toBe('sig123');
      expect(result.relayerFee).toBe(0.01); // 1% of 1.0
    });

    it('should reject zero amount', async () => {
      await wrapper.initialize();

      const result = await wrapper.transfer({
        sender: Keypair.generate().publicKey.toBase58(),
        recipient: Keypair.generate().publicKey.toBase58(),
        amount: 0,
        token: 'SOL',
        type: 'internal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('should reject self-transfer', async () => {
      await wrapper.initialize();
      const address = Keypair.generate().publicKey.toBase58();

      const result = await wrapper.transfer({
        sender: address,
        recipient: address,
        amount: 1.0,
        token: 'SOL',
        type: 'internal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('self');
    });

    it('should reject invalid addresses', async () => {
      await wrapper.initialize();

      const result = await wrapper.transfer({
        sender: 'invalid',
        recipient: Keypair.generate().publicKey.toBase58(),
        amount: 1.0,
        token: 'SOL',
        type: 'internal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('deposit', () => {
    it('should create deposit transaction', async () => {
      await wrapper.initialize();

      const result = await wrapper.deposit({
        wallet: Keypair.generate().publicKey.toBase58(),
        amount: 5.0,
        token: 'SOL',
      });

      expect(result.transaction).toBeDefined();
    });

    it('should reject zero amount', async () => {
      await wrapper.initialize();

      await expect(
        wrapper.deposit({
          wallet: Keypair.generate().publicKey.toBase58(),
          amount: 0,
          token: 'SOL',
        })
      ).rejects.toThrow('positive');
    });
  });

  describe('utility methods', () => {
    it('should return supported tokens', async () => {
      await wrapper.initialize();
      const tokens = wrapper.getSupportedTokens();

      expect(tokens).toContain('SOL');
      expect(tokens).toContain('USDC');
      expect(tokens).toContain('RADR');
      expect(tokens.length).toBe(17);
    });

    it('should validate token support', async () => {
      await wrapper.initialize();

      expect(wrapper.isTokenSupported('SOL')).toBe(true);
      expect(wrapper.isTokenSupported('FAKE')).toBe(false);
    });

    it('should calculate relayer fee correctly', async () => {
      await wrapper.initialize();

      expect(wrapper.calculateRelayerFee(100)).toBe(1);
      expect(wrapper.calculateRelayerFee(1)).toBe(0.01);
    });
  });
});
