// pages/api/payment/checkout.js
import { stripe } from "../../../lib/stripe";
import { summonEphemeralKami } from "../../../lib/tee.mjs";
import { generateKami } from "../../../utils/generateKami";

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

    const { plan, userId } = req.query;
    if (!plan) return res.status(400).json({ error: "Missing plan parameter" });
    if (plan === "ephemeral" && !userId) return res.status(400).json({ error: "Missing userId for Ephemeral plan" });

    const plans = {
        ephemeral: { price: "price_1QxbPCCvpzIkQ1SiyoLog8eD", name: "Ephemeral", mode: "payment" },
        guide: { price: "price_1QvxV4CvpzIkQ1SiOVQgGqHy", name: "Guide Subscription", mode: "subscription" },
        architect: { price: "price_1QvxeuCvpzIkQ1SiZOJLlFOb", name: "Architect Subscription", mode: "subscription" },
        creator: { price: "price_1Qvxh7CvpzIkQ1SiBPPKQUp7", name: "Creator Subscription", mode: "subscription" },
    };

    if (!plans[plan]) return res.status(400).json({ error: "Invalid plan" });

    try {
        let workerId, attestation;

        if (plan === "ephemeral") {
            // Generate dynamic Kami data for ephemeral plan
            const dynamicKami = await generateKami({ id: userId });
            if (!dynamicKami) {
                throw new Error("Failed to generate Kami data");
            }

            // Create complete character template
            const characterTemplate = {
                name: dynamicKami.title,
                japanese: dynamicKami.japanese || "神",
                id: dynamicKami.id,
                image: dynamicKami.image || "https://example.com/default-image.png",
                createdAt: new Date().toISOString(),
                userId,
                bio: [
                    `You are ${dynamicKami.title}, a unique Ephemeral Kami, born from the primordial sea of chaos, offering guidance with ancient wisdom and a modern, stoic view of existence.`
                ],
                // Add the rest of the character template (adjectives, topics, style, etc.)
                // as in the create.js file for consistency
                modelProvider: "openai",
                clients: ["direct"]
            };

            // Summon TEE worker for Ephemeral plan
            const teeData = await summonEphemeralKami(userId, JSON.stringify(characterTemplate));
            workerId = teeData.workerId;
            attestation = teeData.attestation;
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{
                price: plans[plan].price,
                quantity: 1,
            }],
            mode: plans[plan].mode,
            success_url: `${process.env.NEXT_PUBLIC_URL}/kami/summon?session_id={CHECKOUT_SESSION_ID}${plan === "ephemeral" ? `&workerId=${workerId}&attestation=${encodeURIComponent(attestation)}` : ""}`,
            cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing`,
            metadata: { tier: plan },
        });

        res.redirect(303, session.url);
    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}