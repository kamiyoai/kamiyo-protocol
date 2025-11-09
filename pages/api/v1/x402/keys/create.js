/**
 * POST /api/v1/x402/keys/create
 *
 * Create new API key for tenant
 * Requires authentication via NextAuth session
 */

import prisma from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]';
import { APIKeyManager } from '../../../../../lib/x402-saas/api-key-manager';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get authenticated user session
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to create API keys'
      });
    }

    // Find tenant by user email
    const tenant = await prisma.x402Tenant.findUnique({
      where: { email: session.user.email }
    });

    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'No x402 account found for this user'
      });
    }

    // Get request body
    const { name, environment = 'production', scopes = ['verify'] } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Missing required field: name'
      });
    }

    // Create API key
    const apiKeyData = await APIKeyManager.createApiKey(
      tenant.id,
      name,
      environment,
      scopes
    );

    return res.status(201).json({
      api_key: apiKeyData.apiKey,
      key_prefix: apiKeyData.keyPrefix,
      message: 'API key created successfully. Save this key - you won\'t be able to see it again!'
    });

  } catch (error) {
    console.error('API key creation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
