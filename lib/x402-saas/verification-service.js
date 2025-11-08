/**
 * x402 SaaS Verification Service
 *
 * Multi-tenant payment verification wrapper
 * Adds quota enforcement, usage tracking, and billing on top of core verification
 */

import prisma from '../prisma.js';
import { APIKeyManager } from './api-key-manager.js';
import { TenantManager } from './tenant-manager.js';
import { PythonVerifierBridge } from './python-verifier-bridge.js';

// Error codes
export const ERROR_CODES = {
  INVALID_API_KEY: 'INVALID_API_KEY',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  CHAIN_NOT_ENABLED: 'CHAIN_NOT_ENABLED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED'
};

export class VerificationService {
  /**
   * Verify payment with tenant context
   * @param {string} apiKey - Tenant API key
   * @param {string} txHash - Transaction hash
   * @param {string} chain - Blockchain network
   * @param {number} expectedAmount - Expected payment amount in USDC
   * @param {string} ipAddress - Request IP address
   * @returns {Promise<object>}
   */
  static async verifyPayment(apiKey, txHash, chain, expectedAmount = null, ipAddress = null) {
    const startTime = Date.now();

    // 1. Validate API key
    const keyInfo = await APIKeyManager.validateApiKey(apiKey);

    if (!keyInfo) {
      return {
        success: false,
        error: 'Invalid API key',
        errorCode: ERROR_CODES.INVALID_API_KEY
      };
    }

    const { tenantId, tier, tenantStatus, keyId } = keyInfo;

    // Check if tenant is active
    if (tenantStatus !== 'active') {
      return {
        success: false,
        error: 'Tenant account suspended',
        errorCode: ERROR_CODES.TENANT_SUSPENDED
      };
    }

    // 2. Check for duplicate transaction (idempotency)
    const existing = await prisma.x402VerificationLog.findFirst({
      where: {
        tenantId,
        txHash,
        chain
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Return cached result if verified within last hour
    if (existing && (Date.now() - existing.createdAt.getTime()) < 3600000) {
      return {
        success: existing.success,
        cached: true,
        txHash: existing.txHash,
        chain: existing.chain,
        amountUsdc: existing.amountUsdc,
        fromAddress: existing.fromAddress,
        toAddress: existing.toAddress,
        confirmations: existing.confirmations,
        riskScore: existing.riskScore,
        timestamp: existing.timestamp,
        verifiedAt: existing.createdAt.toISOString(),
        message: 'Cached result from previous verification'
      };
    }

    // 3. Check quota
    const hasQuota = await TenantManager.checkQuota(tenantId);

    if (!hasQuota) {
      await this.recordVerification(tenantId, {
        txHash,
        chain,
        success: false,
        errorCode: ERROR_CODES.QUOTA_EXCEEDED,
        errorMessage: 'Monthly quota exceeded',
        apiKeyId: keyId,
        ipAddress,
        responseTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        error: 'Monthly quota exceeded. Upgrade your plan.',
        errorCode: ERROR_CODES.QUOTA_EXCEEDED,
        upgradeUrl: 'https://x402.dev/upgrade'
      };
    }

    // 3. Check if chain is enabled for this tier
    const tenant = await TenantManager.getTenant(tenantId);
    const enabledChains = JSON.parse(tenant.enabledChains);

    if (!enabledChains.includes(chain) && !enabledChains.includes('all')) {
      await this.recordVerification(tenantId, {
        txHash,
        chain,
        success: false,
        errorCode: ERROR_CODES.CHAIN_NOT_ENABLED,
        errorMessage: `Chain ${chain} not enabled for tier ${tier}`,
        apiKeyId: keyId,
        ipAddress,
        responseTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        error: `Chain ${chain} not enabled for your tier`,
        errorCode: ERROR_CODES.CHAIN_NOT_ENABLED,
        upgradeUrl: 'https://x402.dev/upgrade'
      };
    }

    // 4. Call core verification (using existing x402 payment_verifier)
    // This would import and use the Python payment verifier through an API call
    let verification;
    try {
      verification = await this.callCoreVerifier(txHash, chain, expectedAmount);
    } catch (error) {
      await this.recordVerification(tenantId, {
        txHash,
        chain,
        success: false,
        errorCode: ERROR_CODES.VERIFICATION_FAILED,
        errorMessage: error.message,
        apiKeyId: keyId,
        ipAddress,
        responseTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        error: `Verification error: ${error.message}`,
        errorCode: ERROR_CODES.VERIFICATION_FAILED
      };
    }

    // 5. Record usage and verification in transaction (for atomicity)
    // If recording fails, quota should not be consumed
    try {
      await prisma.$transaction(async (tx) => {
        // Record quota usage
        await TenantManager.recordVerification(tenantId, tx);

        // Store verification for analytics
        await this.recordVerification(tenantId, {
          txHash,
          chain,
          success: verification.isValid,
          amountUsdc: verification.amountUsdc,
          fromAddress: verification.fromAddress,
          toAddress: verification.toAddress,
          confirmations: verification.confirmations,
          riskScore: verification.riskScore,
          timestamp: verification.timestamp,
          errorCode: verification.isValid ? null : 'PAYMENT_INVALID',
          errorMessage: verification.errorMessage,
          apiKeyId: keyId,
          ipAddress,
          responseTimeMs: Date.now() - startTime
        }, tx);
      });
    } catch (txError) {
      console.error('Transaction recording failed:', txError);
      // Verification succeeded but recording failed - log but don't fail request
      // Client got valid verification result, we just lost analytics
      // This prevents double-charging on retry
    }

    // 6. Return result
    return {
      success: verification.isValid,
      txHash: verification.txHash,
      chain: verification.chain,
      amountUsdc: verification.amountUsdc ? parseFloat(verification.amountUsdc) : null,
      fromAddress: verification.fromAddress,
      toAddress: verification.toAddress,
      confirmations: verification.confirmations,
      riskScore: verification.riskScore,
      timestamp: verification.timestamp,
      error: verification.isValid ? null : verification.errorMessage,
      errorCode: verification.isValid ? null : 'PAYMENT_INVALID'
    };
  }

  /**
   * Call core x402 payment verifier
   * Uses PythonVerifierBridge to call the existing Python payment verifier
   * @param {string} txHash - Transaction hash
   * @param {string} chain - Blockchain network
   * @param {number} expectedAmount - Expected amount
   * @returns {Promise<object>}
   */
  static async callCoreVerifier(txHash, chain, expectedAmount) {
    return await PythonVerifierBridge.call(txHash, chain, expectedAmount);
  }

  /**
   * Record verification in database for analytics
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Verification data
   * @param {object} tx - Optional transaction client
   * @returns {Promise<object>}
   */
  static async recordVerification(tenantId, data, tx = null) {
    const client = tx || prisma;
    return client.x402VerificationLog.create({
      data: {
        tenantId,
        ...data,
        amountUsdc: data.amountUsdc ? parseFloat(data.amountUsdc) : null
      }
    });
  }

  /**
   * Get verification statistics for tenant
   * @param {string} tenantId - Tenant ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<object>}
   */
  static async getVerificationStats(tenantId, startDate, endDate) {
    const verifications = await prisma.x402Verification.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const total = verifications.length;
    const successful = verifications.filter(v => v.success).length;
    const failed = total - successful;

    const byChain = {};
    verifications.forEach(v => {
      if (!byChain[v.chain]) {
        byChain[v.chain] = { total: 0, successful: 0 };
      }
      byChain[v.chain].total++;
      if (v.success) byChain[v.chain].successful++;
    });

    const totalVolume = verifications
      .filter(v => v.success && v.amountUsdc)
      .reduce((sum, v) => sum + parseFloat(v.amountUsdc), 0);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) : 0,
      byChain,
      totalVolumeUsdc: totalVolume.toFixed(2)
    };
  }

  /**
   * Get recent verifications for tenant
   * @param {string} tenantId - Tenant ID
   * @param {number} limit - Number of records to return
   * @returns {Promise<object[]>}
   */
  static async getRecentVerifications(tenantId, limit = 10) {
    return prisma.x402Verification.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        txHash: true,
        chain: true,
        success: true,
        amountUsdc: true,
        errorCode: true,
        createdAt: true,
        responseTimeMs: true
      }
    });
  }
}
