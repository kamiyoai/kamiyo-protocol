// pages/api/billing/create-checkout-session.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import stripe from "../../../lib/stripe";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        // Get session to verify user is authenticated
        const session = await getServerSession(req, res, authOptions);

        const { tier, user_email, success_url, cancel_url } = req.body;

        // Validate required fields
        if (!tier) {
            return res.status(400).json({ error: "Missing tier parameter" });
        }

        // Use session email if available, otherwise fall back to provided email
        const customerEmail = session?.user?.email || user_email;

        if (!customerEmail) {
            return res.status(400).json({ error: "User email required" });
        }

        // Map tier names to Stripe price IDs
        const priceMap = {
            personal: process.env.STRIPE_PRICE_PERSONAL,
            team: process.env.STRIPE_PRICE_TEAM,
            enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
        };

        const priceId = priceMap[tier];

        if (!priceId) {
            console.error(`Invalid tier requested: ${tier}`);
            return res.status(400).json({
                error: "Invalid tier. Valid tiers: personal, team, enterprise"
            });
        }

        // Create Stripe Checkout Session
        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "subscription",
            success_url: success_url || `${process.env.NEXT_PUBLIC_URL}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancel_url || `${process.env.NEXT_PUBLIC_URL}/pricing`,
            customer_email: customerEmail,
            metadata: {
                tier: tier,
                user_email: customerEmail,
            },
        });

        console.log(`[Billing] Created checkout session for ${customerEmail}, tier: ${tier}`);

        return res.status(200).json({
            checkout_url: checkoutSession.url,
            session_id: checkoutSession.id,
        });

    } catch (error) {
        console.error("[Billing] Checkout session creation error:", error);
        return res.status(500).json({
            error: "Failed to create checkout session",
            details: error.message
        });
    }
}
