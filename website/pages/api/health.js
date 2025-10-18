// pages/api/health.js
import { withRateLimit } from "../../lib/rateLimit";

async function handler(req, res) {
    const API_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

    try {
        // Fetch health stats from FastAPI backend
        const response = await fetch(`${API_URL}/health`);

        if (!response.ok) {
            throw new Error(`Backend health check failed: ${response.status}`);
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            error: 'Service unavailable',
            details: error.message,
            // Fallback data for display purposes
            database_exploits: 433,
            tracked_chains: 55,
            active_sources: 18,
            total_sources: 18  // Updated: 18 aggregators (Twitter monitors 42 accounts)
        });
    }
}

export default withRateLimit(handler);
