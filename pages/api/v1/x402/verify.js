/**
 * POST /api/v1/x402/verify
 *
 * Verify on-chain USDC payment
 * Requires: Bearer token with API key
 */

import { VerificationService } from '../../../../lib/x402-saas/verification-service.js';
import { captureException } from '../../../../lib/x402-saas/sentry-config.js';
import rateLimiter from '../../../../lib/x402-saas/rate-limiter.js';
import { APIKeyManager } from '../../../../lib/x402-saas/api-key-manager.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header',
        message: 'Include "Authorization: Bearer x402_live_XXXXX" header'
      });
    }

    const apiKey = authHeader.replace('Bearer ', '');

    // Validate API key and get tenant info (for rate limiting)
    const keyInfo = await APIKeyManager.validateApiKey(apiKey);
    if (!keyInfo) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is invalid or revoked'
      });
    }

    // Check rate limit
    const rateLimit = await rateLimiter.checkLimit(keyInfo.tenant.id, keyInfo.tenant.tier);
    res.setHeader('X-RateLimit-Limit', rateLimit.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimit.resetTime);

    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', rateLimit.retryAfter);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${rateLimit.limit}/${rateLimit.window}`,
        retryAfter: rateLimit.retryAfter,
        resetTime: new Date(rateLimit.resetTime).toISOString()
      });
    }

    // Parse request body
    const { tx_hash, txHash, chain, expected_amount, expectedAmount } = req.body;

    // Support both snake_case and camelCase
    const txHashValue = tx_hash || txHash;
    const expectedAmountValue = expected_amount || expectedAmount;

    if (!txHashValue || !chain) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Required: tx_hash, chain'
      });
    }

    // Get client IP
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Call verification service
    const result = await VerificationService.verifyPayment(
      apiKey,
      txHashValue,
      chain,
      expectedAmountValue,
      ipAddress
    );

    // Handle different error cases
    if (!result.success) {
      if (result.errorCode === 'INVALID_API_KEY' || result.errorCode === 'TENANT_SUSPENDED') {
        return res.status(401).json(result);
      }

      if (result.errorCode === 'QUOTA_EXCEEDED') {
        return res.status(429).json(result);
      }

      if (result.errorCode === 'CHAIN_NOT_ENABLED') {
        return res.status(403).json(result);
      }

      return res.status(400).json(result);
    }

    // Success
    return res.status(200).json(result);

  } catch (error) {
    console.error('Verification error:', error);

    // Track error with context
    captureException(error, {
      endpoint: '/api/v1/x402/verify',
      method: req.method,
      apiKey: apiKey?.substring(0, 20) + '...', // Partial key for debugging
      chain,
      txHash: txHashValue?.substring(0, 10) + '...',
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
}
