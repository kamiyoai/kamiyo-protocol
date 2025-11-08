/**
 * POST /api/v1/x402/verify
 *
 * Verify on-chain USDC payment
 * Requires: Bearer token with API key
 */

import { VerificationService } from '../../../../lib/x402-saas/verification-service.js';

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
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
}
