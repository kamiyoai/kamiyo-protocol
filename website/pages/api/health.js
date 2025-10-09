// pages/api/health.js
/**
 * Kubernetes-style health check endpoint for Render monitoring
 * Returns 200 OK if service is healthy
 */

export default async function handler(req, res) {
    try {
        // Check if FastAPI backend is reachable
        const API_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(`${API_URL}/health`, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return res.status(503).json({
                status: 'unhealthy',
                service: 'frontend',
                backend: 'unreachable',
                timestamp: new Date().toISOString()
            });
        }

        // Frontend is healthy and backend is reachable
        return res.status(200).json({
            status: 'healthy',
            service: 'frontend',
            backend: 'connected',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        // If backend check fails, frontend might still be operational
        console.error('Health check error:', error.message);

        return res.status(200).json({
            status: 'degraded',
            service: 'frontend',
            backend: 'disconnected',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
