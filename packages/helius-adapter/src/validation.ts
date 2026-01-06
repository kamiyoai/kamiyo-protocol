/**
 * KAMIYO Helius Adapter - Input Validation
 * Validates inputs to prevent injection and resource exhaustion
 */

import { PublicKey } from '@solana/web3.js';
import { HeliusAdapterError } from './types';
import { LIMITS } from './constants';

export class ValidationError extends HeliusAdapterError {
    constructor(message: string) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

/**
 * Validate API key format
 */
export function validateApiKey(apiKey: string): void {
    if (!apiKey || typeof apiKey !== 'string') {
        throw new ValidationError('API key is required');
    }

    if (apiKey.length > LIMITS.MAX_API_KEY_LENGTH) {
        throw new ValidationError(`API key exceeds maximum length of ${LIMITS.MAX_API_KEY_LENGTH}`);
    }

    // Basic format check - alphanumeric and hyphens
    if (!/^[a-zA-Z0-9-_]+$/.test(apiKey)) {
        throw new ValidationError('API key contains invalid characters');
    }
}

/**
 * Validate transaction ID format
 */
export function validateTransactionId(txId: string): void {
    if (!txId || typeof txId !== 'string') {
        throw new ValidationError('Transaction ID is required');
    }

    if (txId.length > LIMITS.MAX_TRANSACTION_ID_LENGTH) {
        throw new ValidationError(`Transaction ID exceeds maximum length of ${LIMITS.MAX_TRANSACTION_ID_LENGTH}`);
    }

    if (txId.length === 0) {
        throw new ValidationError('Transaction ID cannot be empty');
    }
}

/**
 * Validate signature format (base58)
 */
export function validateSignature(signature: string): void {
    if (!signature || typeof signature !== 'string') {
        throw new ValidationError('Signature is required');
    }

    // Solana signatures are 88 characters base58
    if (signature.length < 80 || signature.length > 90) {
        throw new ValidationError('Invalid signature format');
    }

    // Base58 character set
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(signature)) {
        throw new ValidationError('Signature contains invalid characters');
    }
}

/**
 * Validate array of signatures
 */
export function validateSignatures(signatures: string[]): void {
    if (!Array.isArray(signatures)) {
        throw new ValidationError('Signatures must be an array');
    }

    if (signatures.length === 0) {
        throw new ValidationError('At least one signature is required');
    }

    if (signatures.length > LIMITS.MAX_SIGNATURES_BATCH) {
        throw new ValidationError(`Signatures batch exceeds maximum of ${LIMITS.MAX_SIGNATURES_BATCH}`);
    }

    signatures.forEach((sig, i) => {
        try {
            validateSignature(sig);
        } catch (error) {
            throw new ValidationError(`Invalid signature at index ${i}: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}

/**
 * Validate PublicKey
 */
export function validatePublicKey(key: PublicKey | string, name: string = 'Public key'): PublicKey {
    try {
        const pubkey = typeof key === 'string' ? new PublicKey(key) : key;
        // Verify it's on curve (valid key)
        pubkey.toBase58();
        return pubkey;
    } catch {
        throw new ValidationError(`${name} is not a valid Solana public key`);
    }
}

/**
 * Validate array of PublicKeys
 */
export function validatePublicKeys(keys: PublicKey[], name: string = 'Public keys'): void {
    if (!Array.isArray(keys)) {
        throw new ValidationError(`${name} must be an array`);
    }

    if (keys.length > LIMITS.MAX_ACCOUNTS_BATCH) {
        throw new ValidationError(`${name} batch exceeds maximum of ${LIMITS.MAX_ACCOUNTS_BATCH}`);
    }

    keys.forEach((key, i) => {
        validatePublicKey(key, `${name}[${i}]`);
    });
}

/**
 * Validate numeric value within range
 */
export function validateNumber(
    value: number,
    name: string,
    min: number,
    max: number
): void {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new ValidationError(`${name} must be a number`);
    }

    if (value < min || value > max) {
        throw new ValidationError(`${name} must be between ${min} and ${max}`);
    }
}

/**
 * Validate positive integer
 */
export function validatePositiveInteger(value: number, name: string): void {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new ValidationError(`${name} must be a number`);
    }

    if (!Number.isInteger(value) || value <= 0) {
        throw new ValidationError(`${name} must be a positive integer`);
    }
}

/**
 * Validate configuration object
 */
export function validateConfig(config: {
    apiKey: string;
    maxRetries?: number;
    retryDelayMs?: number;
    rateLimitRps?: number;
}): void {
    validateApiKey(config.apiKey);

    if (config.maxRetries !== undefined) {
        validateNumber(config.maxRetries, 'maxRetries', LIMITS.MIN_RETRIES, LIMITS.MAX_RETRIES);
    }

    if (config.retryDelayMs !== undefined) {
        validateNumber(config.retryDelayMs, 'retryDelayMs', 100, 30000);
    }

    if (config.rateLimitRps !== undefined) {
        validateNumber(config.rateLimitRps, 'rateLimitRps', LIMITS.MIN_RATE_LIMIT, LIMITS.MAX_RATE_LIMIT);
    }
}
