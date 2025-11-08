// pages/api/v1/x402/health.js
import prisma from '../../../../lib/prisma';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        checks: {}
    };

    // Database check
    try {
        await prisma.$queryRaw`SELECT 1`;
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
    await prisma.$queryRaw`SELECT 1`;
    return Date.now() - start;
}

async function checkPythonVerifier() {
    try {
        // Try HTTP API first
        const response = await fetch('http://localhost:8000/health', {
            timeout: 2000
        });

        if (response.ok) {
            return {
                status: 'healthy',
                mode: 'http_api',
                endpoint: 'http://localhost:8000'
            };
        }
    } catch (error) {
        // HTTP API not available, check if direct execution is possible
        return {
            status: 'degraded',
            mode: 'direct_execution',
            note: 'HTTP API unavailable, using direct execution fallback'
        };
    }

    return {
        status: 'healthy',
        mode: 'direct_execution'
    };
}
