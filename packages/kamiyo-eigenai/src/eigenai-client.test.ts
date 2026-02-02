import { EigenAIClient } from './eigenai-client';
import { EigenAIError, EigenAIAuthConfig } from './types';

describe('EigenAIClient', () => {
  const testApiKey = 'test-api-key-12345';
  const testPrivateKey = new Uint8Array(32).fill(1);
  const testWalletAddress = '0x6448D7772CF9dBd6112AE14176eE5E447A040a45';

  describe('constructor with API key auth', () => {
    it('throws on missing API key', () => {
      const auth: EigenAIAuthConfig = { type: 'apiKey', apiKey: '' };
      expect(() => new EigenAIClient(auth)).toThrow(EigenAIError);
      expect(() => new EigenAIClient(auth)).toThrow('Required');
    });

    it('accepts valid API key', () => {
      const auth: EigenAIAuthConfig = { type: 'apiKey', apiKey: testApiKey };
      const client = new EigenAIClient(auth);
      expect(client).toBeInstanceOf(EigenAIClient);
    });

    it('accepts custom base URL', () => {
      const auth: EigenAIAuthConfig = { type: 'apiKey', apiKey: testApiKey };
      const client = new EigenAIClient(auth, 'https://custom.api');
      expect(client).toBeInstanceOf(EigenAIClient);
    });

    it('rejects non-HTTPS base URL', () => {
      const auth: EigenAIAuthConfig = { type: 'apiKey', apiKey: testApiKey };
      expect(() => new EigenAIClient(auth, 'http://insecure.api')).toThrow(EigenAIError);
      expect(() => new EigenAIClient(auth, 'http://insecure.api')).toThrow('Must use HTTPS');
    });
  });

  describe('constructor with grant auth', () => {
    it('throws on invalid private key length', () => {
      const auth: EigenAIAuthConfig = {
        type: 'grant',
        privateKey: new Uint8Array(16),
        walletAddress: testWalletAddress,
      };
      expect(() => new EigenAIClient(auth)).toThrow(EigenAIError);
      expect(() => new EigenAIClient(auth)).toThrow('Must be 32 bytes');
    });

    it('throws on invalid wallet address', () => {
      const auth: EigenAIAuthConfig = {
        type: 'grant',
        privateKey: testPrivateKey,
        walletAddress: 'invalid',
      };
      expect(() => new EigenAIClient(auth)).toThrow(EigenAIError);
      expect(() => new EigenAIClient(auth)).toThrow('Invalid ETH address');
    });

    it('accepts valid grant auth', () => {
      const auth: EigenAIAuthConfig = {
        type: 'grant',
        privateKey: testPrivateKey,
        walletAddress: testWalletAddress,
      };
      const client = new EigenAIClient(auth);
      expect(client).toBeInstanceOf(EigenAIClient);
    });
  });

  describe('verifyAttestation', () => {
    let client: EigenAIClient;

    beforeEach(() => {
      const auth: EigenAIAuthConfig = { type: 'apiKey', apiKey: testApiKey };
      client = new EigenAIClient(auth);
    });

    it('returns false for missing signature', async () => {
      const result = await client.verifyAttestation({
        model: 'gpt-oss-120b-f16',
        modelHash: '0x123',
        inputHash: '0x456',
        outputHash: '0x789',
        timestamp: Date.now(),
        signature: '',
      });
      expect(result).toBe(false);
    });

    it('returns false for invalid timestamp', async () => {
      const result = await client.verifyAttestation({
        model: 'gpt-oss-120b-f16',
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
        model: 'gpt-oss-120b-f16',
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
      const auth: EigenAIAuthConfig = { type: 'apiKey', apiKey: testApiKey };
      client = new EigenAIClient(auth);
    });

    it('throws on empty messages', async () => {
      await expect(
        client.inference({
          model: 'gpt-oss-120b-f16',
          messages: [],
        })
      ).rejects.toThrow('At least one required');
    });
  });
});
