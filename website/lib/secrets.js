// lib/secrets.js
// Utility for reading Docker secrets with fallback to environment variables
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Read a secret from Docker secrets or environment variable
 * Priority: Docker secret file > Environment variable > Default value
 *
 * @param {string} name - Secret name (e.g., 'db_password')
 * @param {string} defaultValue - Default value if secret not found
 * @returns {string} - Secret value
 */
export function getSecret(name, defaultValue = null) {
    // 1. Try Docker secret file (production)
    const secretFile = process.env[`${name.toUpperCase()}_FILE`];
    if (secretFile) {
        try {
            const secretPath = resolve(secretFile);
            const secret = readFileSync(secretPath, 'utf8').trim();
            if (secret) {
                console.log(`[Secrets] Loaded ${name} from Docker secret file`);
                return secret;
            }
        } catch (error) {
            console.warn(`[Secrets] Failed to read ${name} from file: ${error.message}`);
        }
    }

    // 2. Try /run/secrets/ directory (Docker swarm secrets)
    try {
        const dockerSecretPath = `/run/secrets/${name}`;
        const secret = readFileSync(dockerSecretPath, 'utf8').trim();
        if (secret) {
            console.log(`[Secrets] Loaded ${name} from /run/secrets/`);
            return secret;
        }
    } catch (error) {
        // File doesn't exist, continue to next method
    }

    // 3. Try environment variable (development/fallback)
    const envVar = process.env[name.toUpperCase()];
    if (envVar) {
        console.log(`[Secrets] Loaded ${name} from environment variable`);
        return envVar;
    }

    // 4. Use default value
    if (defaultValue !== null) {
        console.warn(`[Secrets] Using default value for ${name}`);
        return defaultValue;
    }

    // 5. Throw error if no secret found and no default
    throw new Error(`Secret '${name}' not found in Docker secrets or environment variables`);
}

/**
 * Get all required secrets for the application
 * Throws error if any required secret is missing
 */
export function getAllSecrets() {
    const secrets = {};

    // Required secrets
    try {
        secrets.databaseUrl = getSecret('database_url');
        secrets.jwtSecret = getSecret('jwt_secret');
        secrets.nextauthSecret = getSecret('nextauth_secret');
    } catch (error) {
        console.error(`[Secrets] Missing required secret: ${error.message}`);
        throw error;
    }

    // Optional secrets (with fallbacks)
    secrets.stripeSecret = getSecret('stripe_secret', '');
    secrets.stripeWebhookSecret = getSecret('stripe_webhook_secret', '');
    secrets.googleClientSecret = getSecret('google_client_secret', '');
    secrets.sentryDsn = getSecret('sentry_dsn', '');

    return secrets;
}

/**
 * Validate that all required secrets are present
 * Call this at application startup
 */
export function validateSecrets() {
    console.log('[Secrets] Validating secrets...');

    const required = [
        'database_url',
        'jwt_secret',
        'nextauth_secret',
    ];

    const missing = [];

    for (const name of required) {
        try {
            getSecret(name);
        } catch (error) {
            missing.push(name);
        }
    }

    if (missing.length > 0) {
        throw new Error(`Missing required secrets: ${missing.join(', ')}`);
    }

    console.log('[Secrets] ✅ All required secrets validated');
    return true;
}

export default {
    getSecret,
    getAllSecrets,
    validateSecrets,
};
