import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DragQualityClient, type DKGClientInterface } from '../drag-quality.js';
import type { QualityMetadata } from '../types.js';

const createMockDkgClient = (): DKGClientInterface => ({
  query: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue({ content: {}, metadata: {} }),
  update: vi.fn().mockResolvedValue(undefined),
});

const validMetadata: Record<string, unknown> = {
  'kamiyo:qualityScore': 85,
  'kamiyo:verifiedAt': Math.floor(Date.now() / 1000),
  'kamiyo:oracleConsensus': 3,
  'kamiyo:publisherReputation': 80,
  'kamiyo:stakeAmount': '500000000',
  'kamiyo:verificationTx': '0x123',
  'kamiyo:status': 'verified',
};

describe('DragQualityClient', () => {
  let client: DragQualityClient;
  let mockDkgClient: ReturnType<typeof createMockDkgClient>;
  const validUal = 'did:dkg:otp/0x1234567890abcdef/12345';

  beforeEach(() => {
    mockDkgClient = createMockDkgClient();
    client = new DragQualityClient(mockDkgClient);
  });

  describe('getQualityMetadata', () => {
    it('fetches metadata from DKG client', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: { text: 'test' },
        metadata: validMetadata,
      });

      const result = await client.getQualityMetadata(validUal);

      expect(result).not.toBeNull();
      expect(result!.qualityScore).toBe(85);
      expect(result!.status).toBe('verified');
    });

    it('returns null for asset without quality metadata', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: { text: 'test' },
        metadata: {},
      });

      const result = await client.getQualityMetadata(validUal);
      expect(result).toBeNull();
    });

    it('caches metadata', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: { text: 'test' },
        metadata: validMetadata,
      });

      await client.getQualityMetadata(validUal);
      await client.getQualityMetadata(validUal);

      expect(mockDkgClient.get).toHaveBeenCalledTimes(1);
    });

    it('returns null on DKG error', async () => {
      mockDkgClient.get.mockRejectedValue(new Error('Network error'));

      const result = await client.getQualityMetadata(validUal);
      expect(result).toBeNull();
    });
  });

  describe('cache TTL', () => {
    it('respects cache TTL', async () => {
      const shortTtlClient = new DragQualityClient(mockDkgClient, { ttlMs: 100 });

      mockDkgClient.get.mockResolvedValue({
        content: { text: 'test' },
        metadata: validMetadata,
      });

      await shortTtlClient.getQualityMetadata(validUal);
      expect(mockDkgClient.get).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      await shortTtlClient.getQualityMetadata(validUal);
      expect(mockDkgClient.get).toHaveBeenCalledTimes(2);
    });

    it('enforces max cache size', async () => {
      const smallCacheClient = new DragQualityClient(mockDkgClient, { maxSize: 2 });

      mockDkgClient.get.mockResolvedValue({
        content: {},
        metadata: validMetadata,
      });

      // Fill cache
      await smallCacheClient.getQualityMetadata('did:dkg:otp/0x1111/1');
      await smallCacheClient.getQualityMetadata('did:dkg:otp/0x2222/2');

      const stats1 = smallCacheClient.getCacheStats();
      expect(stats1.size).toBe(2);

      // Add one more - should evict oldest
      await smallCacheClient.getQualityMetadata('did:dkg:otp/0x3333/3');

      const stats2 = smallCacheClient.getCacheStats();
      expect(stats2.size).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('clears all cache entries', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: {},
        metadata: validMetadata,
      });

      await client.getQualityMetadata(validUal);
      expect(client.getCacheStats().size).toBe(1);

      client.clearCache();
      expect(client.getCacheStats().size).toBe(0);
    });
  });

  describe('invalidateCache', () => {
    it('invalidates specific cache entry', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: {},
        metadata: validMetadata,
      });

      const ual1 = 'did:dkg:otp/0x1111/1';
      const ual2 = 'did:dkg:otp/0x2222/2';

      await client.getQualityMetadata(ual1);
      await client.getQualityMetadata(ual2);
      expect(client.getCacheStats().size).toBe(2);

      client.invalidateCache(ual1);
      expect(client.getCacheStats().size).toBe(1);
    });
  });

  describe('cleanExpired', () => {
    it('removes expired entries', async () => {
      const shortTtlClient = new DragQualityClient(mockDkgClient, { ttlMs: 50 });

      mockDkgClient.get.mockResolvedValue({
        content: {},
        metadata: validMetadata,
      });

      await shortTtlClient.getQualityMetadata('did:dkg:otp/0x1111/1');
      await shortTtlClient.getQualityMetadata('did:dkg:otp/0x2222/2');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      const cleaned = shortTtlClient.cleanExpired();
      expect(cleaned).toBe(2);
      expect(shortTtlClient.getCacheStats().size).toBe(0);
    });
  });

  describe('queryWithQuality', () => {
    it('filters results by quality score', async () => {
      mockDkgClient.query.mockResolvedValue([
        { '@id': 'did:dkg:otp/0x1111/1' },
        { '@id': 'did:dkg:otp/0x2222/2' },
      ]);

      // First has good quality, second has poor quality
      mockDkgClient.get
        .mockResolvedValueOnce({
          content: { text: 'high quality' },
          metadata: { ...validMetadata, 'kamiyo:qualityScore': 90 },
        })
        .mockResolvedValueOnce({
          content: { text: 'low quality' },
          metadata: { ...validMetadata, 'kamiyo:qualityScore': 40 },
        });

      const results = await client.queryWithQuality({
        sparql: 'SELECT ?asset WHERE { ?asset schema:about "test" }',
        qualityRequirements: {
          minOverallScore: 80,
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0].metadata.qualityScore).toBe(90);
    });

    it('excludes disputed assets when requested', async () => {
      mockDkgClient.query.mockResolvedValue([
        { '@id': 'did:dkg:otp/0x1111/1' },
      ]);

      mockDkgClient.get.mockResolvedValue({
        content: {},
        metadata: { ...validMetadata, 'kamiyo:status': 'disputed' },
      });

      const results = await client.queryWithQuality({
        sparql: 'SELECT ?asset WHERE { ?asset schema:about "test" }',
        qualityRequirements: {
          excludeDisputed: true,
        },
      });

      expect(results).toHaveLength(0);
    });

    it('sorts results by quality score descending', async () => {
      mockDkgClient.query.mockResolvedValue([
        { '@id': 'did:dkg:otp/0x1111/1' },
        { '@id': 'did:dkg:otp/0x2222/2' },
        { '@id': 'did:dkg:otp/0x3333/3' },
      ]);

      mockDkgClient.get
        .mockResolvedValueOnce({
          content: {},
          metadata: { ...validMetadata, 'kamiyo:qualityScore': 70 },
        })
        .mockResolvedValueOnce({
          content: {},
          metadata: { ...validMetadata, 'kamiyo:qualityScore': 95 },
        })
        .mockResolvedValueOnce({
          content: {},
          metadata: { ...validMetadata, 'kamiyo:qualityScore': 82 },
        });

      const results = await client.queryWithQuality({
        sparql: 'SELECT ?asset WHERE { ?asset schema:about "test" }',
        qualityRequirements: {},
      });

      expect(results[0].metadata.qualityScore).toBe(95);
      expect(results[1].metadata.qualityScore).toBe(82);
      expect(results[2].metadata.qualityScore).toBe(70);
    });
  });

  describe('getWithQuality', () => {
    it('returns asset with quality metadata', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: { text: 'test content' },
        metadata: validMetadata,
      });

      const result = await client.getWithQuality(validUal);

      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ text: 'test content' });
      expect(result!.metadata.qualityScore).toBe(85);
    });

    it('returns null for asset without quality', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: { text: 'test' },
        metadata: {},
      });

      const result = await client.getWithQuality(validUal);
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockDkgClient.get.mockRejectedValue(new Error('Not found'));

      const result = await client.getWithQuality(validUal);
      expect(result).toBeNull();
    });
  });

  describe('queryByQualityTier', () => {
    beforeEach(() => {
      mockDkgClient.query.mockResolvedValue([
        { '@id': 'did:dkg:otp/0x1111/1' },
      ]);
    });

    it('filters verified tier (80-100)', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: {},
        metadata: { ...validMetadata, 'kamiyo:qualityScore': 85 },
      });

      const results = await client.queryByQualityTier({
        sparql: 'SELECT ?asset WHERE { ?asset schema:about "test" }',
        tier: 'verified',
      });

      expect(results).toHaveLength(1);
    });

    it('filters unverified tier (0-79)', async () => {
      mockDkgClient.get.mockResolvedValue({
        content: {},
        metadata: { ...validMetadata, 'kamiyo:qualityScore': 60 },
      });

      const results = await client.queryByQualityTier({
        sparql: 'SELECT ?asset WHERE { ?asset schema:about "test" }',
        tier: 'unverified',
      });

      expect(results).toHaveLength(1);
    });

    it('respects limit parameter', async () => {
      mockDkgClient.query.mockResolvedValue([
        { '@id': 'did:dkg:otp/0x1111/1' },
        { '@id': 'did:dkg:otp/0x2222/2' },
        { '@id': 'did:dkg:otp/0x3333/3' },
      ]);

      mockDkgClient.get.mockResolvedValue({
        content: {},
        metadata: validMetadata,
      });

      const results = await client.queryByQualityTier({
        sparql: 'SELECT ?asset WHERE { ?asset schema:about "test" }',
        tier: 'all',
        limit: 2,
      });

      expect(results).toHaveLength(2);
    });
  });

  describe('buildQualityFilteredSparql', () => {
    it('adds quality filter to SPARQL query', () => {
      const baseSparql = 'SELECT ?asset WHERE { ?asset schema:about "test" }';
      const enhanced = client.buildQualityFilteredSparql(baseSparql, 80);

      expect(enhanced).toContain('qualityScore');
      expect(enhanced).toContain('FILTER');
      expect(enhanced).toContain('>= 80');
    });

    it('returns original query if no WHERE clause', () => {
      const baseSparql = 'CONSTRUCT { ?s ?p ?o }';
      const enhanced = client.buildQualityFilteredSparql(baseSparql, 80);

      expect(enhanced).toBe(baseSparql);
    });
  });

  describe('getCacheStats', () => {
    it('returns correct stats', () => {
      const stats = client.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(1000); // default
      expect(stats.ttlMs).toBe(5 * 60 * 1000); // default 5 minutes
    });

    it('reflects custom config', () => {
      const customClient = new DragQualityClient(mockDkgClient, {
        ttlMs: 60000,
        maxSize: 500,
      });

      const stats = customClient.getCacheStats();

      expect(stats.maxSize).toBe(500);
      expect(stats.ttlMs).toBe(60000);
    });
  });
});
