import { describe, it, expect, beforeEach } from 'vitest';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SettlementClient } from '../src/client.js';
import { SettlementStatus } from '../src/types.js';
import { ViolationType, createViolation } from '../src/violations.js';

describe('SettlementClient', () => {
  let client: SettlementClient;
  let wallet: Keypair;
  let provider: PublicKey;
  let connection: Connection;

  beforeEach(() => {
    wallet = Keypair.generate();
    provider = Keypair.generate().publicKey;
    connection = new Connection('https://api.devnet.solana.com');
    client = new SettlementClient({ connection, wallet });
    client.clearStore();
  });

  describe('checkEligibility', () => {
    it('rejects invalid payment reference', async () => {
      const result = await client.checkEligibility('short');
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Invalid payment reference');
    });

    it('accepts valid payment reference', async () => {
      const result = await client.checkEligibility('valid-payment-reference-12345');
      expect(result.eligible).toBe(true);
    });

    it('rejects duplicate settlement', async () => {
      const paymentRef = 'unique-payment-ref-12345';
      const violation = createViolation(ViolationType.Timeout, 5000, -1, 'timeout');

      await client.requestSettlement({ paymentRef, provider, violation });

      const result = await client.checkEligibility(paymentRef);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Settlement already exists');
    });

    it('rejects payment reference with invalid characters', async () => {
      const result = await client.checkEligibility('payment<script>ref');
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    it('rejects payment reference exceeding max length', async () => {
      const longRef = 'a'.repeat(300);
      const result = await client.checkEligibility(longRef);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Invalid payment reference');
    });
  });

  describe('requestSettlement', () => {
    it('creates settlement for valid violation', async () => {
      const violation = createViolation(
        ViolationType.Latency,
        5000,
        15000,
        'slow response'
      );

      const result = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      expect(result.settlementId).toBeDefined();
      expect(result.status).toBe(SettlementStatus.Pending);
      expect(result.refundPercent).toBe(75); // >3x latency
    });

    it('throws without wallet', async () => {
      const noWalletClient = new SettlementClient({ connection });
      const violation = createViolation(ViolationType.Timeout, 5000, -1, 'timeout');

      await expect(
        noWalletClient.requestSettlement({
          paymentRef: 'payment-ref-12345',
          provider,
          violation,
        })
      ).rejects.toThrow('Wallet required');
    });

    it('throws for invalid violation', async () => {
      const invalidViolation = {
        type: ViolationType.Latency,
        expected: 5000,
        actual: 10000,
        evidence: 'not-a-hash',
        timestamp: Date.now(),
      };

      await expect(
        client.requestSettlement({
          paymentRef: 'payment-ref-12345',
          provider,
          violation: invalidViolation,
        })
      ).rejects.toThrow('Invalid violation');
    });
  });

  describe('getStatus', () => {
    it('returns null for unknown settlement', async () => {
      const result = await client.getStatus('nonexistent-id');
      expect(result).toBeNull();
    });

    it('returns settlement state', async () => {
      const violation = createViolation(ViolationType.Timeout, 5000, -1, 'timeout');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      const state = await client.getStatus(settlementId);
      expect(state).not.toBeNull();
      expect(state!.id).toBe(settlementId);
      expect(state!.status).toBe(SettlementStatus.Pending);
      expect(state!.refundPercent).toBe(100);
    });
  });

  describe('respondToSettlement', () => {
    it('accepts settlement when provider agrees', async () => {
      const violation = createViolation(ViolationType.ServerError, 'OK', '500', 'error');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      const result = await client.respondToSettlement(settlementId, { accept: true });
      expect(result.status).toBe(SettlementStatus.Accepted);

      const state = await client.getStatus(settlementId);
      expect(state!.resolvedAt).toBeDefined();
    });

    it('contests settlement when provider disagrees', async () => {
      const violation = createViolation(ViolationType.Malformed, 'json', 'xml', 'bad format');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      const result = await client.respondToSettlement(settlementId, {
        accept: false,
        evidence: 'counter-evidence-hash',
      });
      expect(result.status).toBe(SettlementStatus.Contested);
    });

    it('throws for non-pending settlement', async () => {
      const violation = createViolation(ViolationType.Timeout, 5000, -1, 'timeout');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      await client.respondToSettlement(settlementId, { accept: true });

      await expect(
        client.respondToSettlement(settlementId, { accept: false })
      ).rejects.toThrow('Cannot respond to settlement');
    });
  });

  describe('escalateToOracles', () => {
    it('escalates contested settlement', async () => {
      const violation = createViolation(ViolationType.Incomplete, '100%', '50%', 'partial');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      await client.respondToSettlement(settlementId, { accept: false });
      const result = await client.escalateToOracles(settlementId);

      expect(result.status).toBe(SettlementStatus.Escalated);
    });

    it('throws for non-contested settlement', async () => {
      const violation = createViolation(ViolationType.Timeout, 5000, -1, 'timeout');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      await expect(client.escalateToOracles(settlementId)).rejects.toThrow(
        'Only contested settlements'
      );
    });
  });

  describe('resolveWithOracleScore', () => {
    it('resolves with full refund for high oracle score', async () => {
      const violation = createViolation(ViolationType.Malformed, 'json', 'xml', 'bad');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      await client.respondToSettlement(settlementId, { accept: false });
      await client.escalateToOracles(settlementId);

      const result = await client.resolveWithOracleScore(settlementId, 85);
      expect(result.status).toBe(SettlementStatus.Resolved);
      expect(result.refundPercent).toBe(75); // Original malformed refund
    });

    it('reduces refund for medium oracle score', async () => {
      const violation = createViolation(ViolationType.Malformed, 'json', 'xml', 'bad');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      await client.respondToSettlement(settlementId, { accept: false });
      await client.escalateToOracles(settlementId);

      const result = await client.resolveWithOracleScore(settlementId, 55);
      expect(result.refundPercent).toBe(37); // 75 * 0.5 = 37.5 → 37
    });

    it('rejects refund for low oracle score', async () => {
      const violation = createViolation(ViolationType.Malformed, 'json', 'xml', 'bad');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-12345',
        provider,
        violation,
      });

      await client.respondToSettlement(settlementId, { accept: false });
      await client.escalateToOracles(settlementId);

      const result = await client.resolveWithOracleScore(settlementId, 30);
      expect(result.refundPercent).toBe(0);
    });

    it('throws for oracle score out of bounds', async () => {
      const violation = createViolation(ViolationType.Malformed, 'json', 'xml', 'bad');
      const { settlementId } = await client.requestSettlement({
        paymentRef: 'payment-ref-67890',
        provider,
        violation,
      });

      await client.respondToSettlement(settlementId, { accept: false });
      await client.escalateToOracles(settlementId);

      await expect(client.resolveWithOracleScore(settlementId, 150)).rejects.toThrow('Oracle score must be 0-100');
      await expect(client.resolveWithOracleScore(settlementId, -10)).rejects.toThrow('Oracle score must be 0-100');
      await expect(client.resolveWithOracleScore(settlementId, NaN)).rejects.toThrow('Oracle score must be 0-100');
    });
  });
});
