/**
 * KAMIYO Helius Adapter - Connection Pool
 * Manages multiple RPC connections with health checks and failover
 */

import { Connection, Commitment } from '@solana/web3.js';
import { ConnectionPoolConfig, ConnectionError } from './types';
import { DEFAULTS, HELIUS_ENDPOINTS } from './constants';

interface PooledConnection {
    connection: Connection;
    endpoint: string;
    healthy: boolean;
    lastCheck: number;
    latency: number;
    errorCount: number;
}

export class ConnectionPool {
    private connections: PooledConnection[] = [];
    private currentIndex = 0;
    private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
    private readonly config: Required<ConnectionPoolConfig>;
    private readonly apiKey: string;
    private readonly cluster: 'mainnet-beta' | 'devnet';
    private readonly commitment: Commitment;
    private initialized = false;
    private initializing = false;

    constructor(
        apiKey: string,
        cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta',
        commitment: Commitment = 'confirmed',
        config: ConnectionPoolConfig = {}
    ) {
        this.apiKey = apiKey;
        this.cluster = cluster;
        this.commitment = commitment;
        this.config = {
            maxConnections: config.maxConnections ?? DEFAULTS.MAX_CONNECTIONS,
            healthCheckIntervalMs: config.healthCheckIntervalMs ?? DEFAULTS.HEALTH_CHECK_INTERVAL_MS,
            connectionTimeoutMs: config.connectionTimeoutMs ?? DEFAULTS.CONNECTION_TIMEOUT_MS
        };
    }

    /**
     * Initialize the connection pool
     */
    async init(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (this.initializing) {
            throw new ConnectionError('Pool initialization already in progress');
        }

        this.initializing = true;

        try {
            const baseEndpoint = HELIUS_ENDPOINTS[this.cluster];
            const endpoints = this.generateEndpoints(baseEndpoint);

            for (const endpoint of endpoints) {
                const connection = new Connection(endpoint, {
                    commitment: this.commitment,
                    confirmTransactionInitialTimeout: this.config.connectionTimeoutMs
                });

                this.connections.push({
                    connection,
                    endpoint,
                    healthy: false,
                    lastCheck: 0,
                    latency: Infinity,
                    errorCount: 0
                });
            }

            // Initial health check
            await this.performHealthChecks();

            // Verify at least one connection is healthy
            const healthyCount = this.connections.filter(c => c.healthy).length;
            if (healthyCount === 0) {
                throw new ConnectionError('No healthy connections available after initialization');
            }

            // Start periodic health checks
            this.healthCheckInterval = setInterval(
                () => this.performHealthChecks(),
                this.config.healthCheckIntervalMs
            );

            this.initialized = true;
        } catch (error) {
            // Cleanup on failure
            this.connections = [];
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            throw error instanceof ConnectionError
                ? error
                : new ConnectionError(
                    `Pool initialization failed: ${error instanceof Error ? error.message : String(error)}`,
                    error instanceof Error ? error : undefined
                );
        } finally {
            this.initializing = false;
        }
    }

    /**
     * Generate multiple endpoints for connection diversity
     */
    private generateEndpoints(baseEndpoint: string): string[] {
        const endpoints: string[] = [];

        // Primary endpoint with API key
        endpoints.push(`${baseEndpoint}/?api-key=${this.apiKey}`);

        // Add redundant endpoints for failover
        if (this.config.maxConnections > 1) {
            endpoints.push(`${baseEndpoint}/?api-key=${this.apiKey}`);
        }

        if (this.config.maxConnections > 2 && this.cluster === 'mainnet-beta') {
            // Fallback to public endpoint (rate limited)
            endpoints.push('https://api.mainnet-beta.solana.com');
        }

        return endpoints.slice(0, this.config.maxConnections);
    }

