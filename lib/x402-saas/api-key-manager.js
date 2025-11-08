/**
 * x402 SaaS API Key Manager
 *
 * Manages API keys for tenant authentication
 * Format: x402_live_XXXXX (production) or x402_test_XXXXX (sandbox)
 */

import prisma from '../prisma.js';
import crypto from 'crypto';

export class APIKeyManager {
  /**
   * Validate API key and return tenant info
   * @param {string} apiKey - API key to validate
   * @returns {Promise<{tenantId: string, tier: string, scopes: string[], environment: string, tenantStatus: string} | null>}
   */
  static async validateApiKey(apiKey) {
    if (!apiKey || (!apiKey.startsWith('x402_live_') && !apiKey.startsWith('x402_test_'))) {
      return null;
    }

    // Hash the key
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Find key record
    const keyRecord = await prisma.x402ApiKey.findUnique({
      where: { keyHash },
      include: {
        tenant: true
      }
    });

    if (!keyRecord || !keyRecord.isActive) {
      return null;
    }

    // Update last_used_at
    await prisma.x402ApiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() }
    });

    return {
      tenantId: keyRecord.tenant.id,
      tier: keyRecord.tenant.tier,
      scopes: JSON.parse(keyRecord.scopes),
      environment: keyRecord.environment,
      tenantStatus: keyRecord.tenant.status,
      keyId: keyRecord.id
    };
  }

  /**
   * Create new API key for tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} name - Key name
   * @param {string} environment - 'live' or 'test'
   * @param {string[]} scopes - Permissions
   * @returns {Promise<{apiKey: string, keyId: string, createdAt: Date, environment: string, scopes: string[]}>}
   */
  static async createApiKey(tenantId, name, environment = 'live', scopes = null) {
    // Generate secure random key
    const prefix = environment === 'live' ? 'x402_live_' : 'x402_test_';
    const randomPart = crypto.randomBytes(32).toString('base64url');
    const apiKey = prefix + randomPart;

    // Hash for storage
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Default scopes
    const keyScopes = scopes || ['verify', 'settle', 'analytics'];

    // Create key record
    const keyRecord = await prisma.x402ApiKey.create({
      data: {
        tenantId,
        keyHash,
        name,
        environment,
        scopes: JSON.stringify(keyScopes),
        isActive: true
      }
    });

    return {
      apiKey, // Only returned once!
      keyId: keyRecord.id,
      createdAt: keyRecord.createdAt,
      environment,
      scopes: keyScopes
    };
  }

  /**
   * Revoke API key
   * @param {string} keyId - Key ID
   * @returns {Promise<object>}
   */
  static async revokeApiKey(keyId) {
    return prisma.x402ApiKey.update({
      where: { id: keyId },
      data: {
        isActive: false,
        revokedAt: new Date()
      }
    });
  }

  /**
   * List API keys for tenant
   * @param {string} tenantId - Tenant ID
   * @param {boolean} activeOnly - Only return active keys
   * @returns {Promise<object[]>}
   */
  static async listApiKeys(tenantId, activeOnly = true) {
    const where = { tenantId };
    if (activeOnly) {
      where.isActive = true;
    }

    const keys = await prisma.x402ApiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        environment: true,
        scopes: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        // Don't return keyHash
      }
    });

    return keys.map(key => ({
      ...key,
      scopes: JSON.parse(key.scopes)
    }));
  }

  /**
   * Rotate API key (create new, revoke old)
   * @param {string} oldKeyId - Old key ID to revoke
   * @param {string} tenantId - Tenant ID
   * @param {string} name - New key name
   * @param {string} environment - Environment
   * @returns {Promise<{apiKey: string, keyId: string}>}
   */
  static async rotateApiKey(oldKeyId, tenantId, name, environment) {
    // Create new key
    const { apiKey, keyId } = await this.createApiKey(tenantId, name, environment);

    // Revoke old key
    await this.revokeApiKey(oldKeyId);

    return { apiKey, keyId };
  }

  /**
   * Check if API key has specific scope
   * @param {string} apiKey - API key
   * @param {string} scope - Required scope
   * @returns {Promise<boolean>}
   */
  static async hasScope(apiKey, scope) {
    const keyInfo = await this.validateApiKey(apiKey);
    if (!keyInfo) return false;

    return keyInfo.scopes.includes(scope);
  }

  /**
   * Get API key usage stats
   * @param {string} keyId - Key ID
   * @returns {Promise<{totalVerifications: number, lastUsedAt: Date | null}>}
   */
  static async getKeyUsageStats(keyId) {
    const key = await prisma.x402ApiKey.findUnique({
      where: { id: keyId },
      select: {
        lastUsedAt: true
      }
    });

    // Count verifications using this key
    const totalVerifications = await prisma.x402Verification.count({
      where: { apiKeyId: keyId }
    });

    return {
      totalVerifications,
      lastUsedAt: key?.lastUsedAt || null
    };
  }
}
