import { Keypair } from '@solana/web3.js';
import { EigenAIClient } from './eigenai-client';
import { EigenAIError } from './types';

describe('EigenAIClient', () => {
  const testWallet = Keypair.generate();

  describe('constructor', () => {
    it('throws on missing wallet', () => {
      expect(() => new EigenAIClient(null as unknown as Keypair)).toThrow(EigenAIError);
      expect(() => new EigenAIClient(null as unknown as Keypair)).toThrow('Wallet keypair is required');
    });

    it('accepts valid wallet', () => {
      const client = new EigenAIClient(testWallet);
      expect(client).toBeInstanceOf(EigenAIClient);
    });

    it('accepts custom base URL', () => {
      const client = new EigenAIClient(testWallet, 'https://custom.api');
      expect(client).toBeInstanceOf(EigenAIClient);
    });

    it('rejects non-HTTPS base URL', () => {
      expect(() => new EigenAIClient(testWallet, 'http://insecure.api')).toThrow(EigenAIError);
      expect(() => new EigenAIClient(testWallet, 'http://insecure.api')).toThrow('Must use HTTPS');
    });
  });

  describe('verifyAttestation', () => {
    let client: EigenAIClient;

    beforeEach(() => {
      client = new EigenAIClient(testWallet);
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

    it('returns false for missing hashes', async () => {
      const result = await client.verifyAttestation({
        model: 'gpt-oss-120b-f16',
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
      client = new EigenAIClient(testWallet);
    });

    it('throws on empty messages', async () => {
      await expect(
        client.inference({
          model: 'gpt-oss-120b-f16',
          messages: [],
        })
      ).rejects.toThrow('At least one message is required');
    });
  });
});
