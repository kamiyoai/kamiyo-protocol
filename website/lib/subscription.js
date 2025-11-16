// lib/subscription.js
/**
 * Get subscription status for a user by email
 * Current valid tiers: free, pro, team, enterprise
 */
export async function getSubscriptionStatus(email) {
    if (!email) {
        return {
            isSubscribed: false,
            tier: 'free',
        };
    }

    try {
        // Fetch from the API route
        const res = await fetch(`/api/subscription/status?email=${encodeURIComponent(email)}`);

        if (!res.ok) {
            console.error("Failed to fetch subscription status.");
            return { isSubscribed: false, tier: 'free' };
        }

        return await res.json();
    } catch (error) {
        console.error("Subscription fetch error:", error);
        return { isSubscribed: false, tier: 'free' };
    }
}

/**
 * Get API rate limits for a tier
 * Returns { daily: number, minute: number }
 */
export function getTierLimits(tier) {
    const limits = {
        free: { daily: 1000, minute: 10, historical_days: 7, alerts: 'unlimited' },
        pro: { daily: 50000, minute: 35, historical_days: 90, alerts: 'unlimited' },
        team: { daily: 100000, minute: 70, historical_days: 365, alerts: 'unlimited' },
        enterprise: { daily: 999999, minute: 1000, historical_days: 730, alerts: 'unlimited' }
    };
    return limits[tier] || limits.free;
}
