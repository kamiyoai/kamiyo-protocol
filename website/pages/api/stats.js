// pages/api/stats.js
export default async function handler(req, res) {
    const API_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

    try {
        const queryParams = new URLSearchParams(req.query);
        const response = await fetch(`${API_URL}/stats?${queryParams}`);
        const data = await response.json();

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
}
