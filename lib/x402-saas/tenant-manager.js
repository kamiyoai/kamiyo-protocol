/**
 * x402 SaaS Tenant Manager
 *
 * Multi-tenant management for x402 Infrastructure SaaS
 * Each tenant gets isolated payment wallets, API keys, and usage quotas
 */

import prisma from '../prisma.js';
import crypto from 'crypto';
import { Keypair } from '@solana/web3.js';

// Tier configurations
const TIER_CONFIGS = {
  free: {
    monthlyVerifications: 1000,
    chains: ['solana', 'base'],
    payaiEnabled: false,
    customBranding: false,
    webhooksEnabled: false,
    priceMonthly: 0
  },
  starter: {
    monthlyVerifications: 50000,
    chains: ['solana', 'base', 'ethereum'],
    payaiEnabled: true,
    customBranding: false,
    webhooksEnabled: true,
    priceMonthly: 99
  },
  pro: {
    monthlyVerifications: 500000,
    chains: ['solana', 'base', 'ethereum', 'polygon', 'avalanche', 'sei'],
    payaiEnabled: true,
    customBranding: true,
    webhooksEnabled: true,
    priceMonthly: 299
  },
  enterprise: {
    monthlyVerifications: -1, // Unlimited
    chains: ['all'],
    payaiEnabled: true,
    customBranding: true,
    webhooksEnabled: true,
    priceMonthly: 999
  }
};

export class TenantManager {
  /**
   * Create new tenant account with isolated payment infrastructure
   * @param {string} email - Tenant email
   * @param {string} companyName - Company name
   * @param {string} tier - Pricing tier (free, starter, pro, enterprise)
   * @returns {Promise<{tenant: object, apiKey: string}>}
   */
  static async createTenant(email, companyName, tier = 'free') {
    const tierConfig = TIER_CONFIGS[tier] || TIER_CONFIGS.free;

    // Generate payment addresses
    const paymentAddresses = await this.generatePaymentAddresses();

    // Calculate quota reset date (first day of next month)
    const quotaResetDate = new Date();
    quotaResetDate.setMonth(quotaResetDate.getMonth() + 1);
    quotaResetDate.setDate(1);
    quotaResetDate.setHours(0, 0, 0, 0);

    // Create tenant
    const tenant = await prisma.x402Tenant.create({
      data: {
        email,
        companyName,
        tier,
        status: 'active',
        solanaPaymentAddress: paymentAddresses.solana,
        basePaymentAddress: paymentAddresses.base,
        ethereumPaymentAddress: paymentAddresses.ethereum,
        monthlyVerificationLimit: tierConfig.monthlyVerifications,
        monthlyVerificationsUsed: 0,
        quotaResetDate,
        enabledChains: JSON.stringify(tierConfig.chains),
        payaiEnabled: tierConfig.payaiEnabled,
        customBranding: tierConfig.customBranding,
        webhooksEnabled: tierConfig.webhooksEnabled
      }
    });

    // Create initial API key
    const { apiKey } = await this.createApiKey(tenant.id, 'Production API Key', 'live');

    return { tenant, apiKey };
  }

  /**
   * Generate isolated payment addresses for tenant
   * @returns {Promise<{solana: string, base: string, ethereum: string}>}
   */
  static async generatePaymentAddresses() {
    // Generate Solana address
    const solanaKeypair = Keypair.generate();
    const solanaAddress = solanaKeypair.publicKey.toBase58();

    // Generate EVM address (Base, Ethereum use same format)
    const evmPrivateKey = crypto.randomBytes(32);
    const evmAddress = '0x' + crypto.createHash('sha256')
      .update(evmPrivateKey)
      .digest('hex')
      .substring(0, 40);

    return {
      solana: solanaAddress,
      base: evmAddress,
      ethereum: evmAddress // Same address for all EVM chains
    };
  }

  /**
   * Create API key for tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} name - Key name
   * @param {string} environment - 'live' or 'test'
   * @returns {Promise<{apiKey: string, keyId: string}>}
   */
  static async createApiKey(tenantId, name, environment = 'live') {
    // Generate API key
    const prefix = environment === 'live' ? 'x402_live_' : 'x402_test_';
    const randomPart = crypto.randomBytes(32).toString('base64url');
    const apiKey = prefix + randomPart;

    // Hash for storage
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Create key record
    const keyRecord = await prisma.x402ApiKey.create({
      data: {
        tenantId,
        keyHash,
        name,
        environment,
        scopes: JSON.stringify(['verify', 'settle', 'analytics']),
        isActive: true
      }
    });

    return {
      apiKey, // Only returned once!
      keyId: keyRecord.id
    };
  }

  /**
   * Get tenant by ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object>}
   */
  static async getTenant(tenantId) {
    return prisma.x402Tenant.findUnique({
      where: { id: tenantId },
      include: {
        apiKeys: {
          where: { isActive: true }
        }
      }
    });
  }

  /**
   * Get tenant by email
   * @param {string} email - Tenant email
   * @returns {Promise<object>}
   */
  static async getTenantByEmail(email) {
    return prisma.x402Tenant.findUnique({
      where: { email }
    });
  }

  /**
   * Check if tenant has remaining quota
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<boolean>}
   */
  static async checkQuota(tenantId) {
    const tenant = await prisma.x402Tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) return false;

    // Enterprise tier has unlimited quota
    if (tenant.tier === 'enterprise') return true;

    return tenant.monthlyVerificationsUsed < tenant.monthlyVerificationLimit;
  }

  /**
   * Record verification against tenant quota
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<void>}
   */
  static async recordVerification(tenantId) {
    await prisma.x402Tenant.update({
      where: { id: tenantId },
      data: {
        monthlyVerificationsUsed: {
          increment: 1
        }
      }
    });
  }

  /**
   * Reset monthly quota for all tenants (run on cron)
   * @returns {Promise<number>} Number of tenants reset
   */
  static async resetMonthlyQuotas() {
    const result = await prisma.x402Tenant.updateMany({
      data: {
        monthlyVerificationsUsed: 0,
        quotaResetDate: new Date(new Date().setMonth(new Date().getMonth() + 1))
      }
    });

    return result.count;
  }

  /**
   * Update tenant tier (upgrade/downgrade)
   * @param {string} tenantId - Tenant ID
   * @param {string} newTier - New tier
   * @returns {Promise<object>}
   */
  static async updateTier(tenantId, newTier) {
    const tierConfig = TIER_CONFIGS[newTier];

    if (!tierConfig) {
      throw new Error(`Invalid tier: ${newTier}`);
    }

    return prisma.x402Tenant.update({
      where: { id: tenantId },
      data: {
        tier: newTier,
        monthlyVerificationLimit: tierConfig.monthlyVerifications,
        enabledChains: JSON.stringify(tierConfig.chains),
        payaiEnabled: tierConfig.payaiEnabled,
        customBranding: tierConfig.customBranding,
        webhooksEnabled: tierConfig.webhooksEnabled
      }
    });
  }

  /**
   * Get tier configuration
   * @param {string} tier - Tier name
   * @returns {object}
   */
  static getTierConfig(tier) {
    return TIER_CONFIGS[tier] || TIER_CONFIGS.free;
  }
}

export { TIER_CONFIGS };
