// pages/api/db-stats.js
// Database connection pool statistics endpoint
// Useful for monitoring connection health in production

import { getPoolStats } from '../../lib/db';
import { withRateLimit } from "../../lib/rateLimit";

async function handler(req, res) {
    try {
        const stats = getPoolStats();

        // Calculate utilization percentage
        const utilization = stats.total && stats.max
            ? Math.round((stats.total / stats.max) * 100)
            : 0;

        const health = {
            status: stats.status === 'not_initialized' ? 'not_running' : 'healthy',
            pool: stats,
            utilization: `${utilization}%`,
            warnings: [],
        };

        // Add warnings for potential issues
        if (stats.waiting > 5) {
            health.warnings.push(`High wait queue: ${stats.waiting} queries waiting for connections`);
        }

        if (utilization > 80) {
            health.warnings.push(`High pool utilization: ${utilization}% - consider increasing max connections`);
        }

        if (stats.idle === 0 && stats.total > 0) {
            health.warnings.push('No idle connections - all connections busy');
        }

        res.status(200).json(health);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
        });
    }
}

export default withRateLimit(handler);
