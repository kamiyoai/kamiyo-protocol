// pages/api/payment/checkout.js
import stripe from "../../../lib/stripe";

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

    const { plan, userId } = req.query;
    if (!plan) return res.status(400).json({ error: "Missing plan parameter" });
    if (!userId) return res.status(400).json({ error: "Missing userId parameter" });

    // Current valid subscription tiers for KAMIYO exploit intelligence platform
    const plans = {
        pro: { price: process.env.STRIPE_PRICE_PRO, name: "Pro", mode: "subscription" },
        team: { price: process.env.STRIPE_PRICE_TEAM, name: "Team", mode: "subscription" },
        enterprise: { price: process.env.STRIPE_PRICE_ENTERPRISE, name: "Enterprise", mode: "subscription" },
    };

    if (!plans[plan]) {
        console.error(`Invalid plan requested: ${plan}`);
        return res.status(400).json({ error: "Invalid plan. Valid plans: pro, team, enterprise" });
    }

    if (!plans[plan].price) {
        console.error(`Stripe price ID not configured for plan: ${plan}`);
        return res.status(500).json({ error: `Stripe price not configured for ${plan} tier` });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{
                price: plans[plan].price,
                quantity: 1,
            }],
            mode: plans[plan].mode,
            success_url: `${process.env.NEXT_PUBLIC_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing`,
            client_reference_id: userId,
            metadata: {
                tier: plan,
                userId: userId
            },
        });

        console.log(`[Checkout] Created session for user ${userId}, tier: ${plan}`);
        res.redirect(303, session.url);
    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}
