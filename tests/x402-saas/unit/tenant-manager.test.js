/**
 * Unit tests for TenantManager
 * Run with: npm test -- tests/x402-saas/unit/tenant-manager.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TenantManager, TIER_CONFIGS } from '../../../lib/x402-saas/tenant-manager.js';
import prisma from '../../../lib/prisma.js';

describe('TenantManager', () => {
  // Clean up test data after each test
  afterEach(async () => {
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

  describe('createTenant', () => {
    it('should create a tenant with free tier by default', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant, apiKey } = await TenantManager.createTenant(
        email,
        'Test Company',
        'free'
      );

      expect(tenant).toBeDefined();
      expect(tenant.email).toBe(email);
      expect(tenant.tier).toBe('free');
      expect(tenant.status).toBe('active');
      expect(tenant.monthlyVerificationLimit).toBe(1000);
      expect(tenant.monthlyVerificationsUsed).toBe(0);

      // Check payment addresses are generated
      expect(tenant.solanaPaymentAddress).toBeTruthy();
      expect(tenant.basePaymentAddress).toBeTruthy();
      expect(tenant.ethereumPaymentAddress).toBeTruthy();

      // Check API key is returned
      expect(apiKey).toBeTruthy();
      expect(apiKey.startsWith('x402_live_')).toBe(true);

      // Check enabled chains
      const enabledChains = JSON.parse(tenant.enabledChains);
      expect(enabledChains).toContain('solana');
      expect(enabledChains).toContain('base');
    });

    it('should create a tenant with starter tier', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(
        email,
        'Test Company',
        'starter'
      );

      expect(tenant.tier).toBe('starter');
      expect(tenant.monthlyVerificationLimit).toBe(50000);
      expect(tenant.payaiEnabled).toBe(true);
      expect(tenant.webhooksEnabled).toBe(true);

      const enabledChains = JSON.parse(tenant.enabledChains);
      expect(enabledChains).toContain('solana');
      expect(enabledChains).toContain('base');
      expect(enabledChains).toContain('ethereum');
    });

    it('should create a tenant with pro tier', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(
        email,
        'Test Company',
        'pro'
      );

      expect(tenant.tier).toBe('pro');
      expect(tenant.monthlyVerificationLimit).toBe(500000);
      expect(tenant.customBranding).toBe(true);

      const enabledChains = JSON.parse(tenant.enabledChains);
      expect(enabledChains.length).toBeGreaterThan(3);
    });

    it('should create a tenant with enterprise tier (unlimited)', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(
        email,
        'Test Company',
        'enterprise'
      );

      expect(tenant.tier).toBe('enterprise');
      expect(tenant.monthlyVerificationLimit).toBe(-1);

      const enabledChains = JSON.parse(tenant.enabledChains);
      expect(enabledChains).toContain('all');
    });

    it('should generate unique payment addresses', async () => {
      const email1 = `test-${Date.now()}-1@example.com`;
      const email2 = `test-${Date.now()}-2@example.com`;

      const { tenant: tenant1 } = await TenantManager.createTenant(email1, 'Company 1');
      const { tenant: tenant2 } = await TenantManager.createTenant(email2, 'Company 2');

      expect(tenant1.solanaPaymentAddress).not.toBe(tenant2.solanaPaymentAddress);
      expect(tenant1.basePaymentAddress).not.toBe(tenant2.basePaymentAddress);
    });
  });

  describe('checkQuota', () => {
    it('should return true when tenant has remaining quota', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(email, 'Test Co', 'free');

      const hasQuota = await TenantManager.checkQuota(tenant.id);
      expect(hasQuota).toBe(true);
    });

    it('should return false when tenant quota is exceeded', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(email, 'Test Co', 'free');

      // Use up the quota
      await prisma.x402Tenant.update({
        where: { id: tenant.id },
        data: { monthlyVerificationsUsed: 1000 }
      });

      const hasQuota = await TenantManager.checkQuota(tenant.id);
      expect(hasQuota).toBe(false);
    });

    it('should always return true for enterprise tier', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(email, 'Test Co', 'enterprise');

      // Even with high usage, should return true
      await prisma.x402Tenant.update({
        where: { id: tenant.id },
        data: { monthlyVerificationsUsed: 1000000 }
      });

      const hasQuota = await TenantManager.checkQuota(tenant.id);
      expect(hasQuota).toBe(true);
    });
  });

  describe('recordVerification', () => {
    it('should increment verification count', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(email, 'Test Co', 'free');

      await TenantManager.recordVerification(tenant.id);

      const updated = await TenantManager.getTenant(tenant.id);
      expect(updated.monthlyVerificationsUsed).toBe(1);
    });

    it('should increment count multiple times', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(email, 'Test Co', 'free');

      for (let i = 0; i < 5; i++) {
        await TenantManager.recordVerification(tenant.id);
      }

      const updated = await TenantManager.getTenant(tenant.id);
      expect(updated.monthlyVerificationsUsed).toBe(5);
    });
  });

  describe('updateTier', () => {
    it('should upgrade tenant from free to starter', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(email, 'Test Co', 'free');

      const updated = await TenantManager.updateTier(tenant.id, 'starter');

      expect(updated.tier).toBe('starter');
      expect(updated.monthlyVerificationLimit).toBe(50000);
      expect(updated.payaiEnabled).toBe(true);
    });

    it('should downgrade tenant from pro to starter', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(email, 'Test Co', 'pro');

      const updated = await TenantManager.updateTier(tenant.id, 'starter');

      expect(updated.tier).toBe('starter');
      expect(updated.monthlyVerificationLimit).toBe(50000);
      expect(updated.customBranding).toBe(false);
    });

    it('should throw error for invalid tier', async () => {
      const email = `test-${Date.now()}@example.com`;
      const { tenant } = await TenantManager.createTenant(email, 'Test Co', 'free');

      await expect(
        TenantManager.updateTier(tenant.id, 'invalid_tier')
      ).rejects.toThrow('Invalid tier');
    });
  });

  describe('getTierConfig', () => {
    it('should return correct config for free tier', () => {
      const config = TenantManager.getTierConfig('free');
      expect(config.monthlyVerifications).toBe(1000);
      expect(config.priceMonthly).toBe(0);
    });

    it('should return correct config for starter tier', () => {
      const config = TenantManager.getTierConfig('starter');
      expect(config.monthlyVerifications).toBe(50000);
      expect(config.priceMonthly).toBe(99);
    });

    it('should return free tier config for invalid tier', () => {
      const config = TenantManager.getTierConfig('invalid');
      expect(config).toEqual(TIER_CONFIGS.free);
    });
  });
});
