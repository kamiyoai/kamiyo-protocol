// lib/db.js
// PostgreSQL connection pool configuration
// This replaces single-connection patterns with production-grade pooling

import { Pool } from 'pg';

let pool = null;

/**
 * Get or create PostgreSQL connection pool
 * Implements connection pooling for production scalability
 */
export function getPool() {
    if (!pool) {
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {
            throw new Error('DATABASE_URL environment variable is not set');
        }

        // Parse connection string or use individual config
        const config = databaseUrl.startsWith('postgresql://')
            ? { connectionString: databaseUrl }
            : {
                host: process.env.POSTGRES_HOST || 'localhost',
                port: parseInt(process.env.POSTGRES_PORT || '5432'),
                database: process.env.POSTGRES_DB || 'kamiyo_exploits',
                user: process.env.POSTGRES_USER || 'postgres',
                password: process.env.POSTGRES_PASSWORD,
            };

        pool = new Pool({
            ...config,

            // Connection pool settings
            max: parseInt(process.env.DB_POOL_SIZE || '20'),        // Maximum connections
            min: parseInt(process.env.DB_POOL_MIN || '5'),          // Minimum connections
            idleTimeoutMillis: 30000,                                // Close idle connections after 30s
            connectionTimeoutMillis: 2000,                           // Timeout acquiring connection

            // Application settings
            application_name: 'kamiyo-web',

            // Connection health checks
            allowExitOnIdle: false,                                  // Keep pool alive
        });

        // Handle pool errors
        pool.on('error', (err, client) => {
            console.error('Unexpected error on idle PostgreSQL client', err);
        });

        // Log pool statistics in development
        if (process.env.NODE_ENV === 'development') {
            pool.on('connect', () => {
                console.log('[PostgreSQL] New client connected. Total:', pool.totalCount, 'Idle:', pool.idleCount);
            });

            pool.on('remove', () => {
                console.log('[PostgreSQL] Client removed. Total:', pool.totalCount, 'Idle:', pool.idleCount);
            });
        }

        console.log('[PostgreSQL] Connection pool initialized');
        console.log(`  Max connections: ${pool.options.max}`);
        console.log(`  Min connections: ${pool.options.min}`);
    }

    return pool;
}

/**
 * Execute a query with automatic connection management
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
export async function query(text, params) {
    const start = Date.now();
    const pool = getPool();

    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;

        if (process.env.LOG_QUERIES === 'true') {
            console.log('[Query]', { text, duration, rows: result.rowCount });
        }

        return result;
    } catch (error) {
        console.error('[Query Error]', { text, error: error.message });
        throw error;
    }
}

/**
 * Get a client from the pool for transactions
 * Remember to release it!
 * @returns {Promise<PoolClient>}
 */
export async function getClient() {
    const pool = getPool();
    return await pool.connect();
}

/**
 * Gracefully close the connection pool
 * Call this on application shutdown
 */
export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('[PostgreSQL] Connection pool closed');
    }
}

/**
 * Get pool statistics
 * Useful for monitoring and debugging
 */
export function getPoolStats() {
    if (!pool) {
        return { status: 'not_initialized' };
    }

    return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: pool.options.max,
        min: pool.options.min,
    };
}

// Handle graceful shutdown
if (typeof process !== 'undefined') {
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, closing database pool...');
        await closePool();
    });

    process.on('SIGINT', async () => {
        console.log('SIGINT received, closing database pool...');
        await closePool();
    });
}

export default {
    getPool,
    query,
    getClient,
    closePool,
    getPoolStats,
};
