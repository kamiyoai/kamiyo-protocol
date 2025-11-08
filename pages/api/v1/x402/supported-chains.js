/**
 * GET /api/v1/x402/supported-chains
 *
 * Get chains available for tenant's tier
 * Requires: Bearer token with API key
 */

import { APIKeyManager } from '../../../../lib/x402-saas/api-key-manager.js';
import { TenantManager } from '../../../../lib/x402-saas/tenant-manager.js';

const ALL_CHAINS = [
  'solana',
  'base',
  'ethereum',
  'polygon',
  'avalanche',
  'sei',
  'iotex',
  'peaq'
];

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

    return res.status(200).json({
      tier: tenant.tier,
      enabled_chains: enabledChains.includes('all') ? ALL_CHAINS : enabledChains,
      all_chains: ALL_CHAINS,
      payai_enabled: tenant.payaiEnabled
    });

  } catch (error) {
    console.error('Supported chains error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
}
