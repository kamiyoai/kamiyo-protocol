// pages/api/payment/check-subscription.js
import Stripe from "stripe";
import prisma from "../../../lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

export default async function handler(req, res) {
    if (req.method !== "GET") {
        console.error(`[Check Subscription API] Invalid request method: ${req.method}`);
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { email } = req.query;
        if (!email) {
            console.error("[Check Subscription API] Missing email parameter in request.");
            return res.status(400).json({ error: "Missing email parameter" });
        }

        console.log(`[Check Subscription API] Checking Stripe customer for email: ${email}`);
        const customers = await stripe.customers.list({ email });

        if (!customers.data.length) {
            console.warn(`[Check Subscription API] No Stripe customer found for email: ${email}`);
            return res.status(200).json({ isActive: false, tier: "ephemeral" });
        }

        const customerId = customers.data[0].id;
        console.log(`[Check Subscription API] Found Stripe customer ID: ${customerId}`);

        const subscriptions = await stripe.subscriptions.list({ customer: customerId });
        const activeSubscription = subscriptions.data.some(sub => sub.status === "active");

        console.log(`[Check Subscription API] Active subscription: ${activeSubscription}`);

        console.log(`[Check Subscription API] Fetching user and subscription tier from PostgreSQL for email: ${email}`);
        // Find user by email to get userId
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true }, // Only need userId
        });

        if (!user) {
            console.warn(`[Check Subscription API] No user found for email: ${email}`);
            return res.status(200).json({ isActive: activeSubscription, tier: "ephemeral" });
        }

        let tier = "ephemeral"; // Default if no active subscription or tier missing
        if (activeSubscription) {
            const subscription = await prisma.subscription.findFirst({
                where: { userId: user.id },
                select: { tier: true },
            });
            tier = subscription?.tier || "ephemeral";
        }

        console.log(`[Check Subscription API] Subscription check complete. { isActive: ${activeSubscription}, tier: ${tier} }`);

        return res.status(200).json({
            isActive: activeSubscription,
            tier,
        });

    } catch (error) {
        console.error(`[Check Subscription API] Subscription Check Error: ${error.message}`, error.stack); // Enhanced logging
        return res.status(500).json({ error: "Internal Server Error", isActive: false, tier: "ephemeral" });
    }
}