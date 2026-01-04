// pages/api/health.js

export default async function handler(req, res) {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
}
