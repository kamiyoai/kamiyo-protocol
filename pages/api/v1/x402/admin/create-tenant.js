/**
 * POST /api/v1/x402/admin/create-tenant
 *
 * Create new tenant account (admin only)
 * This will be used for onboarding new customers
 */

import { TenantManager } from '../../../../../lib/x402-saas/tenant-manager.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Admin authentication
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.X402_ADMIN_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { email, company_name, companyName, tier } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Required: email'
      });
    }

    // Check if tenant already exists
    const existingTenant = await TenantManager.getTenantByEmail(email);
    if (existingTenant) {
      return res.status(409).json({
        error: 'Tenant already exists',
        message: `Tenant with email ${email} already exists`
      });
    }

    // Create tenant
    const { tenant, apiKey } = await TenantManager.createTenant(
      email,
      company_name || companyName,
      tier || 'free'
    );

    return res.status(201).json({
      tenant: {
        id: tenant.id,
        email: tenant.email,
        companyName: tenant.companyName,
        tier: tenant.tier,
        status: tenant.status,
        monthlyVerificationLimit: tenant.monthlyVerificationLimit,
        enabledChains: JSON.parse(tenant.enabledChains),
        createdAt: tenant.createdAt
      },
      apiKey, // Return API key only once!
      message: 'Tenant created successfully. Save the API key - it will not be shown again.'
    });

  } catch (error) {
    console.error('Create tenant error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
}
