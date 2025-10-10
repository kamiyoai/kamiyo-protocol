// pages/api/subscription/status.js
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        console.error(`[Subscription API] Invalid request method: ${req.method}`);
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { email } = req.query;
    if (!email) {
        console.error("[Subscription API] Missing email parameter in request.");
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        console.log(`[Subscription API] Checking user existence for email: ${email}`);
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, subscriptionStatus: true },
        });

        if (!user) {
            console.warn(`[Subscription API] User not found: ${email}`);
            return res.status(404).json({ error: "User not found", isSubscribed: false, kamiCount: 0 });
        }

        const userId = user.id;
        const subscriptionStatus = user.subscriptionStatus;

        console.log(`[Subscription API] Fetching subscription details for user ID: ${userId}`);
        const subscription = await prisma.subscription.findFirst({
            where: { userId },
            select: { tier: true },
        });

        let isActive = subscriptionStatus !== "free"; // Determine if user is subscribed based on schema
        let tier = "ephemeral"; // Default tier if not explicitly set

        if (subscription?.tier) {
            tier = subscription.tier;
            isActive = true; // Override `isActive` if subscription exists
        }

        console.log(`[Subscription API] Subscription found: { isActive: ${isActive}, tier: ${tier} }`);

        console.log(`[Subscription API] Fetching Kami count for user ID: ${userId}`);
        const kamiCount = await prisma.kami.count({
            where: { userId },
        });

        console.log(`[Subscription API] Subscription check complete. { isSubscribed: ${isActive}, tier: ${tier}, kamiCount: ${kamiCount} }`);

        return res.status(200).json({
            isSubscribed: isActive,
            tier,
            canSummonPersistent: ["guide", "architect", "creator"].includes(tier),
            canCustomize: ["architect", "creator"].includes(tier),
            hasNFT: tier === "creator",
            kamiCount,
        });

    } catch (error) {
        console.error(`[Subscription API] Database query error: ${error.message}`, error.stack); // Enhanced logging
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}