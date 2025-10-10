// lib/subscription.js
export async function getSubscriptionStatus(email) {
    if (!email) {
        return {
            isSubscribed: false,
            tier: null,
            canSummonPersistent: false,
            canCustomize: false,
            hasNFT: false,
            kamiCount: 0,
        };
    }

    try {
        // ✅ Fetch from the new API route instead of using Prisma
        const res = await fetch(`/api/subscription/status?email=${email}`);

        if (!res.ok) {
            console.error("Failed to fetch subscription status.");
            return { isSubscribed: false, kamiCount: 0 };
        }

        return await res.json();
    } catch (error) {
        console.error("Subscription fetch error:", error);
        return { isSubscribed: false, kamiCount: 0 };
    }
}

export function getSummonLimit(tier) {
    const limits = {
        ephemeral: 1,
        guide: 1,
        architect: 3,
        creator: Infinity
    };
    return limits[tier] || 1; // Default to 1 if tier is missing
}
