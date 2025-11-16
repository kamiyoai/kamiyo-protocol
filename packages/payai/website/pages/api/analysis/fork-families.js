// pages/api/analysis/fork-families.js
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { email, chain, min_similarity, limit } = req.query;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        // Get user from database
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                apiKeys: {
                    where: { status: 'active' },
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if user has an active API key
        if (!user.apiKeys || user.apiKeys.length === 0) {
            return res.status(401).json({ error: "No active API key found. Please generate an API key in your dashboard." });
        }

        const apiKey = user.apiKeys[0].key;

        // Build query params for backend API
        const params = new URLSearchParams();
        if (chain && chain !== 'all') {
            params.append('chain', chain);
        }
        if (min_similarity) {
            params.append('min_similarity', min_similarity);
        }
        if (limit) {
            params.append('limit', limit);
        }

        // Forward request to FastAPI backend with authentication
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const backendUrl = `${apiUrl}/api/v2/analysis/fork-families${params.toString() ? '?' + params.toString() : ''}`;

        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Backend API error: ${response.status} ${errorText}`);
            return res.status(response.status).json({
                error: "Backend API request failed",
                details: errorText,
                status: response.status
            });
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error(`Fork families API error: ${error.message}`, error);
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}
