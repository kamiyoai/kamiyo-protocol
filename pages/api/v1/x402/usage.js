/**
 * GET /api/v1/x402/usage
 *
 * Get current usage statistics for tenant
 * Requires: Bearer token with API key
 */

import { APIKeyManager } from '../../../../lib/x402-saas/api-key-manager.js';
import { TenantManager } from '../../../../lib/x402-saas/tenant-manager.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header'
      });
    }

    const apiKey = authHeader.replace('Bearer ', '');

    // Validate API key and get tenant
    const keyInfo = await APIKeyManager.validateApiKey(apiKey);

    if (!keyInfo) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const tenant = await TenantManager.getTenant(keyInfo.tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const enabledChains = JSON.parse(tenant.enabledChains);
    const isUnlimited = tenant.tier === 'enterprise';

    return res.status(200).json({
      tier: tenant.tier,
      verifications_used: tenant.monthlyVerificationsUsed,
      verifications_limit: isUnlimited ? -1 : tenant.monthlyVerificationLimit,
      verifications_remaining: isUnlimited
        ? -1
        : Math.max(0, tenant.monthlyVerificationLimit - tenant.monthlyVerificationsUsed),
      quota_reset_date: tenant.quotaResetDate?.toISOString(),
      enabled_chains: enabledChains,
      usage_percent: isUnlimited
        ? 0
        : ((tenant.monthlyVerificationsUsed / tenant.monthlyVerificationLimit) * 100).toFixed(2)
    });

  } catch (error) {
    console.error('Usage stats error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
}
