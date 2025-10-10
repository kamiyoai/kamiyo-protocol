// pages/api/chains.js
import { getSession } from "next-auth/react";
import prisma from "../../lib/prisma";

export default async function handler(req, res) {
    const API_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

    try {
        // Check authentication for tracking purposes
        const session = await getSession({ req });

        let tier = 'free';

        // If user is authenticated, fetch their subscription tier
        if (session?.user?.email) {
            const user = await prisma.user.findUnique({
                where: { email: session.user.email },
                select: { id: true },
            });

            if (user) {
                const subscription = await prisma.subscription.findFirst({
                    where: {
                        userId: user.id,
                        status: 'active'
                    },
                    select: { tier: true },
                    orderBy: { createdAt: 'desc' },
                });

                tier = subscription?.tier || 'free';
            }
        }

        // Fetch chains list from backend API
        const response = await fetch(`${API_URL}/chains`);
        const data = await response.json();

        // Add metadata for tracking
        if (data) {
            data.metadata = {
                ...data.metadata,
                tier
            };
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching chains:', error);
        res.status(500).json({ error: 'Failed to fetch chains' });
    }
}
