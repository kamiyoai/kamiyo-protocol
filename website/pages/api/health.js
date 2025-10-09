// pages/api/health.js
export default async function handler(req, res) {
    const API_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching health:', error.message);
        res.status(500).json({ error: 'Failed to fetch health status' });
    }
}
