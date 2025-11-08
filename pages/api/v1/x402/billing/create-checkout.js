/**
 * POST /api/v1/x402/billing/create-checkout
 *
 * Create Stripe Checkout session for subscription
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

    const { tier, success_url, successUrl, cancel_url, cancelUrl } = req.body;

    if (!tier) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Required: tier (starter, pro, or enterprise)'
      });
    }

    if (tier === 'free') {
      return res.status(400).json({
        error: 'Invalid tier',
        message: 'Free tier does not require checkout. Already active.'
      });
    }

    // Default redirect URLs
    const defaultSuccessUrl = `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`;
    const defaultCancelUrl = `${process.env.NEXTAUTH_URL}/pricing?checkout=cancelled`;

    const finalSuccessUrl = success_url || successUrl || defaultSuccessUrl;
    const finalCancelUrl = cancel_url || cancelUrl || defaultCancelUrl;

    // Create checkout session
    const session = await BillingService.createCheckoutSession(
      keyInfo.tenantId,
      tier,
      finalSuccessUrl,
      finalCancelUrl
    );

    return res.status(200).json({
      checkout_url: session.url,
      session_id: session.id
    });

  } catch (error) {
    console.error('Create checkout error:', error);

    if (error.message.includes('Invalid tier')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
}
