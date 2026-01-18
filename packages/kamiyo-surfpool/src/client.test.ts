import { PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SurfpoolClient } from './client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('SurfpoolClient', () => {
  let client: SurfpoolClient;
  const testEndpoint = 'http://localhost:8899';

  beforeEach(() => {
    jest.clearAllMocks();
    client = new SurfpoolClient({
      endpoint: testEndpoint,
      commitment: 'confirmed',
      timeout: 5000,
    });
  });

  describe('constructor', () => {
    it('should create client with default options', () => {
      const c = new SurfpoolClient({ endpoint: testEndpoint });
      expect(c.getConnection()).toBeDefined();
    });

    it('should create client with custom timeout', () => {
      const c = new SurfpoolClient({ endpoint: testEndpoint, timeout: 10000 });
      expect(c.getConnection()).toBeDefined();
    });
  });

  describe('setBalance', () => {
    it('should call surfnet_setBalance RPC method', async () => {
      const account = Keypair.generate().publicKey;
      const lamports = 5 * LAMPORTS_PER_SOL;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      const result = await client.setBalance(account, lamports);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        testEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('surfnet_setBalance');
      expect(body.params[0]).toBe(account.toBase58());
      expect(body.params[1]).toBe(lamports);
    });

    it('should handle RPC errors', async () => {
      const account = Keypair.generate().publicKey;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32600, message: 'Invalid request' },
        }),
      });

      await expect(client.setBalance(account, 1000)).rejects.toThrow();
    });
  });

  describe('setBalanceSol', () => {
    it('should convert SOL to lamports', async () => {
      const account = Keypair.generate().publicKey;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      await client.setBalanceSol(account, 5);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params[1]).toBe(5 * LAMPORTS_PER_SOL);
    });

    it('should handle fractional SOL amounts', async () => {
      const account = Keypair.generate().publicKey;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      await client.setBalanceSol(account, 1.5);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params[1]).toBe(Math.floor(1.5 * LAMPORTS_PER_SOL));
    });
  });

  describe('warpToSlot', () => {
    it('should warp to specified slot', async () => {
      const targetSlot = 1000000;

      // Mock getSlot before warp
      jest.spyOn(client.getConnection(), 'getSlot')
        .mockResolvedValueOnce(500000)
        .mockResolvedValueOnce(targetSlot);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      const result = await client.warpToSlot(targetSlot);

      expect(result.previousSlot).toBe(500000);
      expect(result.currentSlot).toBe(targetSlot);
      expect(result.slotsAdvanced).toBe(500000);
    });
  });

  describe('advanceSlots', () => {
    it('should advance by specified number of slots', async () => {
      const currentSlot = 500000;
      const slotsToAdvance = 100;

      jest.spyOn(client.getConnection(), 'getSlot')
        .mockResolvedValueOnce(currentSlot)
        .mockResolvedValueOnce(currentSlot)
        .mockResolvedValueOnce(currentSlot + slotsToAdvance);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      const result = await client.advanceSlots(slotsToAdvance);

      expect(result.slotsAdvanced).toBe(slotsToAdvance);
    });
  });

  describe('advanceTime', () => {
    it('should convert seconds to slots (400ms per slot)', async () => {
      jest.spyOn(client.getConnection(), 'getSlot')
        .mockResolvedValueOnce(500000)
        .mockResolvedValueOnce(500000)
        .mockResolvedValueOnce(502500);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      // 1000 seconds = 2500 slots (1000 / 0.4)
      await client.advanceTime(1000);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('surfnet_warpToSlot');
      // Current slot (500000) + slots to advance (2500) = 502500
      expect(body.params[0]).toBe(502500);
    });
  });

  describe('createFork', () => {
    it('should create fork with mainnet source', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      const result = await client.createFork({
        sourceCluster: 'mainnet-beta',
      });

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('surfnet_createFork');
      expect(body.params[0].cluster).toBe('mainnet-beta');
    });

    it('should include slot and prefetch accounts when provided', async () => {
      const accounts = [Keypair.generate().publicKey, Keypair.generate().publicKey];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      await client.createFork({
        sourceCluster: 'devnet',
        slot: 12345,
        prefetchAccounts: accounts,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params[0].slot).toBe(12345);
      expect(body.params[0].prefetchAccounts).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should call surfnet_reset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      const result = await client.reset();

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('surfnet_reset');
    });
  });

  describe('snapshot and restore', () => {
    it('should create and restore snapshots', async () => {
      const snapshotId = 'snapshot-123';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: snapshotId }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: true }),
        });

      const id = await client.snapshot();
      expect(id).toBe(snapshotId);

      const restored = await client.restore(snapshotId);
      expect(restored).toBe(true);
    });
  });

  describe('cloneAccount', () => {
    it('should clone single account from mainnet', async () => {
      const account = Keypair.generate().publicKey;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      const result = await client.cloneAccount(account);

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('surfnet_cloneAccount');
      expect(body.params[0]).toBe(account.toBase58());
      expect(body.params[1]).toBe('mainnet-beta');
    });

    it('should clone from devnet when specified', async () => {
      const account = Keypair.generate().publicKey;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      await client.cloneAccount(account, 'devnet');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params[1]).toBe('devnet');
    });
  });

  describe('cloneAccounts', () => {
    it('should clone multiple accounts in batch', async () => {
      const accounts = [
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: true }),
      });

      const result = await client.cloneAccounts(accounts);

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('surfnet_cloneAccounts');
      expect(body.params[0]).toHaveLength(3);
    });
  });

  describe('timeout handling', () => {
    it('should abort request on timeout', async () => {
      const shortTimeoutClient = new SurfpoolClient({
        endpoint: testEndpoint,
        timeout: 100,
      });

      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 500))
      );

      await expect(
        shortTimeoutClient.setBalance(Keypair.generate().publicKey, 1000)
      ).rejects.toThrow();
    });
  });

  describe('HTTP error handling', () => {
    it('should throw on non-OK HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        client.setBalance(Keypair.generate().publicKey, 1000)
      ).rejects.toThrow('HTTP 500');
    });
  });
});
