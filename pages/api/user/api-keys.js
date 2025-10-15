// API Key Management Endpoint
// Handles creation, listing, and revocation of user API keys

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Generate a secure API key
 * Format: kmy_<64 random hex characters>
 */
function generateApiKey() {
    return 'kmy_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Get user from session
 * TODO: Replace with actual session authentication
 */
async function getUserFromSession(req) {
    // For now, require email in query/body for testing
    // In production, this should come from NextAuth session
    const email = req.query.email || req.body?.email;

    if (!email) {
        return null;
    }

    return await prisma.user.findUnique({
        where: { email }
    });
}

export default async function handler(req, res) {
    const { method } = req;

    try {
        // Get authenticated user
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Please log in to manage API keys'
            });
        }

        switch (method) {
            case 'GET':
                // List user's API keys
                const apiKeys = await prisma.apiKey.findMany({
                    where: {
                        userId: user.id
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    select: {
                        id: true,
                        name: true,
                        key: true, // Full key shown only once
                        status: true,
                        lastUsedAt: true,
                        createdAt: true,
                        revokedAt: true
                    }
                });

                // Mask keys for security (show last 8 characters)
                const maskedKeys = apiKeys.map(key => ({
                    ...key,
                    key: key.status === 'active' ?
                        `kmy_...${key.key.slice(-8)}` :
                        'revoked'
                }));

                return res.status(200).json({
                    success: true,
                    apiKeys: maskedKeys
                });

            case 'POST':
                // Create new API key
                const { name } = req.body;

                // Check if user already has too many active keys (limit: 5)
                const activeCount = await prisma.apiKey.count({
                    where: {
                        userId: user.id,
                        status: 'active'
                    }
                });

                if (activeCount >= 5) {
                    return res.status(400).json({
                        error: 'Too many API keys',
                        message: 'Maximum 5 active API keys allowed. Please revoke an existing key first.'
                    });
                }

                // Generate new key
                const newKey = generateApiKey();

                const createdKey = await prisma.apiKey.create({
                    data: {
                        userId: user.id,
                        key: newKey,
                        name: name || `API Key ${activeCount + 1}`,
                        status: 'active'
                    }
                });

                return res.status(201).json({
                    success: true,
                    message: 'API key created successfully',
                    apiKey: {
                        id: createdKey.id,
                        name: createdKey.name,
                        key: createdKey.key, // Full key shown only once!
                        createdAt: createdKey.createdAt
                    },
                    warning: 'Save this key securely. You won\'t be able to see it again.'
                });

            case 'DELETE':
                // Revoke API key
                const { keyId } = req.body;

                if (!keyId) {
                    return res.status(400).json({
                        error: 'Missing keyId',
                        message: 'Please provide the API key ID to revoke'
                    });
                }

                // Verify key belongs to user
                const keyToRevoke = await prisma.apiKey.findFirst({
                    where: {
                        id: keyId,
                        userId: user.id
                    }
                });

                if (!keyToRevoke) {
                    return res.status(404).json({
                        error: 'Key not found',
                        message: 'API key not found or does not belong to you'
                    });
                }

                if (keyToRevoke.status === 'revoked') {
                    return res.status(400).json({
                        error: 'Already revoked',
                        message: 'This API key has already been revoked'
                    });
                }

                // Revoke the key
                await prisma.apiKey.update({
                    where: { id: keyId },
                    data: {
                        status: 'revoked',
                        revokedAt: new Date()
                    }
                });

                return res.status(200).json({
                    success: true,
                    message: 'API key revoked successfully'
                });

            default:
                res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
                return res.status(405).json({
                    error: `Method ${method} not allowed`
                });
        }
    } catch (error) {
        console.error('API key management error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    } finally {
        await prisma.$disconnect();
    }
}
