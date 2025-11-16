// lib/apiKeyHash.js
// Secure API key hashing using bcrypt
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Generate a new random API key
 * Format: kam_live_[32 random hex characters]
 */
export function generateApiKey() {
    const randomPart = randomBytes(16).toString('hex');
    return `kam_live_${randomPart}`;
}

/**
 * Hash an API key for secure storage
 * @param {string} apiKey - Plain text API key
 * @returns {Promise<string>} - Hashed API key
 */
export async function hashApiKey(apiKey) {
    return await bcrypt.hash(apiKey, SALT_ROUNDS);
}

/**
 * Verify an API key against a stored hash
 * @param {string} providedKey - Plain text API key from request
 * @param {string} storedHash - Hashed API key from database
 * @returns {Promise<boolean>} - True if key matches
 */
export async function verifyApiKey(providedKey, storedHash) {
    try {
        return await bcrypt.compare(providedKey, storedHash);
    } catch (error) {
        console.error('API key verification error:', error);
        return false;
    }
}

/**
 * Check if a string is already a bcrypt hash
 * @param {string} str - String to check
 * @returns {boolean} - True if it's a bcrypt hash
 */
export function isBcryptHash(str) {
    // Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters long
    return /^\$2[ayb]\$.{56}$/.test(str);
}
