/**
 * Client Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { RadrClientManager } from '../src/client/manager';

// Mock @radr/shadowwire
vi.mock('@radr/shadowwire', () => ({
  ShadowWireClient: vi.fn().mockImplementation(() => ({
    getBalance: vi.fn().mockResolvedValue({ available: 10, poolAddress: 'pool123' }),
    deposit: vi.fn().mockResolvedValue({ transaction: {} }),
    withdraw: vi.fn().mockResolvedValue({ transaction: {} }),
    transfer: vi.fn().mockResolvedValue({ success: true, signature: 'sig123' }),
  })),
}));

describe('RadrClientManager', () => {
  let connection: Connection;

  beforeEach(() => {
    RadrClientManager.resetInstance();
    connection = new Connection('https://api.devnet.solana.com');
  });

  afterEach(() => {
    RadrClientManager.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const m1 = RadrClientManager.getInstance();
      const m2 = RadrClientManager.getInstance();
      expect(m1).toBe(m2);
    });

    it('should reset instance', () => {
      const m1 = RadrClientManager.getInstance();
      RadrClientManager.resetInstance();
      const m2 = RadrClientManager.getInstance();
      expect(m1).not.toBe(m2);
    });
  });

  describe('getShadowWire', () => {
    it('should create and cache ShadowWire client', async () => {
      const manager = RadrClientManager.getInstance();

      const client1 = await manager.getShadowWire(connection);
      const client2 = await manager.getShadowWire(connection);

      expect(client1).toBe(client2);
      expect(manager.size).toBe(1);
    });

    it('should create separate clients for different connections', async () => {
      const manager = RadrClientManager.getInstance();
      const connection2 = new Connection('https://api.mainnet-beta.solana.com');

      const client1 = await manager.getShadowWire(connection);
      const client2 = await manager.getShadowWire(connection2);

      expect(client1).not.toBe(client2);
      expect(manager.size).toBe(2);
    });
  });

  describe('getReputationGate', () => {
    it('should create and cache reputation gate', () => {
      const manager = RadrClientManager.getInstance();
      const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

      const gate1 = manager.getReputationGate(connection, programId);
      const gate2 = manager.getReputationGate(connection, programId);

      expect(gate1).toBe(gate2);
    });
  });

  describe('cleanup', () => {
    it('should remove all cached clients', async () => {
      const manager = RadrClientManager.getInstance();

      await manager.getShadowWire(connection);
      expect(manager.size).toBe(1);

      manager.cleanup();
      expect(manager.size).toBe(0);
    });

    it('should cleanup stale clients', async () => {
      const manager = RadrClientManager.getInstance({ maxAge: 100 });

      await manager.getShadowWire(connection);
      expect(manager.size).toBe(1);

      // Wait for clients to become stale
      await new Promise((resolve) => setTimeout(resolve, 150));

      const cleaned = manager.cleanupStale();
      expect(cleaned).toBe(1);
      expect(manager.size).toBe(0);
    });
  });
});
