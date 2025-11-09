// pages/api/stats.js
import { getSession } from "next-auth/react";
import prisma from "../../lib/prisma";
import { withRateLimit } from "../../lib/rateLimit";
import { getStats } from "../../lib/exploitDb";

async function handler(req, res) {
    const API_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

    try {
        // Check authentication
        const session = await getSession({ req });

        let tier = 'free';
        let applyDelay = true;

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
                // Only free tier gets delayed data
                applyDelay = tier === 'free';
            }
        }

        // Get stats from the exploit intelligence database
        const days = parseInt(req.query.days) || 7;
        let data;

        try {
            data = getStats(days);
            // Add metadata about the data source
            data.metadata = {
                source: 'exploit-database',
                query_time: new Date().toISOString()
            };
        } catch (dbError) {
            console.error('Database not available, using placeholder data:', dbError.message);
            // Return placeholder data when database is unavailable
            data = {
                total_exploits: 0,
                total_loss_usd: 0,
                period_exploits: 0,
                period_days: days,
                average_per_day: 0,
                chains_tracked: 0,
                metadata: {
                    source: 'placeholder',
                    query_time: new Date().toISOString(),
                    note: 'Database unavailable - showing placeholder data'
                }
            };
        }

        // Apply 24-hour delay for free tier statistics
        if (applyDelay && data) {
            // Add metadata indicating delayed data
            data.metadata = {
                ...data.metadata,
                tier,
                delayed: true,
                delay_hours: 24,
                note: 'Statistics calculated from 24-hour delayed data'
            };
        } else if (data) {
            data.metadata = {
                ...data.metadata,
                tier,
                delayed: false
            };
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
}

export default withRateLimit(handler);