    /**
     * Perform health checks on all connections
     */
    private async performHealthChecks(): Promise<void> {
        const checks = this.connections.map(async (pooled) => {
            const start = Date.now();
            try {
                await Promise.race([
                    pooled.connection.getLatestBlockhash(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Health check timeout')), 5000)
                    )
                ]);

                pooled.healthy = true;
                pooled.latency = Date.now() - start;
                pooled.lastCheck = Date.now();
                pooled.errorCount = 0;
            } catch {
                pooled.healthy = false;
                pooled.latency = Infinity;
                pooled.lastCheck = Date.now();
                pooled.errorCount++;
            }
        });

        await Promise.allSettled(checks);
        this.sortConnectionsByLatency();
    }

    /**
     * Sort connections by latency for optimal selection
     */
    private sortConnectionsByLatency(): void {
        this.connections.sort((a, b) => {
            if (a.healthy && !b.healthy) return -1;
            if (!a.healthy && b.healthy) return 1;
            return a.latency - b.latency;
        });
    }

    /**
     * Get the best available connection
     */
    getConnection(): Connection {
        if (!this.initialized) {
            throw new ConnectionError('Pool not initialized. Call init() first.');
        }

        const healthy = this.connections.filter(c => c.healthy);

        if (healthy.length === 0) {
            // If no healthy connections, try the first one anyway
            if (this.connections.length > 0) {
                return this.connections[0].connection;
            }
            throw new ConnectionError('No connections available in pool');
        }

        // Round-robin among healthy connections
        const connection = healthy[this.currentIndex % healthy.length];
        this.currentIndex = (this.currentIndex + 1) % healthy.length;

        return connection.connection;
    }

    /**
     * Execute a function with automatic retry and failover
     */
    async execute<T>(
        fn: (connection: Connection) => Promise<T>,
        maxRetries: number = DEFAULTS.MAX_RETRIES
    ): Promise<T> {
        let lastError: Error | null = null;
        const tried = new Set<string>();

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const healthy = this.connections.filter(
                c => c.healthy && !tried.has(c.endpoint)
            );

            if (healthy.length === 0) {
                // Reset tried set and try again
                tried.clear();
            }

            const pooled = healthy[0] || this.connections[attempt % this.connections.length];
            tried.add(pooled.endpoint);

            try {
                const result = await fn(pooled.connection);
                pooled.errorCount = 0;
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                pooled.errorCount++;

                if (pooled.errorCount >= 3) {
                    pooled.healthy = false;
                }

                // Wait before retry with exponential backoff
                if (attempt < maxRetries - 1) {
                    await this.delay(DEFAULTS.RETRY_DELAY_MS * Math.pow(2, attempt));
                }
            }
        }

        throw new ConnectionError(
            `All connection attempts failed after ${maxRetries} retries`,
            lastError ?? undefined
        );
    }

    /**
     * Report an error for a specific connection
     */
    reportError(connection: Connection): void {
        const pooled = this.connections.find(c => c.connection === connection);
        if (pooled) {
            pooled.errorCount++;
            if (pooled.errorCount >= 3) {
                pooled.healthy = false;
            }
        }
    }

    /**
     * Get pool statistics
     */
    getStats(): {
        total: number;
        healthy: number;
        avgLatency: number;
        connections: Array<{
            endpoint: string;
            healthy: boolean;
            latency: number;
            errorCount: number;
        }>;
    } {
        const healthy = this.connections.filter(c => c.healthy);
        const avgLatency = healthy.length > 0
            ? healthy.reduce((sum, c) => sum + c.latency, 0) / healthy.length
            : Infinity;

        return {
            total: this.connections.length,
            healthy: healthy.length,
            avgLatency,
            connections: this.connections.map(c => ({
                endpoint: c.endpoint.replace(/api-key=[^&]+/, 'api-key=***'),
                healthy: c.healthy,
                latency: c.latency,
                errorCount: c.errorCount
            }))
        };
    }

    /**
     * Check if pool is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Shutdown the connection pool
     */
    shutdown(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.connections = [];
        this.initialized = false;
        this.currentIndex = 0;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
