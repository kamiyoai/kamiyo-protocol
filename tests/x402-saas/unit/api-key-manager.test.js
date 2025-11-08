/**
 * Unit tests for APIKeyManager
 * Run with: npm test -- tests/x402-saas/unit/api-key-manager.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { APIKeyManager } from '../../../lib/x402-saas/api-key-manager.js';
import { TenantManager } from '../../../lib/x402-saas/tenant-manager.js';
import prisma from '../../../lib/prisma.js';

describe('APIKeyManager', () => {
  let testTenant;

  beforeEach(async () => {
    // Create a test tenant for API key tests
    const email = `test-${Date.now()}@example.com`;
    const result = await TenantManager.createTenant(email, 'Test Company', 'free');
    testTenant = result.tenant;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.x402Verification.deleteMany({
      where: { tenant: { email: { contains: 'test-' } } }
    });
    await prisma.x402ApiKey.deleteMany({
      where: { tenant: { email: { contains: 'test-' } } }
    });
    await prisma.x402Tenant.deleteMany({
      where: { email: { contains: 'test-' } }
    });
  });

  describe('createApiKey', () => {
    it('should create a live API key', async () => {
      const { apiKey, keyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Production Key',
        'live'
      );

      expect(apiKey).toBeTruthy();
      expect(apiKey.startsWith('x402_live_')).toBe(true);
      expect(keyId).toBeTruthy();
    });

    it('should create a test API key', async () => {
      const { apiKey } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'test'
      );

      expect(apiKey.startsWith('x402_test_')).toBe(true);
    });

    it('should create unique API keys', async () => {
      const { apiKey: key1 } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Key 1',
        'live'
      );
      const { apiKey: key2 } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Key 2',
        'live'
      );

      expect(key1).not.toBe(key2);
    });

    it('should set default scopes', async () => {
      const { keyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live'
      );

      const keys = await APIKeyManager.listApiKeys(testTenant.id);
      const createdKey = keys.find(k => k.id === keyId);

      expect(createdKey.scopes).toContain('verify');
      expect(createdKey.scopes).toContain('settle');
      expect(createdKey.scopes).toContain('analytics');
    });

    it('should accept custom scopes', async () => {
      const { keyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Custom Key',
        'live',
        ['verify']
      );

      const keys = await APIKeyManager.listApiKeys(testTenant.id);
      const createdKey = keys.find(k => k.id === keyId);

      expect(createdKey.scopes).toEqual(['verify']);
    });
  });

  describe('validateApiKey', () => {
    it('should validate a correct API key', async () => {
      const { apiKey } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live'
      );

      const keyInfo = await APIKeyManager.validateApiKey(apiKey);

      expect(keyInfo).toBeTruthy();
      expect(keyInfo.tenantId).toBe(testTenant.id);
      expect(keyInfo.tier).toBe('free');
      expect(keyInfo.environment).toBe('live');
      expect(keyInfo.tenantStatus).toBe('active');
    });

    it('should reject invalid API key', async () => {
      const keyInfo = await APIKeyManager.validateApiKey('x402_live_invalid_key');

      expect(keyInfo).toBeNull();
    });

    it('should reject malformed API key', async () => {
      const keyInfo = await APIKeyManager.validateApiKey('invalid_format');

      expect(keyInfo).toBeNull();
    });

    it('should reject revoked API key', async () => {
      const { apiKey, keyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live'
      );

      // Revoke the key
      await APIKeyManager.revokeApiKey(keyId);

      const keyInfo = await APIKeyManager.validateApiKey(apiKey);

      expect(keyInfo).toBeNull();
    });

    it('should update lastUsedAt on validation', async () => {
      const { apiKey, keyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live'
      );

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      await APIKeyManager.validateApiKey(apiKey);

      const keys = await APIKeyManager.listApiKeys(testTenant.id, false);
      const usedKey = keys.find(k => k.id === keyId);

      expect(usedKey.lastUsedAt).toBeTruthy();
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an API key', async () => {
      const { keyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live'
      );

      await APIKeyManager.revokeApiKey(keyId);

      const keys = await APIKeyManager.listApiKeys(testTenant.id, false);
      const revokedKey = keys.find(k => k.id === keyId);

      expect(revokedKey.isActive).toBe(false);
      expect(revokedKey.revokedAt).toBeTruthy();
    });
  });

  describe('listApiKeys', () => {
    it('should list active API keys only by default', async () => {
      const { keyId: key1Id } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Key 1',
        'live'
      );
      await APIKeyManager.createApiKey(testTenant.id, 'Key 2', 'live');

      // Revoke one key
      await APIKeyManager.revokeApiKey(key1Id);

      const activeKeys = await APIKeyManager.listApiKeys(testTenant.id);

      expect(activeKeys.length).toBe(2); // 1 created in beforeEach + 1 active from this test
      expect(activeKeys.every(k => k.isActive)).toBe(true);
    });

    it('should list all API keys when activeOnly is false', async () => {
      const { keyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live'
      );

      await APIKeyManager.revokeApiKey(keyId);

      const allKeys = await APIKeyManager.listApiKeys(testTenant.id, false);

      expect(allKeys.length).toBe(2); // 1 from beforeEach + 1 from this test
      const inactiveKeys = allKeys.filter(k => !k.isActive);
      expect(inactiveKeys.length).toBe(1);
    });

    it('should not expose keyHash in list', async () => {
      await APIKeyManager.createApiKey(testTenant.id, 'Test Key', 'live');

      const keys = await APIKeyManager.listApiKeys(testTenant.id);

      keys.forEach(key => {
        expect(key.keyHash).toBeUndefined();
      });
    });
  });

  describe('rotateApiKey', () => {
    it('should create new key and revoke old one', async () => {
      const { apiKey: oldKey, keyId: oldKeyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Old Key',
        'live'
      );

      const { apiKey: newKey, keyId: newKeyId } = await APIKeyManager.rotateApiKey(
        oldKeyId,
        testTenant.id,
        'New Key',
        'live'
      );

      expect(newKey).not.toBe(oldKey);

      // Old key should be revoked
      const oldKeyInfo = await APIKeyManager.validateApiKey(oldKey);
      expect(oldKeyInfo).toBeNull();

      // New key should work
      const newKeyInfo = await APIKeyManager.validateApiKey(newKey);
      expect(newKeyInfo).toBeTruthy();
    });
  });

  describe('hasScope', () => {
    it('should return true when key has scope', async () => {
      const { apiKey } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live',
        ['verify', 'analytics']
      );

      const hasVerify = await APIKeyManager.hasScope(apiKey, 'verify');
      const hasAnalytics = await APIKeyManager.hasScope(apiKey, 'analytics');

      expect(hasVerify).toBe(true);
      expect(hasAnalytics).toBe(true);
    });

    it('should return false when key does not have scope', async () => {
      const { apiKey } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live',
        ['verify']
      );

      const hasSettle = await APIKeyManager.hasScope(apiKey, 'settle');

      expect(hasSettle).toBe(false);
    });

    it('should return false for invalid API key', async () => {
      const hasScope = await APIKeyManager.hasScope('invalid_key', 'verify');

      expect(hasScope).toBe(false);
    });
  });

  describe('getKeyUsageStats', () => {
    it('should return usage statistics for key', async () => {
      const { keyId } = await APIKeyManager.createApiKey(
        testTenant.id,
        'Test Key',
        'live'
      );

      // Create some verification records
      await prisma.x402Verification.createMany({
        data: [
          {
            tenantId: testTenant.id,
            apiKeyId: keyId,
            txHash: 'tx1',
            chain: 'solana',
            success: true
          },
          {
            tenantId: testTenant.id,
            apiKeyId: keyId,
            txHash: 'tx2',
            chain: 'base',
            success: true
          }
        ]
      });

      const stats = await APIKeyManager.getKeyUsageStats(keyId);

      expect(stats.totalVerifications).toBe(2);
    });
  });
});
