/**
 * POST /api/v1/x402/keys/[keyId]/revoke
 *
 * Revoke an API key
 * Requires authentication via NextAuth session
 */

import prisma from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../auth/[...nextauth]';

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
        message: 'You must be logged in to revoke API keys'
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

    // Get key ID from URL
    const { keyId } = req.query;

    // Find the API key and verify it belongs to this tenant
    const apiKey = await prisma.x402APIKey.findUnique({
      where: { id: keyId }
    });

    if (!apiKey) {
      return res.status(404).json({
        error: 'API key not found'
      });
    }

    if (apiKey.tenantId !== tenant.id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This API key does not belong to your account'
      });
    }

    if (apiKey.revokedAt) {
      return res.status(400).json({
        error: 'API key already revoked'
      });
    }

    // Revoke the key
    await prisma.x402APIKey.update({
      where: { id: keyId },
      data: {
        revokedAt: new Date()
      }
    });

    return res.status(200).json({
      message: 'API key revoked successfully'
    });

  } catch (error) {
    console.error('API key revocation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
