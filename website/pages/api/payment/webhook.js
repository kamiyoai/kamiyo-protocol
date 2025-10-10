import Stripe from "stripe";
import postgresql from "../../../lib/prisma";
import { buffer } from "micro";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

export const config = { api: { bodyParser: false } }; // Required for Stripe raw event processing

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const sig = req.headers["stripe-signature"];
    let event;

    try {
        const rawBody = await buffer(req);
        event = stripe.webhooks.constructEvent(rawBody.toString(), sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return res.status(400).json({ error: "Webhook signature verification failed" });
    }

    console.log("Received webhook event:", event.type);

    try {
        switch (event.type) {
            case "customer.subscription.updated":
            case "customer.subscription.created":
                await handleSubscriptionUpdate(event.data.object);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionCancel(event.data.object);
                break;
            default:
                console.log("Unhandled event type:", event.type);
        }
    } catch (error) {
        console.error("Webhook processing error:", error);
        return res.status(500).json({ error: "Webhook processing failed" });
    }

    res.status(200).json({ received: true });
}

// --- Handler functions ---

async function handleSubscriptionUpdate(subscription) {
    const customerId = subscription.customer;
    const tier = subscription.items.data[0]?.plan?.metadata?.tier || "basic";
    const status = subscription.status; // "active", "past_due", "canceled", etc.

    const user = await postgresql.user.findUnique({
        where: { customerId },
        select: { id: true, email: true },
    });

    if (!user) {
        console.warn("No user found for customerId:", customerId);
        return;
    }

    // Update or create subscription in Subscription table
    await postgresql.subscription.upsert({
        where: {
            userId: user.id,
        },
        update: {
            tier,
            status,
            updatedAt: new Date(),
        },
        create: {
            userId: user.id,
            tier,
            status,
        },
    });

    console.log("Updated subscription for", user.email, "- status:", status, "tier:", tier);
}

async function handleSubscriptionCancel(subscription) {
    const customerId = subscription.customer;

    const user = await postgresql.user.findUnique({
        where: { customerId },
        select: { id: true, email: true },
    });

    if (!user) {
        console.warn("No user found for customerId:", customerId);
        return;
    }

    // Update subscription status to canceled
    await postgresql.subscription.updateMany({
        where: { userId: user.id },
        data: {
            status: "canceled",
            updatedAt: new Date(),
        },
    });

    console.log("Subscription canceled for", user.email);
}
