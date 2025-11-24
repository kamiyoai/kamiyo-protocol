/**
 * POST /api/v1/x402/verify
 *
 * Verify on-chain USDC payment
 * Authentication: Optional (API key provides higher rate limits)
 */

import { VerificationService } from '../../../../lib/x402-saas/verification-service.js';
import { captureException } from '../../../../lib/x402-saas/sentry-config.js';
import rateLimiter from '../../../../lib/x402-saas/rate-limiter.js';
import { APIKeyManager } from '../../../../lib/x402-saas/api-key-manager.js';
import { InputValidation } from '../../../../lib/x402-saas/input-validation.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Define at function scope for error handling
  let apiKey, chain, txHashValue, isAuthenticated = false;

  try {
    // Get client IP for unauthenticated rate limiting
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                     req.headers['x-real-ip'] ||
                     req.socket.remoteAddress;

    // Extract API key from Authorization header (optional)
    const authHeader = req.headers.authorization;
    let keyInfo = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.replace('Bearer ', '');

      // Validate API key and get tenant info
      keyInfo = await APIKeyManager.validateApiKey(apiKey);
      if (!keyInfo) {
        return res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid or revoked'
        });
      }
      isAuthenticated = true;
    }

    // Check rate limit (IP-based for unauthenticated, tenant-based for authenticated)
    const rateLimitId = isAuthenticated ? keyInfo.tenantId : `ip:${ipAddress}`;
    const tier = isAuthenticated ? keyInfo.tier : 'unauthenticated';

    const rateLimit = await rateLimiter.checkLimit(rateLimitId, tier);
    res.setHeader('X-RateLimit-Limit', rateLimit.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimit.resetTime);

    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', rateLimit.retryAfter);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${rateLimit.limit}/${rateLimit.window}. ${!isAuthenticated ? 'Use an API key for higher limits.' : ''}`,
        retryAfter: rateLimit.retryAfter,
        resetTime: new Date(rateLimit.resetTime).toISOString()
      });
    }

    // Parse request body
    const { tx_hash, txHash: txHashAlt, chain: chainParam, expected_amount, expectedAmount } = req.body;

    // Support both snake_case and camelCase
    txHashValue = tx_hash || txHashAlt;
    chain = chainParam;
    const expectedAmountValue = expected_amount || expectedAmount;

    if (!txHashValue || !chain) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Required: tx_hash, chain'
      });
    }

    // Validate chain
    const chainValidation = InputValidation.validateChain(chain);
    if (!chainValidation.valid) {
      return res.status(400).json({
        error: chainValidation.error,
        errorCode: 'INVALID_CHAIN'
      });
    }
    chain = chainValidation.normalized;

    // Validate transaction hash
    const txHashValidation = InputValidation.validateTxHash(txHashValue, chain);
    if (!txHashValidation.valid) {
      return res.status(400).json({
        error: txHashValidation.error,
        errorCode: 'INVALID_TX_HASH'
      });
    }

    // Validate amount if provided
    if (expectedAmountValue !== null && expectedAmountValue !== undefined) {
      const amountValidation = InputValidation.validateAmount(expectedAmountValue);
      if (!amountValidation.valid) {
        return res.status(400).json({
          error: amountValidation.error,
          errorCode: 'INVALID_AMOUNT'
        });
      }
    }

    // Call verification service (apiKey can be null for unauthenticated requests)
    const result = await VerificationService.verifyPayment(
      apiKey || null,
      txHashValue,
      chain,
      expectedAmountValue,
      ipAddress
    );

    // Handle different error cases
    if (!result.success) {
      // Skip API key errors for unauthenticated requests
      if (!isAuthenticated && (result.errorCode === 'INVALID_API_KEY' || result.errorCode === 'TENANT_SUSPENDED')) {
        // These errors shouldn't occur for unauthenticated requests, but handle gracefully
        return res.status(400).json({
          error: 'Verification failed',
          message: result.message || 'Unable to verify payment'
        });
      }

      if (result.errorCode === 'INVALID_API_KEY' || result.errorCode === 'TENANT_SUSPENDED') {
        return res.status(401).json(result);
      }

      if (result.errorCode === 'QUOTA_EXCEEDED') {
        return res.status(429).json(result);
      }

      if (result.errorCode === 'CHAIN_NOT_ENABLED') {
        return res.status(403).json({
          ...result,
          message: `${result.message}${!isAuthenticated ? ' Upgrade to access this chain.' : ''}`
        });
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
