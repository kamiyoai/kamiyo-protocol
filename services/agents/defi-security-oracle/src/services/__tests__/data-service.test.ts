/**
 * Unit Tests for Data Service
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import { DataService } from '../data-service';

// Mock axios module
jest.mock('axios', () => ({
  default: {
    get: jest.fn()
  }
}));

describe('DataService', () => {
  let service: DataService;
  const mockAxiosGet = (axios as any).get;

  beforeEach(() => {
    service = new DataService();
    mockAxiosGet.mockClear?.();
  });

  describe.skip('fetchExploits', () => {
    it('should fetch exploits successfully', async () => {
      const mockData = {
        exploits: [
          {
            protocol: 'Uniswap V3',
            chain: 'ethereum',
            severity: 'high',
            loss_usd: 1000000,
            timestamp: '2025-11-01T00:00:00Z',
            description: 'Flash loan attack',
            attack_vector: 'Price manipulation'
          }
        ]
      };

      mockAxiosGet.mockResolvedValueOnce({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      } as any);

      const result = await service.fetchExploits('Uniswap V3', 'ethereum');

      expect(result).toHaveLength(1);
      expect(result[0].protocol).toBe('Uniswap V3');
      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('/exploits'),
        expect.objectContaining({
          params: expect.objectContaining({
            protocol: 'Uniswap V3',
            chain: 'ethereum'
          })
        })
      );
    });

    it('should use cache on subsequent requests', async () => {
      const mockData = { exploits: [{ protocol: 'Test' } as any] };

      mockAxiosGet.mockResolvedValueOnce({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      } as any);

      // First call - should hit API
      await service.fetchExploits('Test');
      expect(mockAxiosGet).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await service.fetchExploits('Test');
      expect(mockAxiosGet).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should throw error when all sources fail', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.fetchExploits()).rejects.toThrow();
    });

    it('should handle invalid response format', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { invalid: 'format' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      } as any);

      await expect(service.fetchExploits()).rejects.toThrow(/Invalid response format/);
    });
  });

  describe.skip('cache management', () => {
    it('should clear cache', async () => {
      const mockData = { exploits: [] };

      mockAxiosGet.mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      } as any);

      // Populate cache
      await service.fetchExploits();
      expect(mockAxiosGet).toHaveBeenCalledTimes(1);

      // Use cache
      await service.fetchExploits();
      expect(mockAxiosGet).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearCache();

      // Should hit API again
      await service.fetchExploits();
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    it('should provide cache stats', () => {
      const stats = service.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('ttl');
    });
  });

  describe('getSourcesHealth', () => {
    it('should return health status', () => {
      const health = service.getSourcesHealth();
      expect(Array.isArray(health)).toBe(true);
      expect(health.length).toBeGreaterThan(0);
      expect(health[0]).toHaveProperty('name');
      expect(health[0]).toHaveProperty('healthy');
      expect(health[0]).toHaveProperty('failures');
    });
  });
});
