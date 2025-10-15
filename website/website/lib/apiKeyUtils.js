/**
 * API Key Utilities
 * Helper functions for API key generation and management
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Generate a secure API key
 * Format: kmy_<64 random hex characters>
 */
export function generateApiKey() {
    return 'kmy_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Auto-generate API key for new user
 * Should be called after user signup
 *
 * @param {string} userId - The user's ID
 * @returns {Promise<Object>} The created API key
 */
export async function createDefaultApiKey(userId) {
    try {
        const apiKey = generateApiKey();

        const createdKey = await prisma.apiKey.create({
            data: {
                userId,
                key: apiKey,
                name: 'Default API Key',
                status: 'active'
            }
        });

        console.log(`✅ Auto-generated API key for user ${userId}`);

        return createdKey;
    } catch (error) {
        console.error(`❌ Failed to create default API key for user ${userId}:`, error);
        throw error;
    }
}

/**
 * Hash API key for secure storage (if needed)
 * Note: Currently we store keys in plain text for simplicity,
 * but this function can be used to store hashed keys instead
 *
 * @param {string} key - The API key to hash
 * @returns {string} Hashed key
 */
export function hashApiKey(key) {
    return crypto
        .createHash('sha256')
        .update(key)
        .digest('hex');
}

/**
 * Validate API key format
 *
 * @param {string} key - The API key to validate
 * @returns {boolean} True if valid format
 */
export function isValidApiKeyFormat(key) {
    // Must start with kmy_ followed by 64 hex characters
    return /^kmy_[a-f0-9]{64}$/.test(key);
}

/**
 * Get user by API key
 * Used for authentication in API requests
 *
 * @param {string} key - The API key
 * @returns {Promise<Object|null>} User object if found
 */
export async function getUserByApiKey(key) {
    try {
        // Validate format first
        if (!isValidApiKeyFormat(key)) {
            return null;
        }

        const apiKey = await prisma.apiKey.findUnique({
            where: {
                key,
                status: 'active'
            },
            include: {
                user: {
                    include: {
                        subscriptions: {
                            where: {
                                status: 'active'
                            },
                            orderBy: {
                                createdAt: 'desc'
                            },
                            take: 1
                        }
                    }
                }
            }
        });

        if (!apiKey) {
            return null;
        }

        // Update last used timestamp
        await prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { lastUsedAt: new Date() }
        });

        return apiKey.user;
    } catch (error) {
        console.error('Error getting user by API key:', error);
        return null;
    }
}

/**
 * Cleanup: Close Prisma connection
 */
export async function disconnectPrisma() {
    await prisma.$disconnect();
}
