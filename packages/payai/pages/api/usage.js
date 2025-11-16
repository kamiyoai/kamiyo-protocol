// pages/api/usage.js
import prisma from "../../lib/prisma";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        // Find user
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Get usage stats from ApiRequest table (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Format as YYYY-MM-DD string (date field is stored as string)
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

        const requests = await prisma.apiRequest.findMany({
            where: {
                userId: user.id,
                date: {
                    gte: sevenDaysAgoStr,
                },
            },
            select: {
                endpoint: true,
                timestamp: true,
            },
            orderBy: {
                timestamp: 'desc',
            },
        });

        // Calculate statistics
        const totalRequests = requests.length;
        const dailyAverage = Math.round(totalRequests / 7);
        const recentActivity = requests.slice(0, 10);

        // For x402 payments, we'd need to query the x402 payment tables
        // For now, return 0 as placeholder
        const totalPayments = 0;
        const totalUSDC = 0;

        return res.status(200).json({
            totalRequests,
            totalPayments,
            totalUSDC,
            dailyAverage,
            recentActivity,
        });

    } catch (error) {
        console.error(`[Usage API] Error: ${error.message}`, error.stack);
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}
