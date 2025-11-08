/**
 * GET /api/v1/x402/keys
 *
 * Get user's API keys
 * Requires authentication via NextAuth session
 */

import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get authenticated user session
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to access API keys'
      });
    }

    // Find tenant by user email
    const tenant = await prisma.x402Tenant.findUnique({
      where: { email: session.user.email },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            environment: true,
            scopes: true,
            lastUsedAt: true,
            createdAt: true,
            expiresAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'No x402 account found for this user'
      });
    }

    // Return API keys (without showing full keys)
    return res.status(200).json({
      tenant_id: tenant.id,
      tier: tenant.tier,
      api_keys: tenant.apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        key_prefix: key.keyPrefix,
        environment: key.environment,
        scopes: JSON.parse(key.scopes),
        last_used: key.lastUsedAt?.toISOString(),
        created_at: key.createdAt.toISOString(),
        expires_at: key.expiresAt?.toISOString()
      }))
    });

  } catch (error) {
    console.error('API keys fetch error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
