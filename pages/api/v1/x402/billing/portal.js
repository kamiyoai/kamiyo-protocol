/**
 * POST /api/v1/x402/billing/portal
 *
 * Create Stripe Customer Portal session
 * Allows tenants to manage their subscription, payment methods, invoices
 * Requires: Bearer token with API key
 */

import { APIKeyManager } from '../../../../../lib/x402-saas/api-key-manager.js';
import { BillingService } from '../../../../../lib/x402-saas/billing-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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

    const { return_url, returnUrl } = req.body;

    // Default return URL
    const defaultReturnUrl = `${process.env.NEXTAUTH_URL}/dashboard`;
    const finalReturnUrl = return_url || returnUrl || defaultReturnUrl;

    // Create portal session
    const session = await BillingService.createPortalSession(
      keyInfo.tenantId,
      finalReturnUrl
    );

    return res.status(200).json({
      portal_url: session.url
    });

  } catch (error) {
    console.error('Create portal error:', error);

    if (error.message.includes('No Stripe customer')) {
      return res.status(404).json({
        error: 'No subscription found',
        message: 'You need to subscribe to a paid plan first'
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
}
