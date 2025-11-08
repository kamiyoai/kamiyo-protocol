// pages/api/v1/x402/health.js
import prisma from '../../../../lib/prisma';
import errorTracker from '../../../../lib/x402-saas/sentry-config.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        checks: {},
        recentErrors: errorTracker.getRecentErrors().length
    };

    // Database check with timeout
    try {
        await Promise.race([
            prisma.$queryRaw`SELECT 1`,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Database timeout')), 5000)
            )
        ]);
        health.checks.database = {
            status: 'healthy',
            latency_ms: await measureDatabaseLatency()
        };
    } catch (error) {
        health.status = 'unhealthy';
        health.checks.database = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Python verifier check
    try {
        const verifierHealth = await checkPythonVerifier();
        health.checks.verifier = verifierHealth;
    } catch (error) {
        health.status = 'degraded';
        health.checks.verifier = {
            status: 'unhealthy',
            error: error.message
        };
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    return res.status(statusCode).json(health);
}

async function measureDatabaseLatency() {
    const start = Date.now();
    await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database timeout')), 5000)
        )
    ]);
    return Date.now() - start;
}

async function checkPythonVerifier() {
    const verifierUrl = process.env.PYTHON_VERIFIER_URL || 'http://localhost:8000';

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`${verifierUrl}/health`, {
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
            return {
                status: 'healthy',
                mode: 'http_api',
                endpoint: verifierUrl
            };
        }
    } catch (error) {
        return {
            status: 'degraded',
            mode: 'http_api',
            error: error.message,
            endpoint: verifierUrl
        };
    }

    return {
        status: 'unhealthy',
        mode: 'http_api',
        endpoint: verifierUrl
    };
}
