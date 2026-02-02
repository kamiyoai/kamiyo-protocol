import { EigenAIClient } from './eigenai-client';
import { EigenAIError } from './types';

describe('EigenAIClient', () => {
  describe('constructor', () => {
    it('throws on missing API key', () => {
      expect(() => new EigenAIClient('')).toThrow(EigenAIError);
      expect(() => new EigenAIClient('')).toThrow('API key is required');
    });

    it('accepts valid API key', () => {
      const client = new EigenAIClient('test-key');
      expect(client).toBeInstanceOf(EigenAIClient);
    });

    it('accepts custom base URL', () => {
      const client = new EigenAIClient('test-key', 'https://custom.api');
      expect(client).toBeInstanceOf(EigenAIClient);
    });

    it('rejects non-HTTPS base URL', () => {
      expect(() => new EigenAIClient('test-key', 'http://insecure.api')).toThrow(EigenAIError);
      expect(() => new EigenAIClient('test-key', 'http://insecure.api')).toThrow('Must use HTTPS');
    });
  });

  describe('verifyAttestation', () => {
    let client: EigenAIClient;

    beforeEach(() => {
      client = new EigenAIClient('test-key');
    });

    it('returns false for missing signature', async () => {
      const result = await client.verifyAttestation({
        model: 'qwen3-32b',
        modelHash: '0x123',
        inputHash: '0x456',
        outputHash: '0x789',
        timestamp: Date.now(),
        signature: '',
      });
      expect(result).toBe(false);
    });

    it('returns false for missing hashes', async () => {
      const result = await client.verifyAttestation({
        model: 'qwen3-32b',
        modelHash: '',
        inputHash: '0x456',
        outputHash: '0x789',
        timestamp: Date.now(),
        signature: 'a'.repeat(64),
      });
      expect(result).toBe(false);
    });

    it('returns false for invalid timestamp', async () => {
      const result = await client.verifyAttestation({
        model: 'qwen3-32b',
        modelHash: '0x123',
        inputHash: '0x456',
        outputHash: '0x789',
        timestamp: 0,
        signature: 'a'.repeat(64),
      });
      expect(result).toBe(false);
    });

    it('returns true for structurally valid attestation', async () => {
      const result = await client.verifyAttestation({
        model: 'qwen3-32b',
        modelHash: '0x123',
        inputHash: '0x456',
        outputHash: '0x789',
        timestamp: Date.now(),
        signature: 'a'.repeat(64),
      });
      expect(result).toBe(true);
    });
  });

  describe('inference', () => {
    let client: EigenAIClient;

    beforeEach(() => {
      client = new EigenAIClient('test-key');
    });

    it('throws on empty messages', async () => {
      await expect(
        client.inference({
          model: 'qwen3-32b',
          messages: [],
        })
      ).rejects.toThrow('At least one message is required');
    });

    // Network tests would require mocking fetch
    // Skipping actual API calls in unit tests
  });
});
