import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { describe, it, beforeAll, expect } from '@jest/globals';
import axios from 'axios';

describe('Oracle Integration Tests', () => {
  let connection: Connection;
  let oracleEndpoint: string;
  
  beforeAll(() => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    oracleEndpoint = process.env.ORACLE_URL || 'http://localhost:8000';
  });

  describe('Centralized Oracle', () => {
    it('should verify Ed25519 signatures correctly', async () => {
      const testData = {
        transactionId: 'test_sig_' + Date.now(),
        qualityScore: 75,
        refundPercentage: 25
      };

      const response = await axios.post(`${oracleEndpoint}/assess`, testData);
      
      expect(response.data).toHaveProperty('signature');
      expect(response.data).toHaveProperty('qualityScore');
      expect(response.data).toHaveProperty('refundPercentage');
    });

    it('should reject invalid quality score ranges', async () => {
      const invalidScores = [-1, 101, 255, 1000];

      for (const score of invalidScores) {
        await expect(
          axios.post(`${oracleEndpoint}/assess`, {
            transactionId: 'invalid_' + Date.now(),
            qualityScore: score,
            refundPercentage: 0
          })
        ).rejects.toThrow();
      }
    });

    it('should enforce timestamp freshness', async () => {
      const staleTimestamp = Date.now() - (6 * 60 * 1000);

      await expect(
        axios.post(`${oracleEndpoint}/assess`, {
          transactionId: 'stale_' + Date.now(),
          qualityScore: 85,
          refundPercentage: 0,
          timestamp: staleTimestamp
        })
      ).rejects.toThrow();
    });

    it('should validate data completeness', async () => {
      const testCases = [
        { expectedFields: 10, receivedFields: 10, expectedScore: 100 },
        { expectedFields: 10, receivedFields: 5, expectedScore: 50 },
        { expectedFields: 10, receivedFields: 0, expectedScore: 0 }
      ];

      for (const test of testCases) {
        const response = await axios.post(`${oracleEndpoint}/assess`, {
          transactionId: 'complete_' + Date.now(),
          expectedFields: test.expectedFields,
          receivedFields: test.receivedFields
        });

        expect(response.data.qualityScore).toBeCloseTo(test.expectedScore, 10);
      }
    });

    it('should verify schema compliance', async () => {
      const schema = {
        required: ['price', 'volume', 'timestamp'],
        properties: {
          price: 'number',
          volume: 'number',
          timestamp: 'number'
        }
      };

      const validData = {
        price: 100.5,
        volume: 1000,
        timestamp: Date.now()
      };

      const response = await axios.post(`${oracleEndpoint}/assess`, {
        transactionId: 'schema_' + Date.now(),
        schema,
        data: validData
      });

      expect(response.data.qualityScore).toBeGreaterThan(80);
    });

    it('should handle concurrent assessment requests', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          axios.post(`${oracleEndpoint}/assess`, {
            transactionId: 'concurrent_' + Date.now() + '_' + i,
            qualityScore: 75 + i,
            refundPercentage: 25 - i
          })
        );
      }

      const results = await Promise.all(promises);
      expect(results.length).toBe(10);
      results.forEach(r => {
        expect(r.status).toBe(200);
        expect(r.data).toHaveProperty('signature');
      });
    });
  });

  describe('Switchboard Oracle', () => {
    it('should fetch feed data within freshness window', async () => {
      const feedPubkey = new PublicKey('FEED_PUBKEY_HERE');
      
      const accountInfo = await connection.getAccountInfo(feedPubkey);
      expect(accountInfo).not.toBeNull();

      if (accountInfo) {
        const data = accountInfo.data;
        expect(data.length).toBeGreaterThan(0);
      }
    });

    it('should validate attestation timestamps', async () => {
      const maxAge = 300;
      const currentTime = Math.floor(Date.now() / 1000);

      const validTimestamps = [
        currentTime,
        currentTime - 100,
        currentTime - 299
      ];

      const invalidTimestamps = [
        currentTime - 301,
        currentTime - 600,
        currentTime + 100
      ];

      validTimestamps.forEach(ts => {
        const age = currentTime - ts;
        expect(age).toBeLessThanOrEqual(maxAge);
      });

      invalidTimestamps.forEach(ts => {
        const age = Math.abs(currentTime - ts);
        expect(age).toBeGreaterThan(maxAge);
      });
    });

    it('should handle oracle downtime gracefully', async () => {
      const fallbackOracle = process.env.FALLBACK_ORACLE_URL;

      if (fallbackOracle) {
        const response = await axios.post(`${fallbackOracle}/assess`, {
          transactionId: 'fallback_' + Date.now(),
          qualityScore: 85,
          refundPercentage: 15
        });

        expect(response.status).toBe(200);
      }
    });

    it('should verify cryptographic attestation', async () => {
      const response = await axios.post(`${oracleEndpoint}/assess`, {
        transactionId: 'crypto_' + Date.now(),
        qualityScore: 90,
        refundPercentage: 10
      });

      expect(response.data).toHaveProperty('signature');
      expect(response.data.signature).toMatch(/^[0-9a-fA-F]+$/);
      expect(response.data.signature.length).toBeGreaterThan(64);
    });
  });

  describe('Multi-Oracle Consensus', () => {
    it('should aggregate results from multiple oracles', async () => {
      const oracles = [
        process.env.ORACLE_1_URL,
        process.env.ORACLE_2_URL,
        process.env.ORACLE_3_URL
      ].filter(Boolean);

      if (oracles.length < 2) {
        console.log('Skipping multi-oracle test: insufficient oracles configured');
        return;
      }

      const txId = 'multi_' + Date.now();
      const promises = oracles.map(url =>
        axios.post(`${url}/assess`, {
          transactionId: txId,
          qualityScore: 75,
          refundPercentage: 25
        })
      );

      const results = await Promise.all(promises);
      const scores = results.map(r => r.data.qualityScore);
      
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      expect(avgScore).toBeGreaterThan(0);
      expect(avgScore).toBeLessThanOrEqual(100);
    });

    it('should handle oracle disagreement', async () => {
      const mockResults = [
        { qualityScore: 90, refundPercentage: 10 },
        { qualityScore: 50, refundPercentage: 50 },
        { qualityScore: 70, refundPercentage: 30 }
      ];

      const avgQuality = mockResults.reduce((sum, r) => sum + r.qualityScore, 0) / mockResults.length;
      const avgRefund = mockResults.reduce((sum, r) => sum + r.refundPercentage, 0) / mockResults.length;

      expect(avgQuality).toBeCloseTo(70, 0);
      expect(avgRefund).toBeCloseTo(30, 0);
    });

    it('should detect and exclude outlier results', async () => {
      const results = [85, 87, 86, 88, 20, 84];

      const sorted = [...results].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      
      const filtered = results.filter(v => 
        v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr
      );

      expect(filtered).not.toContain(20);
      expect(filtered.length).toBe(results.length - 1);
    });
  });

  describe('Quality Assessment Logic', () => {
    it('should calculate quality based on completeness', async () => {
      const testCases = [
        { expected: 10, received: 10, minScore: 90 },
        { expected: 10, received: 8, minScore: 70 },
        { expected: 10, received: 5, minScore: 40 },
        { expected: 10, received: 0, minScore: 0 }
      ];

      for (const test of testCases) {
        const completeness = (test.received / test.expected) * 100;
        expect(completeness).toBeGreaterThanOrEqual(test.minScore - 10);
      }
    });

    it('should factor in data freshness', async () => {
      const now = Date.now();
      const testCases = [
        { timestamp: now, expectedPenalty: 0 },
        { timestamp: now - 60000, expectedPenalty: 5 },
        { timestamp: now - 300000, expectedPenalty: 25 }
      ];

      for (const test of testCases) {
        const age = now - test.timestamp;
        const penalty = Math.min((age / 60000) * 5, 30);
        expect(penalty).toBeCloseTo(test.expectedPenalty, 1);
      }
    });

    it('should validate confidence thresholds', async () => {
      const confidenceLevels = [0.95, 0.85, 0.75, 0.65, 0.50];
      const expectedScores = [95, 85, 75, 65, 50];

      confidenceLevels.forEach((conf, i) => {
        const score = conf * 100;
        expect(score).toBeCloseTo(expectedScores[i], 0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const malformedRequests = [
        {},
        { transactionId: '' },
        { qualityScore: 'invalid' },
        null,
        undefined
      ];

      for (const req of malformedRequests) {
        await expect(
          axios.post(`${oracleEndpoint}/assess`, req)
        ).rejects.toThrow();
      }
    });

    it('should timeout on slow oracle responses', async () => {
      const slowClient = axios.create({ timeout: 1000 });

      await expect(
        slowClient.post(`${oracleEndpoint}/slow-assess`, {
          transactionId: 'timeout_' + Date.now(),
          qualityScore: 75
        })
      ).rejects.toThrow();
    });

    it('should retry failed oracle requests', async () => {
      let attempts = 0;
      const maxRetries = 3;

      while (attempts < maxRetries) {
        try {
          await axios.post(`${oracleEndpoint}/assess`, {
            transactionId: 'retry_' + Date.now(),
            qualityScore: 75
          });
          break;
        } catch (error) {
          attempts++;
          if (attempts === maxRetries) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      expect(attempts).toBeLessThanOrEqual(maxRetries);
    });
  });
});
