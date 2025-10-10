// pages/api/health.js
import { getHealthStats } from "../../lib/exploitDb";

export default async function handler(req, res) {
    try {
        // Get REAL health stats from the exploit intelligence database
        const data = getHealthStats();
        res.status(200).json(data);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({ error: 'Service unavailable', details: error.message });
    }
}
